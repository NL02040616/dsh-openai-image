import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { PROVIDER, commandDraft, commandRequest, validateRequest } from './core.js';
import { recoverRequest, recoveryIssues } from './recovery.js';

// The marker is durable message metadata; it is never a hidden prompt prefix.
export function installOneShot(ctx, config) {
  const requests = new WeakMap();
  const selections = new WeakMap();
  const admitting = new WeakSet();
  const busy = agent => admitting.has(agent) || agent.status !== 'idle' || agent.inbox.nextTurn.length || agent.inbox.nextStep.length;
  const restoreSelection = agent => {
    const saved = selections.get(agent);
    if (!saved) return;
    selections.delete(agent);
    const current = agent.model.current();
    if (current?.provider === PROVIDER && current.model === saved.imageModel) agent.model.select(saved.previous);
  };
  ctx.on('agent/turn-stopping', async ({ agent }) => restoreSelection(agent));
  // Preparation failures and cancellation can bypass turn-stopping.
  ctx.on('agent/status', ({ agent, status }) => { if (status === 'idle') restoreSelection(agent); });
  ctx.on('agent/pre-step', async (event, next) => {
    const decision = await next();
    const previous = requests.get(event.agent);
    requests.delete(event.agent);
    if (decision.kind !== 'enter') return decision;
    const message = decision.messages.findLast(item => item.source?.kind === 'user' && item.source.openaiImage?.version === 1);
    if (message) requests.set(event.agent, { turn: event.turn, step: event.step, model: message.source.openaiImage.model });
    else if (previous?.turn === event.turn && !decision.messages.some(item => item.source?.kind === 'user')) {
      // A failed/denied tool gets a local final reply, never a chat-model retry.
      requests.set(event.agent, { ...previous, step: event.step });
    }
    return decision;
  }, { prepend: true });
  ctx.on('agent/request', async (event, next) => {
    const resolved = await next();
    const request = requests.get(event.agent);
    if (!request || request.turn !== event.turn || request.step !== event.step) return resolved;
    // 0.2.2 fixes the route before prompt/tool preparation. The command selects
    // it before followup; changing it in agent/request is now explicitly illegal.
    if (event.agent.model?.select) return resolved;
    if (!request.preservedSelection) {
      // Desktop sessions otherwise adopt the last request header as their next
      // model. Pin the current chat intent before recording the image header.
      // Use the controller's current value so a concurrent user choice wins.
      const controller = ctx.get('sessionController')?.agents;
      const selected = controller?.selectionFor(event.agent).current;
      if (selected) controller.selectForNextRequest(event.agent, { ...selected });
      request.preservedSelection = true;
    }
    // Route this request only. Never change the session's selected chat model.
    const { reasoningEffort, maxTokens, ...rest } = resolved;
    return { ...rest, provider: PROVIDER, model: request.model };
  }, { prepend: true });
  ctx.inject(['commands'], scope => {
    const enqueue = (agent, request, attachments, draft) => {
      if (agent.model?.select) {
        const previous = agent.model.current();
        if (!previous) return { kind: 'error', text: '请先选择聊天模型，再开始画图。' };
        selections.set(agent, { previous, imageModel: request.model });
        agent.model.select({ provider: PROVIDER, model: request.model });
      }
      try {
        agent.followup(createUserMessage({
          content: [{ type: 'text', text: request.prompt }, ...attachments],
          source: { kind: 'user', openaiImage: { version: 1, model: request.model, quality: request.quality, size: request.size, draft } },
        }));
      } catch (error) { restoreSelection(agent); throw error; }
      return { kind: 'success' };
    };
    scope.commands.register({
      name: 'image-recover', description: '读取指定画图记录的提示词、参数和有序参考图，不生成图片',
      input: { hint: '画图记录 ID' }, recordInput: false,
      handler: ({ agent, rawInput }) => ({ kind: 'success', text: JSON.stringify(recoverRequest(agent.session.log, rawInput.trim())) }),
    });
    scope.commands.register({
      name: 'image-retry', description: '按指定画图记录的原参数和参考图重新生成一次图片（会计费）',
      input: { hint: '画图记录 ID' }, recordInput: false,
      handler: async ({ agent, rawInput, signal }) => {
        signal?.throwIfAborted();
        if (busy(agent)) return { kind: 'error', text: '请等待当前回复完成后再画图。' };
        admitting.add(agent);
        try {
          const saved = recoverRequest(agent.session.log, rawInput.trim());
          const issues = recoveryIssues(saved);
          if (issues.length) return { kind: 'error', text: `${issues.join('；')}。请先重新编辑并补全，未发送生图请求。` };
          // Pin the recorded effective size. Re-evaluating the prompt or current
          // defaults here would make a retry a different request.
          const request = validateRequest({ prompt: saved.prompt, model: saved.model, quality: saved.quality, size: saved.size, sizeMode: 'manual' }, config);
          for (const [index, reference] of saved.references.entries()) {
            try { await ctx.attachments.readImage(reference, signal); }
            catch { signal?.throwIfAborted(); return { kind: 'error', text: `参考图 ${index + 1} 已不可读取，请重新编辑并补充。未发送生图请求。` }; }
          }
          signal?.throwIfAborted();
          if (agent.status !== 'idle' || agent.inbox.nextTurn.length || agent.inbox.nextStep.length) return { kind: 'error', text: '会话已有新请求，请等待完成后再重试。' };
          return enqueue(agent, request, saved.references.map(attachment => ({ type: 'image', attachment })), saved.draft ?? { prompt: saved.prompt, size: saved.size, sizeMode: 'manual' });
        } finally { admitting.delete(agent); }
      },
    });
    scope.commands.register({
      name: 'image',
      description: '本次画图：生成新图片，或修改输入框中附带的参考图',
      input: { hint: '描述画面或修改要求', attachments: true },
      recordInput: false,
      handler: ({ agent, rawInput, attachments, signal }) => {
        signal?.throwIfAborted();
        if (busy(agent)) {
          return { kind: 'error', text: '请等待当前回复完成后再画图。描述和参考图已保留。' };
        }
        if (attachments.some(block => block.type !== 'image')) {
          return { kind: 'error', text: '画图仅支持 PNG、JPEG、WebP 图片，请移除其他文件。' };
        }
        if (attachments.length > 16 || attachments.some(block => !['image/png', 'image/jpeg', 'image/webp'].includes(block.attachment.mediaType))) {
          return { kind: 'error', text: '请使用不超过 16 张 PNG、JPEG 或 WebP 参考图。' };
        }
        const request = commandRequest(rawInput, config);
        return enqueue(agent, request, attachments, commandDraft(rawInput, config));
      },
    });
  });
}

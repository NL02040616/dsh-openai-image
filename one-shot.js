import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { PROVIDER, commandRequest } from './core.js';

// The marker is durable message metadata; it is never a hidden prompt prefix.
export function installOneShot(ctx, config) {
  const requests = new WeakMap();
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
    scope.commands.register({
      name: 'image',
      description: '本次画图：生成新图片，或修改输入框中附带的参考图',
      input: { hint: '描述画面或修改要求', attachments: true },
      recordInput: false,
      handler: ({ agent, rawInput, attachments, signal }) => {
        signal?.throwIfAborted();
        if (agent.status !== 'idle' || agent.inbox.nextTurn.length || agent.inbox.nextStep.length) {
          return { kind: 'error', text: '请等待当前回复完成后再画图。描述和参考图已保留。' };
        }
        if (attachments.some(block => block.type !== 'image')) {
          return { kind: 'error', text: '画图仅支持 PNG、JPEG、WebP 图片，请移除其他文件。' };
        }
        if (attachments.length > 16 || attachments.some(block => !['image/png', 'image/jpeg', 'image/webp'].includes(block.attachment.mediaType))) {
          return { kind: 'error', text: '请使用不超过 16 张 PNG、JPEG 或 WebP 参考图。' };
        }
        const request = commandRequest(rawInput, config);
        agent.followup(createUserMessage({
          content: [{ type: 'text', text: request.prompt }, ...attachments],
          source: { kind: 'user', openaiImage: { version: 1, model: request.model, quality: request.quality, size: request.size } },
        }));
        return { kind: 'success' };
      },
    });
  });
}

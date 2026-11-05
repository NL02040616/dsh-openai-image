import { randomUUID } from 'node:crypto';
import z from '@deepseek-ai/schemastery';
import { LlmAdapter, LlmError, attributionHeaders, resolveRetryPolicy } from '@deepseek-ai/dsh-llm';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { ImageGenerationError, MODELS, PROVIDER, QUALITIES, SIZES, generateImage, isTitleRequest, referenceImages, requestFromMessages, textChunks } from './core.js';
import { installOneShot } from './one-shot.js';
import { createImageFetch } from './transport.js';

export const name = 'local-openai-image';
export const inject = ['llm', 'credentials', 'attachments', 'tools'];
export const Config = z.object({
  apiKeyEnv: z.string().default('OPENAI_API_KEY'),
  defaultModel: z.union(MODELS.map(model => z.const(model.id))).default('gpt-image-2.5-flare'),
  quality: z.union(QUALITIES.map(value => z.const(value))).default('medium'),
  size: z.union(SIZES.map(value => z.const(value))).default('1024x1024'),
  timeoutMs: z.number().step(1).min(1000).max(600000).default(300000),
  networkMode: z.union(['auto', 'system', 'host'].map(value => z.const(value))).default('auto').description('网络：auto 保留 DSH 代理环境变量，否则在 Windows 跟随系统代理/PAC；system 强制跟随 Windows；host 沿用 DSH。'),
  proxyUrl: z.string().default('').description('可选：仅本插件使用的 http://主机:端口。使用公司 PAC 时留空，不填脚本地址、账号或密码。'),
  proxyUseDefaultCredentials: z.boolean().default(false).description('仅当公司 IT 要求时启用：使用当前 Windows 账号认证代理。不会用该账号登录 OpenAI。'),
});

export function apply(ctx, config) {
  installOneShot(ctx, config);
  const fetchImpl = createImageFetch(config);
  const ref = credentialRef(config.apiKeyEnv);
  const lifetime = new AbortController();
  const isImageCall = exec => exec.callId?.startsWith('openai_image_') && exec.agent?.session.requestHeader()?.config.provider === PROVIDER;
  const finishImageCall = (exec, value) => {
    if (isImageCall(exec)) exec.concludeTurn();
    return value;
  };
  ctx.effect(() => () => lifetime.abort(new Error('OpenAI 生图插件已停用。')));

  const generate = async (args, signal, references = []) => {
    try {
      return await generateImage({
        args, config, references, fetchImpl,
        signal: signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal,
        resolveKey: async () => (await ctx.credentials.resolve(ref))?.value,
        saveImage: input => ctx.attachments.saveImage(input),
        readImage: (image, signal) => ctx.attachments.readImage(image, signal),
        headers: attributionHeaders(),
      });
    } catch (error) {
      if (error instanceof ImageGenerationError) {
        throw new LlmError(error.message, error.code, error.status ? { status: error.status } : undefined);
      }
      throw error;
    }
  };

  class ImageAdapter extends LlmAdapter {
    providerInfo(provider) {
      return { id: provider, name: 'OpenAI 生图' };
    }
    providerRetryPolicy() {
      return resolveRetryPolicy({ mode: 'normal', maxRetries: 0 }, 'openai-image.retry');
    }
    async listModels(provider = PROVIDER) {
      return MODELS.map(model => ({ ...model, provider, inputModalities: ['text', 'image'] }));
    }
    async resolveModel(provider, id) {
      const model = MODELS.find(item => item.id === id);
      if (!model) throw new LlmError(`未知生图模型：${id}`, 'UNKNOWN_MODEL');
      return { ...model, provider, inputModalities: ['text', 'image'] };
    }
    async *stream(options) {
      // Titles use the selected route too; they must never create paid images.
      if (isTitleRequest(options.messages)) {
        yield* textChunks('图片创作');
        yield { type: 'finish', reason: { kind: 'stop' } };
        return;
      }
      if (!options.sessionId) {
        throw new LlmError('生图模型仅用于对话中的图片生成。后台摘要等文本任务请使用聊天模型。', 'INVALID_REQUEST');
      }
      const latestUser = options.messages.findLastIndex(message => message.role === 'user' && message.source?.kind === 'user');
      const completed = options.messages.slice(latestUser + 1).findLast(message => message.role === 'tool' && message.source?.callId?.startsWith('openai_image_'));
      if (completed) {
        yield* textChunks(completed.isError ? '本次画图未完成，请查看上方错误。不会自动重试。' : '图片已保存，可点击图片下方的“继续修改”。');
        yield { type: 'finish', reason: { kind: 'stop' } };
        return;
      }
      const { prompt, references } = requestFromMessages(options.messages);
      const toolName = references.length ? 'openai_edit_image' : 'openai_generate_image';
      if (!options.tools?.some(tool => tool.name === toolName)) {
        throw new LlmError('当前对话未开放画图工具。请在普通对话中使用，并允许 OpenAI 生图工具。', 'INVALID_REQUEST');
      }
      // Use native tool results: chat adapters accept their images as history.
      yield { type: 'block-end', index: 0, block: {
        type: 'tool-call', id: `openai_image_${randomUUID().replaceAll('-', '')}`,
        name: toolName, arguments: JSON.stringify({ prompt, model: options.model }),
      } };
      yield { type: 'finish', reason: { kind: 'tool-calls' } };
    }
  }
  ctx.llm.registerAdapter([PROVIDER], new ImageAdapter());

  const parameters = {
    prompt: { type: 'string', required: true, description: 'Complete description of the desired image, including style and any exact text.' },
    model: { type: 'string', enum: MODELS.map(item => item.id), description: 'Optional image model; defaults to GPT Image 2.5 Flare.' },
    size: { type: 'string', enum: SIZES, description: 'Optional dimensions. New images default to 1024x1024; edits follow the first reference orientation. 1536x1024 is landscape; 1024x1536 is portrait.' },
    quality: { type: 'string', enum: QUALITIES, description: 'Optional quality. Default medium. Use low for previews or high when requested.' },
  };
  const output = {
    schema: { type: 'json' },
    render: (_args, value) => [
      { type: 'text', text: `图片已${value.operation === 'edit' ? `编辑（参考 ${value.referenceCount} 张）` : '生成'}：${value.model}，${value.size}，${value.quality}。图片已保存为对话附件。` },
      { type: 'image', attachment: value.attachment },
    ],
  };
  ctx.tools.register(defineTool({
    name: 'openai_generate_image',
    description: 'Generate one NEW image from a text description using OpenAI API credits. Returns the actual image saved in the conversation. For edits, variations, or creation based on uploaded/reference images, use openai_edit_image instead.',
    parameters,
    output,
    timeoutMs: config.timeoutMs + 30000,
    isConcurrencySafe: () => false,
    execute: async (args, exec) => finishImageCall(exec, await generate(args, exec.signal)),
  }));
  ctx.tools.register(defineTool({
    name: 'openai_edit_image',
    description: 'Edit or combine reference images using OpenAI API credits. Use when the user uploads images and describes changes, asks to modify the previous image, or requests a new composition based on references. Automatically uses images attached to the latest user message; otherwise the most recent image result or user upload in this conversation. Do not ask for file paths or image IDs. Describe what to change and what to preserve. Returns the edited image as a conversation attachment.',
    parameters: { ...parameters, prompt: { type: 'string', required: true, description: 'Requested changes and constraints to preserve. For multiple uploaded images, refer to their upload order.' } },
    output,
    timeoutMs: config.timeoutMs + 30000,
    isConcurrencySafe: () => false,
    execute: async (args, exec) => {
      const messages = exec.agent?.session?.deriveMessages() ?? [];
      const references = isImageCall(exec) ? requestFromMessages(messages).references : referenceImages(messages);
      if (!references.length) throw new LlmError('当前对话中没有可编辑的参考图，请先上传 PNG、JPEG 或 WebP 图片。', 'INVALID_REQUEST');
      return finishImageCall(exec, await generate(args, exec.signal, references));
    },
  }));
}

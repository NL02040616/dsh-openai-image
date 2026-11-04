import z from '@deepseek-ai/schemastery';
import { LlmAdapter, LlmError, attributionHeaders, resolveRetryPolicy } from '@deepseek-ai/dsh-llm';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { ImageGenerationError, MODELS, PROVIDER, QUALITIES, SIZES, generateImage, isTitleRequest, referenceImages, requestFromMessages, textChunks } from './core.js';

export const name = 'local-openai-image';
export const inject = ['llm', 'credentials', 'attachments', 'tools'];
export const Config = z.object({
  apiKeyEnv: z.string().default('OPENAI_API_KEY'),
  defaultModel: z.union(MODELS.map(model => z.const(model.id))).default('gpt-image-2.5-flare'),
  quality: z.union(QUALITIES.map(value => z.const(value))).default('medium'),
  size: z.union(SIZES.map(value => z.const(value))).default('1024x1024'),
  timeoutMs: z.number().step(1).min(1000).max(600000).default(300000),
});

export function apply(ctx, config) {
  const ref = credentialRef(config.apiKeyEnv);
  const lifetime = new AbortController();
  ctx.effect(() => () => lifetime.abort(new Error('OpenAI 生图插件已停用。')));

  const generate = async (args, signal, references = []) => {
    try {
      return await generateImage({
        args, config, references,
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
      const { prompt, references } = requestFromMessages(options.messages);
      const result = await generate({ prompt, model: options.model }, options.signal, references);
      yield* textChunks(`${result.operation === 'edit' ? `已编辑图片（参考 ${result.referenceCount} 张）` : '已生成图片'} · ${result.model} · ${result.size}`);
      yield { type: 'block-end', index: 1, block: { type: 'image', attachment: result.attachment } };
      yield { type: 'usage', usage: result.usage };
      yield { type: 'finish', reason: { kind: 'stop' } };
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
    execute: (args, exec) => generate(args, exec.signal),
  }));
  ctx.tools.register(defineTool({
    name: 'openai_edit_image',
    description: 'Edit or combine reference images using OpenAI API credits. Use when the user uploads images and describes changes, asks to modify the previous image, or requests a new composition based on references. Automatically uses images attached to the latest user message; otherwise the most recent image result or user upload in this conversation. Do not ask for file paths or image IDs. Describe what to change and what to preserve. Returns the edited image as a conversation attachment.',
    parameters: { ...parameters, prompt: { type: 'string', required: true, description: 'Requested changes and constraints to preserve. For multiple uploaded images, refer to their upload order.' } },
    output,
    timeoutMs: config.timeoutMs + 30000,
    isConcurrencySafe: () => false,
    execute: (args, exec) => {
      const references = referenceImages(exec.agent?.session?.deriveMessages() ?? []);
      if (!references.length) throw new LlmError('当前对话中没有可编辑的参考图，请先上传 PNG、JPEG 或 WebP 图片。', 'INVALID_REQUEST');
      return generate(args, exec.signal, references);
    },
  }));
}

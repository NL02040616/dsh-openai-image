export const PROVIDER = 'openai-image';
export const MODELS = Object.freeze([
  { id: 'gpt-image-2.5-flare', name: 'GPT Image 2.5 Flare · 生图', description: '速度优先，适合日常创作和快速迭代；支持参考图编辑与主体保留。' },
  { id: 'gpt-image-2.5-sunburst', name: 'GPT Image 2.5 Sunburst · 生图', description: '质量优先，适合复杂画面和精细修改；支持参考图编辑与主体保留。' },
  { id: 'gpt-image-1-mini', name: 'GPT Image 1 Mini · 生图', description: 'GPT Image 1 的经济型版本，支持生图和改图；仅支持低输入保真度。官方已标记弃用。' },
]);
export const SIZES = ['1024x1024', '1536x1024', '1024x1536'];
export const QUALITIES = ['low', 'medium', 'high'];
const API_ROOT = 'https://api.openai.com/v1/images/';
const NEW_IMAGE_PREFIX = /^(?:新建图片\s*[:：]\s*|\/new(?:\s+|$))/i;

export class ImageGenerationError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = 'ImageGenerationError';
    this.code = code;
    this.status = status;
  }
}

export function validateRequest(args, defaults) {
  const prompt = typeof args.prompt === 'string' ? args.prompt.trim() : '';
  if (!prompt || prompt.length > 32000) {
    throw new ImageGenerationError('请输入 1–32000 字符的图片描述。', 'INVALID_REQUEST');
  }
  const model = args.model ?? defaults.defaultModel;
  const quality = args.quality ?? defaults.quality;
  const size = args.size ?? defaults.size;
  if (!MODELS.some(item => item.id === model)) {
    throw new ImageGenerationError(`不支持的生图模型：${model}`, 'UNKNOWN_MODEL');
  }
  if (!QUALITIES.includes(quality) || !SIZES.includes(size)) {
    throw new ImageGenerationError('图片画质或尺寸无效。', 'INVALID_REQUEST');
  }
  return { model, prompt, quality, size, n: 1, output_format: 'png' };
}

export function promptFromMessages(messages) {
  const message = messages.findLast(item => item.role === 'user' && item.source?.kind === 'user');
  if (!message) {
    throw new ImageGenerationError('没有找到用户的图片描述。请在普通对话中输入想生成的画面。', 'INVALID_REQUEST');
  }
  return message.content.filter(block => block.type === 'text').map(block => block.text).join('\n').trim();
}

export function isTitleRequest(messages) {
  return messages.some(message => message.source?.kind === 'dsh-session-title-llm');
}

/** Only user uploads and this plugin's visible results in the current session. */
export function referenceImages(messages) {
  const imageTools = new Set();
  for (const message of messages) {
    if (message.role !== 'assistant' || message.source?.kind !== 'model') continue;
    for (const block of message.content) {
      if (block.type === 'tool-call' && ['openai_generate_image', 'openai_edit_image'].includes(block.name)) imageTools.add(block.id);
    }
  }
  const images = message => [...new Map(message.content
    .filter(block => block.type === 'image' && block.attachment?.attachmentId)
    .map(block => [block.attachment.attachmentId, block.attachment])).values()];
  const current = messages.findLast(message => message.role === 'user' && message.source?.kind === 'user');
  if (current && images(current).length) return images(current);
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    const eligible = (message.role === 'user' && message.source?.kind === 'user')
      || (message.role === 'assistant' && message.source?.kind === 'model' && message.source.provider === PROVIDER)
      || (message.role === 'tool' && message.source?.kind === 'tool' && !message.isError && imageTools.has(message.source.callId));
    if (!eligible) continue;
    const refs = images(message);
    if (refs.length) return refs;
    // Do not reuse an older reference after an explicit new-image boundary.
    if (message.role === 'user' && NEW_IMAGE_PREFIX.test(message.content.filter(block => block.type === 'text').map(block => block.text).join('\n').trim())) break;
  }
  return [];
}

export function requestFromMessages(messages) {
  const prompt = promptFromMessages(messages);
  const current = messages.findLast(item => item.role === 'user' && item.source?.kind === 'user');
  if (current?.source.openaiImage?.version === 1) {
    return { prompt, references: current.content.filter(block => block.type === 'image').map(block => block.attachment) };
  }
  return {
    prompt: prompt.replace(NEW_IMAGE_PREFIX, ''),
    references: NEW_IMAGE_PREFIX.test(prompt) ? [] : referenceImages(messages),
  };
}

function redact(message, key) {
  return String(message).replaceAll(key, '[REDACTED]').replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]').slice(0, 700);
}

function failureCode(status, apiCode) {
  if (status === 401 || status === 403) return 'AUTH';
  if (['insufficient_quota', 'credit_balance_exhausted', 'billing_hard_limit_reached'].includes(apiCode)) return 'QUOTA';
  if (status === 429) return 'RATE_LIMIT';
  if (status >= 500) return 'SERVER';
  return 'INVALID_REQUEST';
}

/** One generation or edit, without automatic retries or credential persistence. */
export async function generateImage({ args, config, references = [], resolveKey, readImage, saveImage, headers = {}, signal, fetchImpl = fetch }) {
  const first = references[0];
  const editSize = first && first.width > first.height ? '1536x1024' : first && first.height > first.width ? '1024x1536' : config.size;
  const body = validateRequest({ ...args, size: args.size ?? editSize }, config);
  signal?.throwIfAborted();
  if (references.length > 16) throw new ImageGenerationError('一次最多使用 16 张参考图，请减少本次上传的图片。', 'INVALID_REQUEST');
  if (references.length) {
    body.images = [];
    for (const reference of references) {
      signal?.throwIfAborted();
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(reference.mediaType)) {
        throw new ImageGenerationError('参考图请使用 PNG、JPEG 或 WebP 格式。', 'INVALID_REQUEST');
      }
      let input;
      try {
        input = await readImage(reference, signal);
      } catch (error) {
        if (signal?.aborted) throw signal.reason;
        throw new ImageGenerationError('无法读取对话中的参考图，请重新上传图片后重试。', 'INVALID_REQUEST');
      }
      signal?.throwIfAborted();
      const imageUrl = `data:${reference.mediaType};base64,${Buffer.from(input.data).toString('base64')}`;
      if (!input.data.byteLength || imageUrl.length > 20971520) {
        throw new ImageGenerationError('参考图为空或过大，请缩小图片后重新上传。', 'INVALID_REQUEST');
      }
      body.images.push({ image_url: imageUrl });
    }
  }
  const key = await resolveKey();
  if (!key) {
    throw new ImageGenerationError(`未配置 ${config.apiKeyEnv}。请在 DSH 的模型设置中配置 OpenAI API Key。`, 'MISSING_CREDENTIAL');
  }
  if (typeof key !== 'string' || /[\r\n]/.test(key)) {
    throw new ImageGenerationError('OpenAI API Key 格式无效。', 'INVALID_CREDENTIAL');
  }
  const timeout = AbortSignal.timeout(config.timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  combined.throwIfAborted();
  let payload;
  try {
    const response = await fetchImpl(API_ROOT + (references.length ? 'edits' : 'generations'), {
      method: 'POST',
      redirect: 'error',
      headers: { ...headers, 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: combined,
    });
    try {
      payload = await response.json();
    } catch {
      throw new ImageGenerationError(`图片接口或代理返回了无法解析的响应（HTTP ${response.status}）。请检查是否出现公司网络认证或拦截页面；没有自动重试。`, 'TRANSPORT', response.status);
    }
    if (!response.ok) {
      const code = failureCode(response.status, payload?.error?.code);
      const detail = redact(payload?.error?.message || `HTTP ${response.status}`, key);
      throw new ImageGenerationError(`OpenAI 生图失败：${detail}`, code, response.status);
    }
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    if (timeout.aborted) {
      throw new ImageGenerationError('生图请求超时。为避免重复扣费，没有自动重试；请先查看 OpenAI 用量再决定是否重试。', 'TIMEOUT');
    }
    if (error instanceof ImageGenerationError) throw error;
    throw new ImageGenerationError(`无法连接 OpenAI 生图接口：${redact(error?.message || error, key)}`, 'TRANSPORT');
  }
  signal?.throwIfAborted();
  const encoded = payload?.data?.[0]?.b64_json;
  if (typeof encoded !== 'string' || encoded.length > 48 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new ImageGenerationError('OpenAI 未返回有效的 PNG 图片。', 'INVALID_RESPONSE');
  }
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    throw new ImageGenerationError('OpenAI 返回的图片不是 PNG 格式。', 'INVALID_RESPONSE');
  }
  const attachment = await saveImage({ data: bytes, mediaType: 'image/png', name: `openai-${Date.now()}.png` });
  return {
    operation: references.length ? 'edit' : 'generate',
    referenceCount: references.length,
    model: body.model,
    size: body.size,
    quality: body.quality,
    attachment,
    usage: {
      inputTokens: payload.usage?.input_tokens ?? 0,
      outputTokens: payload.usage?.output_tokens ?? 0,
      totalTokens: payload.usage?.total_tokens ?? 0,
    },
  };
}

export function* textChunks(text, index = 0) {
  yield { type: 'block-start', index, blockType: 'text' };
  yield { type: 'text-delta', index, text };
  yield { type: 'block-end', index, block: { type: 'text', text } };
}

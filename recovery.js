import { imageRequest, referenceImages } from './core.js';

export const REQUEST_RECORD = 'plugin:openai-image/request';
const tools = new Set(['openai_generate_image', 'openai_edit_image']);
const imageTypes = ['image/png', 'image/jpeg', 'image/webp'];
const textOf = message => (message?.content ?? []).filter(part => part.type === 'text').map(part => part.text).join('\n');
// Persist attachment handles, never keys, proxy settings, image bytes or transient URLs.
function attachmentRecord(image) {
  return Object.fromEntries(['attachmentId', 'mediaType', 'width', 'height', 'bytes', 'name']
    .filter(key => image?.[key] !== undefined).map(key => [key, image[key]]));
}
export function requestSnapshot(args, config, references, operation, draft) {
  let request, issue;
  try { request = imageRequest(args, config, references); } catch (error) { issue = error.message; }
  return {
    version: 1, operation, prompt: request?.prompt ?? args.prompt ?? '', model: request?.model ?? args.model ?? config.defaultModel,
    quality: request?.quality ?? args.quality ?? config.quality, size: request?.size ?? args.size ?? config.size,
    draft: draft ?? { prompt: args.prompt ?? '', size: args.size ?? request?.size ?? config.size, sizeMode: args.size ? 'manual' : 'prompt' },
    references: references.map(attachmentRecord), issues: issue ? [issue] : [],
  };
}
export function recoveryIssues(request) {
  const issues = Array.isArray(request.issues) ? request.issues.filter(issue => typeof issue === 'string') : [];
  if (typeof request.prompt !== 'string' || !request.prompt.trim()) issues.push('原提示词未记录');
  for (const key of ['model', 'quality', 'size']) if (typeof request[key] !== 'string' || !request[key].trim()) issues.push(`原参数 ${key} 未记录`);
  if (!['generate', 'edit'].includes(request.operation)) issues.push('原请求类型未记录');
  if (!Array.isArray(request.references)) issues.push('原参考图列表未记录');
  else {
    if (request.references.length > 16) issues.push('参考图超过 16 张，请重新编辑并减少图片');
    request.references.forEach((image, index) => {
      if (!image?.attachmentId || !imageTypes.includes(image.mediaType)) issues.push(`参考图 ${index + 1} 信息不完整`);
    });
    if (request.operation === 'edit' && !request.references.length) issues.push('未找到原编辑请求的参考图');
  }
  return [...new Set(issues)];
}
export function recoverRequest(log, callId) {
  const callIndex = log.findIndex(event => event.type === 'tool/call' && event.data.callId === callId && tools.has(event.data.name));
  if (callIndex < 0) throw new Error('当前会话中找不到这次画图记录');
  const saved = log.findLast(event => event.type === REQUEST_RECORD && event.data.callId === callId)?.data.request;
  if (saved?.version === 1) return { ...saved, issues: recoveryIssues(saved) };
  // Only inspect messages BEFORE this call. Never substitute today's settings or later uploads.
  const call = log[callIndex];
  let args = {};
  try {
    const parsed = JSON.parse(call.data.arguments);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) args = parsed;
  } catch {}
  const messages = log.slice(0, callIndex).flatMap(event => event.type === 'user/message' ? [event.data]
    : ['assistant/message', 'tool/result'].includes(event.type) && event.data.message ? [event.data.message] : []);
  const user = messages.findLast(message => message.role === 'user' && message.source?.kind === 'user');
  const selection = callId.startsWith('openai_image_') && user?.source?.openaiImage?.version === 1 ? user.source.openaiImage : {};
  const operation = call.data.name === 'openai_edit_image' ? 'edit' : 'generate';
  const references = operation === 'generate' ? [] : selection.version === 1
    ? (user.content ?? []).filter(part => part.type === 'image').map(part => part.attachment)
    : referenceImages(messages);
  const request = { version: 1, operation, prompt: args.prompt ?? (selection.version === 1 ? textOf(user) : ''),
    model: args.model ?? selection.model, quality: args.quality ?? selection.quality, size: args.size ?? selection.size,
    references: references.map(attachmentRecord), draft: selection.draft ?? { sizeMode: 'manual', size: args.size ?? selection.size },
    issues: [], legacy: true };
  return { ...request, issues: recoveryIssues(request) };
}

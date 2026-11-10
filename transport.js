import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageGenerationError } from './core.js';

const PROXY_ENV = ['https_proxy', 'HTTPS_PROXY', 'all_proxy', 'ALL_PROXY', 'http_proxy', 'HTTP_PROXY'];
const MAX_OUTPUT = 64 * 1024 * 1024;
let helperSource;

export function transportMode(config, platform = process.platform, env = process.env) {
  const mode = config.networkMode ?? 'auto';
  if (!['auto', 'system', 'host'].includes(mode)) {
    throw new ImageGenerationError('网络模式无效，请选择 auto、system 或 host。', 'INVALID_REQUEST');
  }
  if (config.proxyUrl?.trim()) {
    let proxy;
    try { proxy = new URL(config.proxyUrl.trim()); } catch { /* Report without exposing the value. */ }
    if (!proxy || proxy.protocol !== 'http:' || proxy.username || proxy.password || proxy.pathname !== '/' || proxy.search || proxy.hash) {
      throw new ImageGenerationError('手动代理应为 http://主机:端口，不要填写 PAC 脚本、账号或密码。使用公司代理脚本时，请将 proxyUrl 留空并选择 system。', 'INVALID_REQUEST');
    }
    if (platform !== 'win32') throw new ImageGenerationError('手动代理通道目前仅支持 Windows；其他系统请使用 DSH 的代理配置。', 'INVALID_REQUEST');
    return 'manual';
  }
  if (mode === 'system' && platform !== 'win32') {
    throw new ImageGenerationError('系统代理通道目前仅支持 Windows。', 'INVALID_REQUEST');
  }
  if (mode === 'host') return 'host';
  if (mode === 'system') return 'system';
  // Preserve the host's installed dispatcher, including its NO_PROXY policy.
  return platform === 'win32' && !PROXY_ENV.some(name => env[name]?.trim()) ? 'system' : 'host';
}

const NETWORK_ERRORS = {
  PROXY_AUTH: '代理要求身份认证（HTTP 407）。请确认公司账号已登录；若 IT 要求 Windows 集成认证，可在插件配置启用 proxyUseDefaultCredentials。',
  PROXY_DENIED: '代理拒绝建立 HTTPS 隧道（HTTP 403）。请联系公司 IT 确认是否允许访问 api.openai.com:443。',
  TLS: 'HTTPS 证书验证失败。若公司代理检查 HTTPS，请联系 IT 确认公司根证书已正确安装；插件不会关闭证书验证。',
  DNS: '域名解析失败。请检查系统代理脚本能否加载，以及公司网络或 VPN 是否已连接。',
  CONNECT: '无法建立网络连接。请检查公司网络、VPN 和系统代理脚本；浏览器可访问其他网站不代表代理允许访问 api.openai.com。',
  TIMEOUT: '网络连接或响应超时。没有自动重试，请先查看 OpenAI 用量再决定是否重试。',
  TOO_LARGE: '接口响应过大，已停止读取。',
  TRANSPORT: 'Windows 网络请求失败。请检查公司代理是否允许访问 api.openai.com。',
};

function helperFailure() {
  return new ImageGenerationError('Windows 系统代理组件无法运行。请确认公司策略允许使用 Windows PowerShell；未自动改为直连。也可选择 host 并由 IT 配置 DSH 代理。', 'TRANSPORT');
}

/** One private child per request. No registry, environment, global agent or system policy writes. */
export async function windowsFetch(url, options, config, { spawnImpl = spawn } = {}) {
  options.signal?.throwIfAborted();
  helperSource ??= readFile(new URL('./windows-request.ps1', import.meta.url), 'utf8');
  const script = await helperSource;
  options.signal?.throwIfAborted();
  const executable = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const packet = {
    url, method: options.method, headers: options.headers, body: options.body,
    timeoutMs: config.timeoutMs,
    proxyUrl: config.proxyUrl?.trim() || '',
    proxyUseDefaultCredentials: config.proxyUseDefaultCredentials === true,
    maxResponseBytes: options.maxResponseBytes ?? 50 * 1024 * 1024,
  };
  const result = await new Promise((resolve, reject) => {
    let child;
    let finished = false;
    let length = 0;
    const chunks = [];
    let timer;
    const finish = (error, value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      if (error) child?.kill();
      error ? reject(error) : resolve(value);
    };
    const abort = () => finish(options.signal.reason);
    try {
      // Only static code is on the command line; keys and image data go through private stdin.
      child = spawnImpl(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
        windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch { finish(helperFailure()); return; }
    child.once('error', () => finish(helperFailure()));
    child.stderr.resume(); // Never return script diagnostics that could include request data.
    child.stdin.on('error', () => finish(helperFailure()));
    child.stdout.on('data', chunk => {
      length += chunk.length;
      if (length > Math.min(MAX_OUTPUT, packet.maxResponseBytes * 8 + 4096)) return finish(new ImageGenerationError(NETWORK_ERRORS.TOO_LARGE, 'TRANSPORT'));
      chunks.push(chunk);
    });
    child.once('close', code => {
      if (finished) return;
      if (code !== 0) return finish(helperFailure());
      try { finish(null, JSON.parse(Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/, ''))); }
      catch { finish(helperFailure()); }
    });
    options.signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => finish(new ImageGenerationError(NETWORK_ERRORS.TIMEOUT, 'TIMEOUT')), config.timeoutMs);
    if (options.signal?.aborted) abort();
    else child.stdin.end(JSON.stringify(packet));
  });
  if (result.error) {
    const code = Object.hasOwn(NETWORK_ERRORS, result.error) ? result.error : 'TRANSPORT';
    const route = result.route === 'proxy' ? '经代理：' : result.route === 'direct' ? '系统为该地址选择了直连：' : '';
    throw new ImageGenerationError(route + NETWORK_ERRORS[code], code === 'TIMEOUT' ? 'TIMEOUT' : 'TRANSPORT', result.status || undefined);
  }
  if (!Number.isInteger(result.status) || result.status < 100 || result.status > 599 || typeof result.body !== 'string') throw helperFailure();
  const manualUpdateRedirect = options.redirect === 'manual' && options.method === 'GET'
    && url === 'https://gitee.com/un-important/dsh-openai-image/raw/main/latest.json';
  if (result.status >= 300 && result.status < 400 && !manualUpdateRedirect) {
    throw new ImageGenerationError('接口返回了重定向，已停止请求。请检查代理登录页或网络认证；未转发 API Key。', 'TRANSPORT', result.status);
  }
  if (result.status === 407) throw new ImageGenerationError(NETWORK_ERRORS.PROXY_AUTH, 'TRANSPORT', 407);
  return { ok: result.status >= 200 && result.status < 300, status: result.status,
    headers: { get: name => name.toLowerCase() === 'location' && typeof result.location === 'string' ? result.location : null },
    text: async () => result.body, json: async () => JSON.parse(result.body) };
}

export function createImageFetch(config, { platform = process.platform, env = process.env, hostFetch = (...args) => globalThis.fetch(...args), systemFetch = windowsFetch } = {}) {
  return async (url, options) => {
    // Keep credentials on the two official endpoints even if a future caller passes another URL.
    if (!/^https:\/\/api\.openai\.com\/v1\/images\/(?:generations|edits)$/.test(url)) {
      throw new ImageGenerationError('拒绝向非官方图片接口发送请求。', 'INVALID_REQUEST');
    }
    const mode = transportMode(config, platform, env);
    // Never retry or fall back after a potentially billable POST.
    return mode === 'host' ? hostFetch(url, options) : systemFetch(url, options, config);
  };
}

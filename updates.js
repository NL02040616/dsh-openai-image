import { transportMode, windowsFetch } from './transport.js';

export const UPDATE_SOURCES = [
  { name: 'Gitee', url: 'https://gitee.com/un-important/dsh-openai-image/raw/main/latest.json' },
  { name: 'GitHub', url: 'https://raw.githubusercontent.com/NL02040616/dsh-openai-image/main/latest.json' },
];
export const UPDATE_INTERVAL = 24 * 60 * 60 * 1000;
const MAX_MANIFEST = 16384;
const stable = value => typeof value === 'string' && /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.test(value);
export function newerVersion(candidate, current) {
  if (!stable(candidate) || !stable(current)) return false;
  const a = candidate.split('.').map(Number), b = current.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

export function validateRelease(value) {
  if (value?.schema !== 1 || value.package !== 'dsh-openai-image' || !stable(value.version)
    || !/^\d{4}-\d{2}-\d{2}$/.test(value.publishedAt) || !/^[a-f0-9]{64}$/.test(value.sha256)
    || !Array.isArray(value.dshVersions) || !value.dshVersions.length || value.dshVersions.length > 10
    || value.dshVersions.some(v => typeof v !== 'string' || !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(v))) throw new Error('Invalid release manifest');
  const notes = {};
  for (const language of ['zh', 'en']) {
    const lines = value.notes?.[language];
    if (!Array.isArray(lines) || !lines.length || lines.length > 12 || lines.some(line => typeof line !== 'string' || !line.trim() || line.length > 500)) throw new Error('Invalid release notes');
    notes[language] = lines;
  }
  const file = `dsh-openai-image-${value.version}.tgz`;
  // Construct destinations ourselves; remote metadata cannot supply arbitrary links.
  return { version: value.version, publishedAt: value.publishedAt, sha256: value.sha256,
    dshVersions: value.dshVersions, notes,
    links: { gitee: `https://gitee.com/un-important/dsh-openai-image/raw/main/${file}`,
      github: `https://raw.githubusercontent.com/NL02040616/dsh-openai-image/main/${file}` } };
}

export function createUpdateFetch(config, { platform = process.platform, env = process.env,
  hostFetch = (...args) => globalThis.fetch(...args), systemFetch = windowsFetch } = {}) {
  return (url, { signal } = {}) => {
    if (!UPDATE_SOURCES.some(source => source.url === url)) throw new Error('Unknown update source');
    const options = { method: 'GET', redirect: 'error', credentials: 'omit', cache: 'no-store',
      headers: { accept: 'application/json' }, signal, maxResponseBytes: MAX_MANIFEST };
    return transportMode(config, platform, env) === 'host' ? hostFetch(url, options)
      : systemFetch(url, options, { ...config, timeoutMs: 8000 });
  };
}

async function readManifest(response) {
  if (!response.ok || Number(response.headers?.get('content-length')) > MAX_MANIFEST) throw new Error('Update response unavailable');
  let text;
  if (response.body?.getReader) {
    const reader = response.body.getReader(), chunks = [];
    let length = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > MAX_MANIFEST) throw new Error('Update response too large');
        chunks.push(value);
      }
      text = Buffer.concat(chunks).toString('utf8');
    } finally { await reader.cancel().catch(() => {}); }
  } else text = await response.text();
  if (Buffer.byteLength(text) > MAX_MANIFEST) throw new Error('Update response too large');
  return validateRelease(JSON.parse(text.replace(/^\uFEFF/, '')));
}

export function createUpdateChecker({ currentVersion, dshVersion, fetchImpl, signal, now = Date.now, timeoutMs = 8000 }) {
  let cached, pending;
  const check = async () => {
    for (const source of UPDATE_SOURCES) {
      if (signal?.aborted) break;
      try {
        const requestSignal = AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])]);
        // Bound both connection and body reads, even for a transport that ignores abort.
        const release = await new Promise((resolve, reject) => {
          const abort = () => reject(new Error('Update check ended'));
          requestSignal.addEventListener('abort', abort, { once: true });
          if (requestSignal.aborted) abort();
          else Promise.resolve().then(() => fetchImpl(source.url, { signal: requestSignal })).then(readManifest).then(resolve, reject)
            .finally(() => requestSignal.removeEventListener('abort', abort));
        });
        return { currentVersion, dshVersion, checkedAt: now(), source: source.name, release,
          status: newerVersion(release.version, currentVersion) ? 'available' : 'current',
          compatibility: !dshVersion ? 'unknown' : release.dshVersions.includes(dshVersion) ? 'compatible' : 'incompatible' };
      } catch { /* An anonymous GET can fall back; never expose proxy or response diagnostics. */ }
    }
    return { currentVersion, dshVersion, checkedAt: now(), status: 'error' };
  };
  return {
    check(manual = false) {
      if (pending) return pending;
      const age = now() - (cached?.checkedAt ?? 0);
      if (!manual && cached && age >= 0 && age < UPDATE_INTERVAL) return Promise.resolve(cached);
      pending = check().then(result => { cached = result; return result; }).finally(() => { pending = undefined; });
      return pending;
    },
  };
}

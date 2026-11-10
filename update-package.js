// Small, bounded USTAR reader/writer for this dependency-free plugin's npm packs.
// No archive is extracted or executed here. Unsupported formats fail before removal.
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export const MAX_PACKAGE = 2 * 1024 * 1024;
const MAX_CONTENT = 8 * 1024 * 1024;
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const safeName = name => /^[a-zA-Z0-9_.\/-]+$/.test(name) && !name.split('/').some(p => !p || p === '.' || p === '..')
  && !name.startsWith('/') && name.length < 100;
const octal = value => /^[0-7]+$/.test(value) ? parseInt(value, 8) : NaN;
const field = (header, start, length) => header.subarray(start, start + length).toString('utf8').replace(/\0.*$/s, '').trim();

export function unpack(bytes) {
  if (bytes.length > MAX_PACKAGE) throw new Error('package-too-large');
  const tar = gunzipSync(bytes, { maxOutputLength: MAX_CONTENT }), files = new Map();
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) {
      if (!tar.subarray(offset).every(byte => byte === 0)) throw new Error('invalid-archive');
      return files;
    }
    let sum = 0;
    header.forEach((byte, i) => { sum += i >= 148 && i < 156 ? 32 : byte; });
    const name = field(header, 0, 100), size = octal(field(header, 124, 12));
    if (sum !== octal(field(header, 148, 8)) || !safeName(name) || !name.startsWith('package/')
      || field(header, 345, 155) || ![0, 48].includes(header[156]) || !Number.isSafeInteger(size)
      || offset + 512 + size > tar.length || files.has(name.slice(8)) || files.size >= 128) throw new Error('invalid-archive');
    files.set(name.slice(8), tar.subarray(offset + 512, offset + 512 + size));
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error('truncated-archive');
}

export function pack(files) {
  const chunks = [];
  let length = 1024;
  for (const [name, bytes] of files) {
    if (!safeName('package/' + name)) throw new Error('invalid-file');
    const header = Buffer.alloc(512);
    header.write('package/' + name);
    const number = (start, width, value) => header.write(value.toString(8).padStart(width - 1, '0') + '\0', start, width);
    number(100, 8, 0o644); number(108, 8, 0); number(116, 8, 0);
    number(124, 12, bytes.length); number(136, 12, 0);
    header.fill(32, 148, 156); header[156] = 48;
    header.write('ustar\0', 257); header.write('00', 263);
    number(148, 8, header.reduce((sum, byte) => sum + byte, 0));
    chunks.push(header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512));
    length += 512 + Math.ceil(bytes.length / 512) * 512;
    if (length > MAX_CONTENT) throw new Error('package-too-large');
  }
  const bytes = gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]));
  if (bytes.length > MAX_PACKAGE) throw new Error('package-too-large');
  return bytes;
}

export function validatePackage(bytes, version, dshVersion, patch) {
  const files = unpack(bytes), metadata = JSON.parse(files.get('package.json')?.toString() ?? 'null');
  if (metadata?.name !== 'dsh-openai-image' || metadata.version !== version || metadata.dsh?.bundle?.patch !== './cordis.patch.yml'
    || metadata.dependencies && Object.keys(metadata.dependencies).length
    || metadata.optionalDependencies && Object.keys(metadata.optionalDependencies).length
    || ['preinstall', 'install', 'postinstall', 'prepare'].some(key => metadata.scripts?.[key])
    || !files.get('cordis.patch.yml')?.equals(patch)
    || !files.has('index.js') || !files.has('client.js')) throw new Error('invalid-package');
  for (const name of ['dsh-llm', 'dsh-credentials', 'dsh-tools', 'dsh-session']) {
    if (metadata.peerDependencies?.['@deepseek-ai/' + name] !== dshVersion) throw new Error('incompatible-package');
  }
  return files;
}

// Snapshot shipped files only. Never include node_modules, credentials, profile
// configuration, images, or arbitrary files from a development checkout.
export async function backupPackage(directory) {
  const metadataBytes = await readFile(join(directory, 'package.json'));
  const metadata = JSON.parse(metadataBytes), files = new Map([['package.json', metadataBytes]]);
  const add = async name => {
    if (!safeName(name)) throw new Error('invalid-file');
    const path = join(directory, name), stat = await lstat(path);
    if (!stat.isFile() || stat.size > MAX_CONTENT) throw new Error('invalid-file');
    files.set(name, await readFile(path));
  };
  for (const name of new Set([...(metadata.files ?? []), 'README.md', 'LICENSE'])) {
    if (name === 'locale/*.json') {
      for (const entry of await readdir(join(directory, 'locale'))) if (/^[\w-]+\.json$/.test(entry)) await add('locale/' + entry);
    } else await add(name);
  }
  return pack(files);
}

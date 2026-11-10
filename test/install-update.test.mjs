import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { backupPackage, digest, pack, unpack, validatePackage } from '../update-package.js';
import { prepareUpdate, runUpdate } from '../install-update.js';
import { validateRelease, createUpdateFetch } from '../updates.js';

const root = new URL('../', import.meta.url), directory = fileURLToPath(root);
const current = JSON.parse(await readFile(new URL('package.json', root))).version;
const original = await backupPackage(directory);
const files = unpack(original), patch = files.get('cordis.patch.yml');
const targetFiles = new Map(files);
targetFiles.set('package.json', Buffer.from(JSON.stringify({ ...JSON.parse(files.get('package.json')), version: '1.99.0' })));
const target = pack(targetFiles);
const release = validateRelease({ schema: 1, package: 'dsh-openai-image', version: '1.99.0', publishedAt: '2026-11-10', sha256: digest(target),
  dshVersions: ['0.2.2-rc.1'], notes: { zh: ['隔离验证'], en: ['Isolated test'] } });
const signal = new AbortController().signal;
function managerFixture({ installFails = false, removeFails = false, restoreFails = false, restart = false, enabled = true } = {}) {
  let installed = { name: 'dsh-openai-image', version: current, installed: true, availability: 'profile', removable: true, enabled };
  const calls = [];
  const result = () => ({ application: restart ? 'restart-required' : 'applied' });
  const manager = {
    listBundles: async () => installed ? [installed] : [],
    removeBundle: async name => {
      calls.push(['remove', name]);
      if (removeFails) { installed.enabled = false; return { application: 'failed' }; }
      installed = undefined; return result();
    },
    setBundleEnabled: async (name, value) => { calls.push(['enable', name, value]); installed.enabled = value; return result(); },
    installBundle: async (path, options) => {
      calls.push(['install', path, options.enabled]);
      const version = path === 'new.tgz' ? '1.99.0' : current;
      if (path === 'new.tgz' && installFails) {
        // Include the harder case: installation succeeded but activation failed.
        installed = { name: 'dsh-openai-image', version, installed: true, error: { code: 'enable-failed' } };
        return { application: 'failed', stage: 'enable' };
      }
      if (path === 'old.tgz' && restoreFails) return { application: 'failed' };
      installed = { name: 'dsh-openai-image', version, installed: true, enabled: options.enabled };
      return result();
    },
  };
  const states = [];
  const run = prepare => runUpdate({ manager, currentVersion: current, release, signal, prepare: prepare ?? (async () => ({ previousPath: 'old.tgz', targetPath: 'new.tgz' })),
    publish: async value => states.push(value) });
  return { manager, calls, states, run };
}

test('release packs and local rollback packs retain every shipped byte, including new updater files', async () => {
  const existing = unpack(await readFile(new URL('dsh-openai-image-1.7.1.tgz', root)));
  assert.equal(JSON.parse(existing.get('package.json')).version, '1.7.1');
  for (const [name, bytes] of files) assert.deepEqual(bytes, await readFile(new URL(name, root)));
  assert.ok(files.has('install-update.js')); assert.ok(files.has('update-package.js'));
  validatePackage(target, '1.99.0', '0.2.2-rc.1', patch);
  assert.throws(() => validatePackage(target, '1.99.0', '0.2.3', patch));
  assert.throws(() => validatePackage(target, '1.99.0', '0.2.2-rc.1', Buffer.from('different plugin identity')));
  assert.throws(() => pack(new Map([['../escape', Buffer.from('bad')]])));
  assert.throws(() => unpack(Buffer.from('not a tarball')));
  const wrong = new Map(targetFiles);
  wrong.set('package.json', Buffer.from(JSON.stringify({ ...JSON.parse(wrong.get('package.json')), scripts: { postinstall: 'malicious' } })));
  assert.throws(() => validatePackage(pack(wrong), '1.99.0', '0.2.2-rc.1', patch));
});

test('download fallback verifies SHA and metadata before producing offline installation and rollback files', async () => {
  const cache = await mkdtemp(join(tmpdir(), 'dsh-update-package-')), calls = [];
  const prepare = fetchImpl => prepareUpdate({ release, currentVersion: current, dshVersion: '0.2.2-rc.1', directory, cache, fetchImpl, signal });
  const paths = await prepare(async url => { calls.push(url); return new Response(calls.length === 1 ? original : target); });
  assert.equal(calls.length, 2); assert.equal(calls[1], release.links.github);
  assert.equal(digest(await readFile(paths.targetPath)), release.sha256);
  assert.deepEqual(unpack(await readFile(paths.previousPath)), files);
  await assert.rejects(prepare(async () => new Response(original)), /validation/);
});

test('public archive downloads allow only the exact repository and same-path Gitee redirect', async () => {
  const seen = [];
  const fetcher = createUpdateFetch({ networkMode: 'host' }, { hostFetch: async (url, options) => {
    seen.push({ url, options });
    return seen.length === 1 ? new Response(null, { status: 302, headers: { location: release.links.gitee.replace('gitee.com', 'raw.giteeusercontent.com') + '?signature=test' } }) : new Response(target);
  } });
  assert.deepEqual(Buffer.from(await (await fetcher(release.links.gitee)).arrayBuffer()), target);
  for (const item of seen) { assert.equal(item.options.method, 'GET'); assert.deepEqual(item.options.headers, { accept: 'application/octet-stream' }); }
  await assert.rejects(fetcher('https://example.com/other.tgz'));
  const hostile = createUpdateFetch({ networkMode: 'host' }, { hostFetch: async () => new Response(null, { status: 302, headers: { location: 'https://raw.giteeusercontent.com/un-important/dsh-openai-image/raw/main/wrong.tgz' } }) });
  await assert.rejects(hostile(release.links.gitee));
});

test('upgrade keeps enabled state and uses cached target only; no config writes are delegated to manager', async () => {
  for (const enabled of [true, false]) {
    const f = managerFixture({ enabled }); await f.run();
    assert.deepEqual(f.calls, [['remove', 'dsh-openai-image'], ['install', 'new.tgz', enabled]]);
    assert.equal(f.states.at(-1).phase, 'completed');
  }
  const f = managerFixture({ restart: true }); await f.run(); assert.equal(f.states.at(-1).phase, 'restart-required');
});

test('download or checksum failure never removes the current plugin; failed activation restores the old local pack', async () => {
  const f = managerFixture(); await f.run(async () => { throw new Error('download-or-validation-failed'); });
  assert.equal(f.calls.length, 0); assert.equal(f.states.at(-1).phase, 'failed');
  const broken = managerFixture({ installFails: true }); await broken.run();
  assert.deepEqual(broken.calls, [['remove', 'dsh-openai-image'], ['install', 'new.tgz', true], ['remove', 'dsh-openai-image'], ['install', 'old.tgz', true]]);
  assert.equal(broken.states.at(-1).phase, 'restored');
  const partial = managerFixture({ removeFails: true }); await partial.run();
  assert.equal(partial.states.at(-1).phase, 'restored');
  assert.deepEqual(partial.calls.at(-1), ['enable', 'dsh-openai-image', true]);
  const unrecoverable = managerFixture({ installFails: true, restoreFails: true }); await unrecoverable.run();
  assert.equal(unrecoverable.states.at(-1).phase, 'recovery-required');
});

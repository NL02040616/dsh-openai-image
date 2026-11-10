import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { backupPackage, validatePackage, digest, MAX_PACKAGE } from './update-package.js';
import { createUpdateFetch } from './updates.js';

const NAME = 'dsh-openai-image';
const key = Symbol.for('dsh.openaiImage.installRuntime.v1');
const runtimes = globalThis[key] ??= new WeakMap();
export function updateRuntime(root) {
  if (!runtimes.has(root)) runtimes.set(root, { activeImages: 0, busy: false, state: null, helper: null });
  return runtimes.get(root);
}
const failed = result => !result || !['applied', 'restart-required'].includes(result.application);
const json = (value, status = 200) => Response.json(value, { status, headers: { 'cache-control': 'no-store' } });
const bundle = async manager => (await manager.listBundles()).find(row => row.name === NAME);
const eligible = (row, version) => row?.installed && row.version === version && row.availability === 'profile'
  && row.removable && !row.official && !row.readOnlyReason && !row.error;

async function readBytes(response) {
  if (!response.ok || Number(response.headers?.get('content-length')) > MAX_PACKAGE) throw new Error('download-failed');
  if (!response.body?.getReader) {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_PACKAGE) throw new Error('package-too-large');
    return bytes;
  }
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return Buffer.concat(chunks);
      size += value.length;
      if (size > MAX_PACKAGE) throw new Error('package-too-large');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
}

export async function prepareUpdate({ release, currentVersion, dshVersion, directory, cache, fetchImpl, signal }) {
  const patch = await readFile(join(directory, 'cordis.patch.yml'));
  const previous = await backupPackage(directory);
  validatePackage(previous, currentVersion, dshVersion, patch);
  let target;
  for (const url of [release.links.gitee, release.links.github]) {
    try {
      const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(60000)]);
      const bytes = await readBytes(await fetchImpl(url, { signal: requestSignal }));
      if (digest(bytes) !== release.sha256) throw new Error('checksum-mismatch');
      validatePackage(bytes, release.version, dshVersion, patch);
      target = bytes; break;
    } catch { signal.throwIfAborted(); }
  }
  if (!target) throw new Error('download-or-validation-failed');
  await mkdir(cache, { recursive: true });
  const previousPath = join(cache, `${NAME}-${currentVersion}-${digest(previous).slice(0, 16)}.tgz`);
  const targetPath = join(cache, `${NAME}-${release.version}-${release.sha256.slice(0, 16)}.tgz`);
  // These paths stay outside node_modules. pnpm records them as dependencies;
  // retaining both also permits manual recovery after a process/power failure.
  await writeFile(previousPath, previous, { mode: 0o600 });
  await writeFile(targetPath, target, { mode: 0o600 });
  return { previousPath, targetPath };
}

// Uses public manager operations only. It does not edit the profile manifest,
// cordis.patch.yml, credential store, conversation data, or native updater code.
export async function runUpdate({ manager, currentVersion, release, prepare, publish, signal, versionLoaded = () => true }) {
  let previous, paths, touched = false;
  const report = async value => {
    try { await publish(value); }
    catch (error) { if (!touched) throw error; } // A journal failure must never prevent rollback.
  };
  const settle = async operation => { try { return await operation(); } catch { return { application: 'failed' }; } };
  try {
    const found = await bundle(manager);
    if (!eligible(found, currentVersion)) throw new Error('unsupported-installation');
    previous = { ...found };
    await report({ phase: 'preparing', from: currentVersion, to: release.version });
    paths = await prepare();
    signal.throwIfAborted();
    const latest = await bundle(manager);
    if (!eligible(latest, currentVersion) || latest.enabled !== previous.enabled) throw new Error('installation-changed');
    await report({ phase: 'installing', ...paths });
    // Even a failed removal may have deselected the bundle. Restore its enabled
    // state as well as its files on every failure after this point.
    touched = true;
    if (failed(await manager.removeBundle(NAME))) throw new Error('remove-failed');
    const result = await manager.installBundle(paths.targetPath, { saveExact: true, enabled: previous.enabled, requestId: randomUUID() });
    if (failed(result)) throw new Error('install-failed');
    const installed = await bundle(manager);
    if (installed?.version !== release.version || installed.enabled !== previous.enabled || installed.error) throw new Error('verification-failed');
    await report({ phase: result.application === 'restart-required' || !versionLoaded(release.version) ? 'restart-required' : 'completed' });
  } catch (error) {
    if (!touched) { await publish({ phase: 'failed', code: error.message }).catch(() => {}); return; }
    await report({ phase: 'restoring' });
    const current = await bundle(manager).catch(() => undefined);
    let restored;
    if (current?.version === currentVersion && !current.error) {
      restored = await settle(() => manager.setBundleEnabled(NAME, previous.enabled));
    } else {
      const removed = current?.installed ? await settle(() => manager.removeBundle(NAME)) : { application: 'applied' };
      if (!failed(removed)) restored = await settle(() => manager.installBundle(paths.previousPath, { saveExact: true, enabled: previous.enabled, requestId: randomUUID() }));
    }
    const after = await bundle(manager).catch(() => undefined);
    const ok = !failed(restored) && after?.version === currentVersion && after.enabled === previous.enabled && !after.error;
    await report({ phase: ok ? 'restored' : 'recovery-required', restartRequired: restored?.application === 'restart-required' });
  }
}

export function installUpdateRoute(ctx, { currentVersion, dshVersion, config, updates }) {
  const runtime = updateRuntime(ctx.root);
  runtime.loadedVersion = currentVersion;
  ctx.effect(() => () => { if (runtime.loadedVersion === currentVersion) runtime.loadedVersion = null; });
  ctx.inject(['connection', 'pluginManager', 'profileContext'], scope => {
    scope.effect(() => scope.connection.fetch.register({
      path: '/api/openai-image.install-update', methods: ['POST'], requestBody: 'buffered',
      fetch: async request => {
        // An authenticated connection is required by DSH; this non-simple
        // header additionally prevents a foreign form from initiating a change.
        if (request.headers.get('x-dsh-image-update') !== '1' || !request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'invalid-request' }, 400);
        let input;
        try { const body = await request.text(); if (body.length > 128) throw new Error(); input = JSON.parse(body); } catch { return json({ error: 'invalid-request' }, 400); }
        if (runtime.busy) return json({ error: 'update-running' }, 409);
        if (runtime.state?.phase === 'restart-required' || runtime.state?.restartRequired) return json({ error: 'restart-required' }, 409);
        if (runtime.activeImages) return json({ error: 'images-running' }, 409);
        if (dshVersion !== '0.2.2-rc.1' || !ctx.root.get('pluginManager') || !ctx.root.get('connection')) return json({ error: 'unsupported-runtime' }, 409);
        // Lock synchronously before any await, including the fresh manifest GET.
        runtime.busy = true;
        try {
          const checked = await updates.check(true);
          if (checked.status !== 'available' || checked.compatibility !== 'compatible' || checked.release.version !== input.version) {
            runtime.busy = false; return json({ error: 'release-changed' }, 409);
          }
          const release = checked.release;
          const cache = join(scope.profileContext.dir, '.cache', NAME, 'updates');
          const fetchImpl = createUpdateFetch(config);
          // A root-owned temporary fiber survives removal of this image plugin.
          // The helper owns its own connection route, cancellation and cleanup.
          // Replacing the bundle never cancels the manager's install operation.
          if (runtime.helper) await runtime.helper.dispose();
          const directory = fileURLToPath(new URL('.', import.meta.url));
          runtime.state = { phase: 'preparing', from: currentVersion, to: release.version };
          runtime.helper = ctx.root.plugin({ name: 'openai-image-update-job', inject: ['pluginManager', 'connection'], apply(jobCtx) {
            const controller = new AbortController();
            let timer;
            jobCtx.effect(() => () => { controller.abort(); clearTimeout(timer); });
            jobCtx.effect(() => jobCtx.connection.fetch.register({ path: '/api/openai-image.update-job', methods: ['GET'], requestBody: 'buffered',
              fetch: () => json(runtime.state) }));
            const publish = async patch => {
              runtime.state = { ...runtime.state, ...patch };
              await mkdir(cache, { recursive: true });
              await writeFile(join(cache, 'job.json.tmp'), JSON.stringify(runtime.state), { mode: 0o600 });
              await rename(join(cache, 'job.json.tmp'), join(cache, 'job.json'));
            };
            timer = setTimeout(() => {
              runtime.promise = runUpdate({ manager: jobCtx.pluginManager, currentVersion, release, signal: controller.signal, publish,
                versionLoaded: version => runtime.loadedVersion === version,
                prepare: () => prepareUpdate({ release, currentVersion, dshVersion, directory, cache, fetchImpl, signal: controller.signal }) })
                .catch(() => { runtime.state = { ...runtime.state, phase: 'recovery-required' }; })
                .finally(() => { runtime.busy = false; timer = setTimeout(() => { void jobCtx.fiber.dispose(); }, 10 * 60 * 1000); timer.unref?.(); });
            }, 100);
          } });
          await runtime.helper.await();
          return json(runtime.state, 202);
        } catch { runtime.busy = false; return json({ error: 'start-failed' }, 500); }
      },
    }));
  });
  return runtime;
}

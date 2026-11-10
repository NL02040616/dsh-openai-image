// Isolated native Cordis + plugin-manager + pnpm + HMR validation. No OpenAI
// requests and no reads/writes of the desktop profile or credential store.
import { spawnSync } from 'node:child_process';
import { createRequire, registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { backupPackage, pack, unpack, digest } from '../update-package.js';

const testHome = process.env.DSH_UPDATE_TEST_HOME || await mkdtemp(join(tmpdir(), 'dsh-native-update-'));
if (!process.versions.electron) {
  const executable = process.env.DSH_TEST_EXECUTABLE || 'D:/Program Files/dsh/DeepSeek Harness.exe';
  const result = spawnSync(executable, ['--expose-internals', fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', DSH_HOME: testHome, DSH_UPDATE_TEST_HOME: testHome }, cwd: testHome,
    windowsHide: true, stdio: 'inherit', timeout: 180000,
  });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
const name = 'dsh-openai-image', current = JSON.parse(await readFile(new URL('../package.json', import.meta.url))).version;
const installAnchor = join(dirname(process.execPath), 'resources/app.asar/dsh/package.json');
const runtime = createRequire(installAnchor);
let resolving = false;
const home = testHome;
assert.equal(process.env.DSH_HOME, home);
assert.match(home, /dsh-native-update-[\w-]+$/);
assert.equal(process.cwd(), home);
console.log('Isolated DSH home:', home, 'PID:', process.pid);
const dir = join(home, 'profiles', 'updater-test');
await mkdir(dir, { recursive: true });
registerHooks({ resolve(spec, context, next) {
  if (!resolving && spec.startsWith('@deepseek-ai/')) {
    resolving = true;
    try { return { url: pathToFileURL(runtime.resolve(spec)).href, shortCircuit: true }; }
    finally { resolving = false; }
  }
  return next(spec, context);
} });
const pnpm = join(dirname(process.execPath), 'resources/runtime/primary-runtime/dependencies/pnpm/bin/pnpm.cjs');
await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'isolated-update-profile', private: true, dsh: { profile: { bundles: [name] } } }));
await writeFile(join(dir, '.npmrc'), `auto-install-peers=false\nstrict-peer-dependencies=false\nstore-dir=${join(home, 'store').replaceAll('\\', '/')}\nregistry=http://127.0.0.1:9\n`);
await writeFile(join(dir, 'pnpm-workspace.yaml'), `autoInstallPeers: false\nstrictPeerDependencies: false\nstoreDir: ${JSON.stringify(join(home, 'store'))}\nfetchRetries: 0\n`);
const files = unpack(await backupPackage(fileURLToPath(new URL('../', import.meta.url))));
// Keep the actual update code, package metadata, patch identity, client and other
// shipped files. Replace only paid image work with an observable fixture plugin.
files.set('index.js', Buffer.from(`
import z from '@deepseek-ai/schemastery';
import {readFileSync} from 'node:fs';
import { installUpdateRoute, updateRuntime } from './install-update.js';
import { createUpdateChecker, createUpdateFetch } from './updates.js';
export const Config = z.object({apiKeyEnv:z.string(),defaultModel:z.string(),quality:z.string(),size:z.string(),timeoutMs:z.number(),networkMode:z.string(),proxyUrl:z.string(),proxyUseDefaultCredentials:z.boolean()});
export function apply(ctx, config) {
  const currentVersion = JSON.parse(readFileSync(new URL('./package.json',import.meta.url),'utf8')).version;
  globalThis.__updateFixtureLoads.push({...config, version:currentVersion});
  installUpdateRoute(ctx, {currentVersion,dshVersion:'0.2.2-rc.1',config,
    updates:createUpdateChecker({currentVersion,dshVersion:'0.2.2-rc.1',fetchImpl:createUpdateFetch(config)})});
  globalThis.__updateFixtureRuntime = updateRuntime(ctx.root);
  ctx.effect(() => () => {globalThis.__updateFixtureUnloads++;});
}
`));
const initialPath = join(home, 'initial.tgz');
await writeFile(initialPath, pack(files));
const add = spawnSync(process.execPath, [pnpm, 'add', initialPath, '--ignore-scripts'], { cwd: dir, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, encoding: 'utf8', timeout: 45000 });
assert.equal(add.status, 0, add.stderr + add.stdout);
const nextFiles = new Map(files);
nextFiles.set('package.json', Buffer.from(JSON.stringify({ ...JSON.parse(files.get('package.json')), version: '1.99.0' })));
const target = pack(nextFiles);
const settings = { apiKeyEnv: 'ISOLATED_REFERENCE_ONLY', defaultModel: 'gpt-image-2.6-sunburst', quality: 'low', size: '1536x864',
  timeoutMs: 123000, networkMode: 'host', proxyUrl: '', proxyUseDefaultCredentials: true };
const configBytes = Buffer.from(JSON.stringify([{ id: 'openai-image', config: settings }]));
await writeFile(join(dir, 'cordis.patch.yml'), configBytes);
await writeFile(join(dir, 'cordis.yml'), '[]\n');
globalThis.__updateFixtureVersion = current;
globalThis.__updateFixtureLoads = [];
globalThis.__updateFixtureUnloads = 0;
const fetched = [];
globalThis.fetch = async (url, init) => {
  fetched.push(url);
  assert.equal(init.method, 'GET'); assert.equal(init.headers.authorization, undefined);
  if (url.endsWith('/latest.json')) return Response.json({ schema: 1, package: name, version: '1.99.0', publishedAt: '2026-11-10', sha256: digest(target),
    dshVersions: ['0.2.2-rc.1'], notes: { zh: ['隔离验证'], en: ['Isolated test'] } });
  assert.ok(url.endsWith('/dsh-openai-image-1.99.0.tgz'));
  return new Response(target);
};
const { boot, loadProfileDirectory, readProfilePatches, createRuntimeResolution, PluginPackages } = await import('@deepseek-ai/dsh-app-boot');
const { default: Timer } = await import('@deepseek-ai/cordis-plugin-timer');
const { default: Hmr } = await import('@deepseek-ai/dsh-hmr');
const managerModule = await import('@deepseek-ai/dsh-plugin-manager');
const profile = { ...loadProfileDirectory('dsh', dir, installAnchor), home, installAnchor, startedBundles: [name], overlays: [],
  packageManager: { command: process.execPath, args: [pnpm], env: { ELECTRON_RUN_AS_NODE: '1' } } };
const resolution = await createRuntimeResolution({ installAnchor, profile, home });
const routes = new Map();
let ctx, readyCallback;
const failInstall = process.argv.includes('--fail-install');
try {
  ctx = await boot('dsh', join(dir, 'cordis.yml'), readProfilePatches('dsh', profile), async root => {
    root.logger.exporter({ levels: { default: 2 }, export: ({ type, args }) => { if (type === 'error' || type === 'warn') console.log('Runtime:', ...args); } });
    root.on('plugin-manager/operation', operation => { if (operation.phase !== 'started') console.log('Manager:', JSON.stringify(operation)); });
    root.provide('profileContext', profile);
    root.provide('appReady', { onReady(callback) { readyCallback = callback; return () => {}; } });
    root.provide('connection', { fetch: { register(route) { assert.ok(!routes.has(route.path), 'duplicate route'); routes.set(route.path, route); return () => routes.delete(route.path); } } });
    await root.plugin(PluginPackages, { resolution });
    await root.plugin(Timer);
    await root.plugin(Hmr, { root: [], base: pathToFileURL(dir + '/').href });
    await root.plugin(managerModule.default ?? managerModule.PluginManager);
  }, pathToFileURL(join(dir, 'package.json')).href);
  readyCallback();
  if (failInstall) {
    const install = ctx.pluginManager.installBundle.bind(ctx.pluginManager);
    ctx.pluginManager.installBundle = (spec, options) => spec.includes('1.99.0') ? Promise.reject(new Error('isolated install failure')) : install(spec, options);
  }
  const route = routes.get('/api/openai-image.install-update');
  assert.ok(route, 'updater registered in real plugin runtime');
  const request = () => new Request('http://localhost/api/openai-image.install-update', { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dsh-image-update': '1' }, body: JSON.stringify({ version: '1.99.0' }) });
  const gate = globalThis.__updateFixtureRuntime;
  gate.activeImages = 1;
  assert.equal((await route.fetch(request())).status, 409);
  gate.activeImages = 0;
  assert.equal((await route.fetch(new Request('http://localhost/api/openai-image.install-update', { method: 'POST', body: '{}' }))).status, 400);
  const accepted = await route.fetch(request());
  assert.equal(accepted.status, 202, JSON.stringify(await accepted.clone().json()));
  assert.equal((await route.fetch(request())).status, 409, 'duplicate click coalesced');
  const deadline = Date.now() + 90000;
  while (gate.busy && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(gate.busy, false, 'update completed within bound');
  console.log('Native job state:', JSON.stringify(gate.state));
  assert.ok((failInstall ? ['restored'] : ['completed', 'restart-required']).includes(gate.state.phase));
  assert.ok(globalThis.__updateFixtureUnloads >= 1, 'old plugin actually unloaded');
  const installed = (await ctx.pluginManager.listBundles()).find(row => row.name === name);
  assert.equal(installed.version, failInstall ? current : '1.99.0'); assert.equal(installed.enabled, true);
  assert.deepEqual(await readFile(join(dir, 'cordis.patch.yml')), configBytes, 'custom config byte-identical');
  const loaded = globalThis.__updateFixtureLoads.at(-1);
  assert.deepEqual(loaded, { ...settings, version: loaded.version }, 'runtime received every custom setting');
  if (!failInstall && loaded.version !== '1.99.0') assert.equal(gate.state.phase, 'restart-required', 'never report complete with old code still running');
  assert.equal((await routes.get('/api/openai-image.update-job').fetch()).status, 200, 'progress survives self removal');
  assert.ok(fetched.every(url => !url.includes('openai.com')));
  console.log('PASS native ' + (failInstall ? 'rollback' : 'update') + ': pnpm + manager + HMR, self-unload, duplicate rejection, preserved config and accurate restart status.');
} finally { await ctx?.fiber.dispose(); }
const cold = spawnSync(process.execPath, ['--expose-internals', fileURLToPath(new URL('native-update-cold.mjs', import.meta.url)), failInstall ? current : '1.99.0'], {
  cwd: home, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, stdio: 'inherit', timeout: 30000,
});
assert.equal(cold.status, 0, 'fresh process must load installed version with retained settings');

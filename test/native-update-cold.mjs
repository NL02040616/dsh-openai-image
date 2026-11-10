// Fresh-process boot of the isolated profile produced by native-update.mjs.
import assert from 'node:assert/strict';
import { createRequire, registerHooks } from 'node:module';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
const home = process.env.DSH_UPDATE_TEST_HOME;
assert.ok(process.versions.electron); assert.match(home, /dsh-native-update-[\w-]+$/);
assert.equal(process.env.DSH_HOME, home); assert.equal(process.cwd(), home);
const dir = join(home, 'profiles/updater-test');
const installAnchor = join(dirname(process.execPath), 'resources/app.asar/dsh/package.json');
const runtime = createRequire(installAnchor);
let resolving = false;
registerHooks({ resolve(spec, context, next) {
  if (!resolving && spec.startsWith('@deepseek-ai/')) {
    resolving = true;
    try { return { url: pathToFileURL(runtime.resolve(spec)).href, shortCircuit: true }; } finally { resolving = false; }
  }
  return next(spec, context);
} });
const { boot, loadProfileDirectory, readProfilePatches, createRuntimeResolution, PluginPackages } = await import('@deepseek-ai/dsh-app-boot');
const { default: Manager } = await import('@deepseek-ai/dsh-plugin-manager');
const profile = { ...loadProfileDirectory('dsh', dir, installAnchor), home, installAnchor, startedBundles: ['dsh-openai-image'], overlays: [] };
const resolution = await createRuntimeResolution({ installAnchor, profile, home });
const before = await readFile(join(dir, 'cordis.patch.yml'));
const settings = JSON.parse(before)[0].config;
globalThis.__updateFixtureLoads = []; globalThis.__updateFixtureUnloads = 0;
globalThis.fetch = () => assert.fail('No network requests expected during this cold boot');
const ctx = await boot('dsh', join(dir, 'cordis.yml'), readProfilePatches('dsh', profile), async root => {
  root.provide('profileContext', profile);
  root.provide('connection', { fetch: { register: () => () => {} } });
  await root.plugin(PluginPackages, { resolution });
  await root.plugin(Manager);
}, pathToFileURL(join(dir, 'package.json')).href);
try {
  assert.deepEqual(globalThis.__updateFixtureLoads.at(-1), { ...settings, version: process.argv[2] });
  assert.deepEqual(await readFile(join(dir, 'cordis.patch.yml')), before);
  console.log('PASS fresh native boot: correct version ' + process.argv[2] + ', custom settings and updater route loaded.');
} finally { await ctx.fiber.dispose(); }

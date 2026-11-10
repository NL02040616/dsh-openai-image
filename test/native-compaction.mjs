// Run with `node test/native-compaction.mjs`. Requires an installed DSH desktop;
// override DSH_TEST_EXECUTABLE for another installation. No real API calls.
import { spawnSync } from 'node:child_process';
import { createRequire, registerHooks } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

if (!process.versions.electron) {
  const executable = process.env.DSH_TEST_EXECUTABLE || 'D:/Program Files/dsh/DeepSeek Harness.exe';
  const result = spawnSync(executable, ['--expose-internals', fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, stdio: 'inherit',
  });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
const runtime = createRequire(join(dirname(process.execPath), 'resources/app.asar/dsh/package.json'));
let resolving = false;
registerHooks({ resolve(name, context, next) {
  if (!resolving && name.startsWith('@deepseek-ai/')) {
    resolving = true;
    try { return { url: pathToFileURL(runtime.resolve(name)).href, shortCircuit: true }; }
    finally { resolving = false; }
  }
  return next(name, context);
} });
const pluginRoot = process.env.IMAGE_PLUGIN_ROOT ? pathToFileURL(process.env.IMAGE_PLUGIN_ROOT + '/') : new URL('../', import.meta.url);
const plugin = await import(new URL('index.js', pluginRoot));
const { MODELS, PROVIDER, textChunks } = await import(new URL('core.js', pluginRoot));
const { Context } = await import('@deepseek-ai/cordis');
const { LlmRuntime, LlmAdapter, createUserMessage } = await import('@deepseek-ai/dsh-llm');
const { LocalAttachmentStore } = await import('@deepseek-ai/dsh-attachment-local');
const ctx = new Context(), fibers = [], calls = [];
let chatCalls = 0, failImage = false, updateCalls = 0, credentialReads = 0;
const routes = new Map();
const png = await runtime('sharp')({ create: { width: 32, height: 24, channels: 3, background: { r: 40, g: 80, b: 120 } } }).png().toBuffer();
globalThis.fetch = async (url, init) => {
  if (url === 'https://gitee.com/un-important/dsh-openai-image/raw/main/latest.json') {
    updateCalls++;
    assert.equal(init.method, 'GET');
    assert.deepEqual(init.headers, { accept: 'application/json' });
    assert.equal(init.body, undefined);
    return Response.json({ schema: 1, package: 'dsh-openai-image', version: '1.99.0', publishedAt: '2026-11-10',
      sha256: 'a'.repeat(64), dshVersions: ['0.2.2-rc.1'], notes: { zh: ['隔离测试'], en: ['Isolated test'] } });
  }
  assert.match(url, /^https:\/\/api\.openai\.com\/v1\/images\/(?:generations|edits)$/);
  calls.push({ url, body: JSON.parse(init.body) });
  return failImage ? Response.json({ error: { message: 'isolated failure' } }, { status: 503 })
    : Response.json({ data: [{ b64_json: png.toString('base64') }] });
};
const load = async (mod, config) => { const fiber = ctx.plugin(mod.default ?? mod, config); fibers.push(fiber); await fiber.await(); };
try {
  for (const name of ['dsh-session', 'dsh-session-projection', 'dsh-agent', 'dsh-system-prompt', 'dsh-tools', 'dsh-tool-executor-native', 'dsh-agent-loop', 'dsh-commands']) {
    await load(await import('@deepseek-ai/' + name));
  }
  await load(LlmRuntime);
  await load(LocalAttachmentStore, { dshHome: await mkdtemp(join(tmpdir(), 'dsh-image-compaction-')) });
  ctx.provide('credentials', { resolve: async () => { credentialReads++; return { value: 'dummy-isolated-key' }; } });
  ctx.provide('connection', { fetch: { register: route => { routes.set(route.path, route); return () => routes.delete(route.path); } } });
  await load(await import('@deepseek-ai/dsh-token-meter'));
  // Production compaction hooks must be present: omitting this service masked
  // the 1.6.0 regression even when other native lifecycle tests passed.
  await load(await import('@deepseek-ai/dsh-compaction-basic'));
  class ChatFixture extends LlmAdapter {
    async resolveModel(provider, id) { return { provider, id, name: id, ...(id === 'unknown-capacity' ? {} : { context: { contextWindow: 4000000 } }) }; }
    async *stream(options) {
      assert.ok(!options.messages.some(message => message.source?.kind?.includes('compact')), 'no summary request expected');
      chatCalls++;
      yield* textChunks('isolated chat reply');
      yield { type: 'finish', reason: { kind: 'stop' } };
    }
  }
  ctx.llm.registerAdapter(['chat-fixture'], new ChatFixture());
  await load(plugin, { networkMode: 'host' });
  if (!process.argv.includes('--expect-regression')) {
    const updateRoute = routes.get('/api/openai-image.updates');
    assert.deepEqual(updateRoute.methods, ['GET']);
    const updateRequest = new Request('http://localhost/api/openai-image.updates');
    const updateResponse = await updateRoute.fetch(updateRequest);
    const updateResult = await updateResponse.json();
    assert.equal(updateResponse.headers.get('cache-control'), 'no-store');
    assert.equal(updateResult.currentVersion, JSON.parse(await readFile(new URL('package.json', pluginRoot), 'utf8')).version);
    assert.equal(updateResult.dshVersion, '0.2.2-rc.1');
    assert.equal(updateResult.compatibility, 'compatible');
    assert.equal(updateResult.status, 'available');
    await updateRoute.fetch(updateRequest);
    assert.equal(updateCalls, 1, 'background route checks share the daily cache');
    await updateRoute.fetch(new Request(updateRequest.url + '?manual=1'));
    assert.equal(updateCalls, 2, 'manual route checks refresh the release');
    assert.equal(credentialReads, 0, 'update checks must not read OpenAI credentials');
    assert.equal(calls.length, 0, 'update checks must not call image endpoints');
    console.log('PASS native updates: registered route handler, actual SDK version, anonymous GET, daily cache and manual refresh; HTTP mocked');
  }
  const handle = await ctx.agents.create({ sessionId: 'compaction-fixture', agentOptions: { provider: PROVIDER, model: 'gpt-image-2.5-flare' } });
  const agent = handle.agent, signal = new AbortController().signal;
  const end = () => agent.session.log.findLast(event => event.type === 'turn/end').data.reason;
  const result = () => agent.session.log.findLast(event => event.type === 'tool/result').data.message;
  const runChat = async text => {
    agent.model.select({ provider: 'chat-fixture', model: 'normal' });
    agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }));
    await agent.whenIdle(); assert.equal(end().kind, 'completed', JSON.stringify(end()));
  };
  const edit = async model => {
    const args = { prompt: 'Change only the background. 16:9', model, quality: 'low', size: '1536x864', sizeMode: 'manual' };
    const admitted = await ctx.commands.execute(agent, '/image @dsh-image-options-v1 ' + JSON.stringify(args), [{ type: 'image', data: png.toString('base64'), mediaType: 'image/png' }], signal);
    assert.equal(admitted.result.kind, 'success');
    await agent.whenIdle();
  };
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Create the original image' }], source: { kind: 'user' } }));
  await agent.whenIdle();
  assert.equal(end().kind, 'completed', JSON.stringify(end()));
  assert.equal(calls.length, 1);
  assert.ok(result().content.some(block => block.type === 'image'), JSON.stringify(result()));
  await runChat('History retained before editing. '.repeat(40000));
  const beforeEdit = agent.session.deriveMessages();
  assert.equal(agent.session.requestHeader().config.provider, 'chat-fixture');
  await edit('gpt-image-2.6-sunburst');
  if (process.argv.includes('--expect-regression')) {
    assert.equal(end().error?.code, 'MODEL_SWITCH_COMPACTION_FAILED');
    assert.match(end().error.message, /no context capacity/);
    assert.equal(calls.length, 1, 'blocked before the image API');
    console.log('REPRODUCED 1.6.0: chat history -> continue editing -> MODEL_SWITCH_COMPACTION_FAILED; zero edit HTTP calls');
    await handle.dispose();
    process.exitCode = 0;
  } else {
    assert.equal(end().kind, 'completed', JSON.stringify(end()));
    assert.equal(calls.length, 2);
    assert.ok(calls[1].url.endsWith('/edits'));
    assert.equal(calls[1].body.model, 'gpt-image-2.6-sunburst');
    assert.equal(calls[1].body.quality, 'low');
    assert.equal(calls[1].body.size, '1536x864');
    assert.deepEqual(calls[1].body.images, [{ image_url: 'data:image/png;base64,' + png.toString('base64') }]);
    assert.deepEqual(agent.session.deriveMessages().slice(0, beforeEdit.length), beforeEdit, 'no history rewritten or removed');
    assert.equal(agent.model.current().provider, 'chat-fixture');
    for (const model of MODELS) {
      const info = await ctx.llm.resolveModelInfo(PROVIDER, model.id);
      assert.ok(Number.isSafeInteger(info.context?.contextWindow));
    }
    // Switch between image models with existing image history as well.
    await edit('gpt-image-2.6-flare');
    assert.equal(end().kind, 'completed', JSON.stringify(end()));
    await runChat('Continue normal chat');
    assert.equal(agent.session.requestHeader().config.provider, 'chat-fixture');
    failImage = true;
    await edit('gpt-image-2.6-sunburst');
    assert.equal(result().isError, true);
    const failedId = result().source.callId;
    await runChat('A chat reply before retry');
    failImage = false;
    const beforeRetry = calls.length;
    const retries = await Promise.all([ctx.commands.execute(agent, `/image-retry ${failedId}`, [], signal), ctx.commands.execute(agent, `/image-retry ${failedId}`, [], signal)]);
    await agent.whenIdle();
    assert.deepEqual(retries.map(item => item.result.kind).sort(), ['error', 'success']);
    assert.equal(calls.length, beforeRetry + 1);
    assert.ok(!result().isError);
    assert.equal(agent.model.current().provider, 'chat-fixture');
    const beforeInvalid = calls.length;
    await assert.rejects(ctx.commands.execute(agent, '/image ' + 'x'.repeat(32001), [], signal), /32000/);
    assert.equal(calls.length, beforeInvalid, 'local router metadata cannot bypass image prompt validation');
    assert.ok(!agent.session.log.some(event => event.type.startsWith('compaction/')), 'image routing must not compact chat history');
    assert.equal(chatCalls, 3, 'no extra summarization calls');
    agent.model.select({ provider: 'chat-fixture', model: 'unknown-capacity' });
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Other adapter still checked' }], source: { kind: 'user' } }));
    await agent.whenIdle();
    assert.equal(end().error?.code, 'MODEL_SWITCH_COMPACTION_FAILED', 'normal host checks remain enabled for other adapters');
    await handle.dispose();
    console.log('PASS native compaction: historical-image edit, model switch, unchanged history, original retry, chat restoration, prompt guard and other-adapter checks; all HTTP mocked');
  }
} finally { for (const fiber of fibers.reverse()) await fiber.dispose(); }

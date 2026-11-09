import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { PROVIDER, commandRequest, commandDraft, validateRequest } from '../core.js';
import { recoverRequest, requestSnapshot, REQUEST_RECORD } from '../recovery.js';

const source = (await readFile(new URL('../one-shot.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace('export function', 'function');

test('0.2.2 selects before admission, keeps the fixed request route and restores on failure or cancellation', async () => {
  const hooks = new Map();
  let command;
  let current = { provider: 'chat', model: 'original', reasoningEffort: 'high' };
  const original = current;
  const agent = { status: 'idle', inbox: { nextTurn: [], nextStep: [] },
    model: { current: () => current, select: value => { current = value; } },
    followup: () => { assert.equal(current.provider, 'openai-image'); },
  };
  const ctx = { on: (name, handler) => hooks.set(name, handler),
    inject: (_deps, apply) => apply({ commands: { register: value => { command = value; } } }),
    get: () => { throw new Error('0.2.2 must not access the old controller'); },
  };
  vm.runInNewContext(source + '\ninstallOneShot(ctx, {});', { ctx, PROVIDER: 'openai-image',
    commandRequest: () => ({ model: 'image-test', prompt: 'test', size: '1536x864', quality: 'low' }), createUserMessage: value => value,
    commandDraft: () => ({ prompt: 'test', size: '1536x864', sizeMode: 'manual' }),
  });
  for (const ending of ['agent/turn-stopping', 'agent/status']) {
    command.handler({ agent, rawInput: 'test', attachments: [] });
    const event = { agent, turn: 1, step: 1 };
    await hooks.get('agent/pre-step')(event, async () => ({ kind: 'enter', messages: [{ source: { kind: 'user', openaiImage: { version: 1, model: 'image-test' } } }] }));
    const fixed = { provider: 'openai-image', model: 'image-test' };
    assert.equal(await hooks.get('agent/request')(event, async () => fixed), fixed);
    await hooks.get(ending)({ agent, status: 'idle' });
    assert.equal(current, original);
  }
  command.handler({ agent, rawInput: 'test', attachments: [] });
  current = { provider: 'chat', model: 'user-change' };
  await hooks.get('agent/turn-stopping')({ agent });
  assert.equal(current.model, 'user-change');
});

test('one-shot preserves the desktop next-model intent instead of inheriting the image header', async () => {
  const hooks = new Map();
  let header = { provider: 'chat', model: 'original', reasoningEffort: 'high' };
  let pending;
  let writes = 0;
  const selection = { get current() { return pending ?? header; } };
  const controller = {
    selectionFor: () => selection,
    selectForNextRequest: (_agent, value) => { pending = value; writes++; },
  };
  const ctx = {
    on: (name, handler) => hooks.set(name, handler), inject() {},
    get: name => name === 'sessionController' ? { agents: controller } : undefined,
  };
  vm.runInNewContext(source + '\ninstallOneShot(ctx, {});', { ctx, PROVIDER: 'openai-image' });
  const agent = {};
  const event = { agent, turn: 1, step: 1 };
  const marker = { source: { kind: 'user', openaiImage: { version: 1, model: 'gpt-image-2.5-flare' } } };
  await hooks.get('agent/pre-step')(event, async () => ({ kind: 'enter', messages: [marker] }));
  const result = await hooks.get('agent/request')(event, async () => header);
  header = result;
  assert.equal(header.provider, 'openai-image');
  assert.equal(selection.current.model, 'original');
  assert.equal(selection.current.reasoningEffort, 'high');
  assert.equal(writes, 1);

  // A failed tool can take another image-only step. A user selection made in
  // between must not be overwritten by restoring an old snapshot.
  pending = { provider: 'chat', model: 'user-changed' };
  const continuation = { ...event, step: 2 };
  await hooks.get('agent/pre-step')(continuation, async () => ({ kind: 'enter', messages: [] }));
  await hooks.get('agent/request')(continuation, async () => selection.current);
  assert.equal(selection.current.model, 'user-changed');
  assert.equal(writes, 1);

  const chat = { agent, turn: 2, step: 1 };
  await hooks.get('agent/pre-step')(chat, async () => ({ kind: 'enter', messages: [{ source: { kind: 'user' } }] }));
  const next = await hooks.get('agent/request')(chat, async () => selection.current);
  assert.equal(next.model, 'user-changed');
  assert.equal(next.provider, 'chat');
});

function retryFixture() {
  const hooks = new Map(), commands = new Map(), queued = [], reads = [];
  const original = { provider: 'chat', model: 'original' };
  let current = original;
  const config = { defaultModel: 'gpt-image-1-mini', quality: 'high', size: '1024x1024' };
  const references = ['C', 'A', 'B'].map(id => ({ attachmentId: id, mediaType: 'image/png' }));
  const args = { prompt: 'original three-image prompt', model: 'gpt-image-2.6-flare', quality: 'low', size: '1536x864' };
  const request = requestSnapshot(args, config, references, 'edit', { prompt: args.prompt, size: '1024x1024', sizeMode: 'prompt' });
  const agent = { status: 'idle', inbox: { nextTurn: [], nextStep: [] }, session: { log: [
    { type: 'tool/call', data: { callId: 'old', name: 'openai_edit_image', arguments: JSON.stringify(args) } },
    { type: REQUEST_RECORD, data: { callId: 'old', request } },
  ] }, model: { current: () => current, select: value => current = value }, followup: message => { queued.push(message); agent.inbox.nextTurn.push(message); } };
  const ctx = { on: (name, fn) => hooks.set(name, fn), inject: (_deps, fn) => fn({ commands: { register: cmd => commands.set(cmd.name, cmd) } }),
    attachments: { readImage: async ref => { reads.push(ref.attachmentId); return { data: Buffer.from(ref.attachmentId) }; } } };
  vm.runInNewContext(source + '\ninstallOneShot(ctx, config);', { ctx, config, PROVIDER, commandRequest, commandDraft, validateRequest, recoverRequest,
    recoveryIssues: saved => saved.issues, createUserMessage: value => value });
  const run = name => commands.get(name).handler({ agent, rawInput: 'old', attachments: [], signal: new AbortController().signal });
  return { ctx, agent, queued, reads, request, run, hooks, current: () => current, original };
}

test('retry snapshots old settings and references, admits only once, and restores the chat model', async () => {
  const f = retryFixture();
  const recovery = f.run('image-recover');
  assert.equal(JSON.parse(recovery.text).model, 'gpt-image-2.6-flare');
  assert.equal(f.queued.length, 0);
  let release;
  f.ctx.attachments.readImage = async ref => { f.reads.push(ref.attachmentId); if (ref.attachmentId === 'C') await new Promise(resolve => release = resolve); return {}; };
  const retry = f.run('image-retry');
  assert.equal((await f.run('image-retry')).kind, 'error');
  assert.equal(f.queued.length, 0);
  release();
  assert.equal((await retry).kind, 'success');
  assert.equal((await f.run('image-retry')).kind, 'error');
  assert.equal(f.queued.length, 1);
  assert.deepEqual(f.reads, ['C', 'A', 'B']);
  const message = JSON.parse(JSON.stringify(f.queued[0]));
  assert.deepEqual(message.content.slice(1).map(part => part.attachment.attachmentId), ['C', 'A', 'B']);
  assert.equal(message.content[0].text, f.request.prompt);
  for (const key of ['model', 'quality', 'size']) assert.equal(message.source.openaiImage[key], f.request[key]);
  assert.equal(message.source.openaiImage.draft.sizeMode, 'prompt');
  await f.hooks.get('agent/turn-stopping')({ agent: f.agent });
  assert.equal(f.current(), f.original);
});

test('missing references, incomplete legacy settings, unsupported models and a newly busy session never enqueue', async () => {
  const missing = retryFixture();
  missing.ctx.attachments.readImage = async ref => { if (ref.attachmentId === 'A') throw new Error('missing'); return {}; };
  assert.match((await missing.run('image-retry')).text, /参考图 2/);
  assert.equal(missing.queued.length, 0); assert.equal(missing.current(), missing.original);
  const legacy = retryFixture(); legacy.agent.session.log.pop();
  legacy.agent.session.log[0].data.arguments = JSON.stringify({ prompt: 'legacy' });
  assert.match((await legacy.run('image-retry')).text, /补全/);
  assert.equal(legacy.reads.length, 0); assert.equal(legacy.queued.length, 0);
  const unknown = retryFixture(); unknown.request.model = 'removed-model';
  await assert.rejects(unknown.run('image-retry'), /不支持/);
  assert.equal(unknown.queued.length, 0); assert.equal(unknown.reads.length, 0);
  const busy = retryFixture();
  busy.ctx.attachments.readImage = async () => { busy.agent.status = 'running'; return {}; };
  assert.equal((await busy.run('image-retry')).kind, 'error'); assert.equal(busy.queued.length, 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = (await readFile(new URL('../one-shot.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace('export function', 'function');

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

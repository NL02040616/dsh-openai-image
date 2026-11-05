import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { MODELS, QUALITIES, SIZE_PRESETS, commandRequest } from '../core.js';
const code = await readFile(new URL('../client.js', import.meta.url), 'utf8');

function fixture(saved = new Map()) {
  const config = { defaultModel: MODELS[1].id, quality: 'high', size: '1024x1536' };
  let source, resolveOptions;
  const calls = [], slots = new Map(), events = new Map(), disposers = [];
  let states = [], cursor = 0;
  const React = {
    createElement: (type, props, ...children) => ({ type, props, children: children.flat(Infinity).filter(Boolean) }),
    Fragment: 'fragment', useSyncExternalStore: (_listen, read) => read(),
    useState: init => { const i = cursor++; if (!(i in states)) states[i] = init; return [states[i], value => { states[i] = value; }]; },
  };
  const ctx = {
    locale: { register: () => {}, bind: () => key => key, subscribe: () => () => {}, getSnapshot: () => 'zh' },
    effect: callback => { disposers.push(callback()); }, on: (name, callback) => events.set(name, callback),
    slots: { inject: (_name, callback) => callback(), register: (meta, component) => slots.set(meta.name, component) },
    conversation: { resolveDraftAttachments: () => [] },
    inputTriggers: { registerSource: value => { source = value; return () => {}; } },
    remote: { commands: { execute: async (id, line, attachments) => { calls.push({ id, request: commandRequest(line.slice(7), config), attachments }); return { ok: true, value: { result: { kind: 'success' } } }; } } },
  };
  vm.runInNewContext(code, {
    window: { __ModuleLoader__: { load: module => {
      const plugin = module.factory(name => { assert.equal(name, 'react'); return React; });
      // Cordis enforces the root service even when a child namespace is injected.
      // A plain mock context used to hide the missing `remote` dependency.
      const scoped = new Proxy(ctx, { get(target, key) {
        if (key === 'remote') assert.ok(plugin.inject.includes('remote'), 'remote requires root-service injection');
        return target[key];
      } });
      plugin.apply(scoped);
    } } },
    localStorage: { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) },
    AbortSignal,
    fetch: async url => { assert.equal(url, 'api/openai-image.options'); return { ok: true, json: () => new Promise(resolve => { resolveOptions = resolve; }) }; },
  });
  const finish = async () => { await new Promise(resolve => setImmediate(resolve)); resolveOptions({ models: MODELS, qualities: QUALITIES, sizes: SIZE_PRESETS,
    defaults: { model: config.defaultModel, quality: config.quality, size: config.size, sizeMode: 'prompt' } }); await new Promise(resolve => setImmediate(resolve)); };
  const input = { draft: '/draw a landscape', draftRev: 1, phase: 'plain', attachmentIds: [], occurrences: [] };
  const props = { sessionId: 'one', useInput: read => read(input), useSession: read => read({ running: false }), inputActions: { setDraft: draft => { input.draft = draft.text; input.occurrences = draft.references; } } };
  const render = () => { cursor = 0; return slots.get('conversation.input.dock')(props); };
  const all = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...tree.children.flatMap(all)];
  const control = label => all(render()).find(node => node.props?.['aria-label'] === label);
  return { calls, finish, input, props, render, control, source, saved, events, config };
}

test('visible options use real defaults, snapshot each request and isolate conversations', async () => {
  const f = fixture();
  const claim = f.source.matchClaim({ sessionId: 'one' }, '/draw');
  assert.equal((await claim.submit('draft')).kind, 'error'); assert.equal(f.calls.length, 0);
  await f.finish();
  assert.equal(f.control('model').props.value, MODELS[1].id);
  f.control('model').props.onChange({ target: { value: MODELS[0].id } });
  f.control('quality').props.onChange({ target: { value: 'low' } });
  f.input.draft = '/draw 16:9 landscape';
  assert.ok(JSON.stringify(f.render()).includes('1536 × 864'));
  const attachment = { type: 'image', data: 'dummy' };
  assert.equal((await claim.submit('16:9 landscape', null, [attachment])).kind, 'success');
  assert.equal(f.calls[0].request.model, MODELS[0].id); assert.equal(f.calls[0].request.quality, 'low'); assert.equal(f.calls[0].request.size, '1536x864');
  assert.equal(f.calls[0].attachments[0], attachment);
  f.control('quality').props.onChange({ target: { value: 'medium' } });
  assert.equal(f.calls[0].request.quality, 'low');
  await f.source.matchClaim({ sessionId: 'two' }, '/draw').submit('cat');
  assert.equal(f.calls[1].request.model, f.config.defaultModel);
  const reload = fixture(f.saved); await reload.finish();
  assert.ok(reload.control('quality'), JSON.stringify(reload.render()));
  assert.equal(reload.control('quality').props.value, 'medium');
});

test('bad sizes, load errors and command refusal never silently select a fallback or discard attachments', async () => {
  const f = fixture(); await f.finish(); const claim = f.source.matchClaim({ sessionId: 'one' }, '/draw');
  assert.equal((await claim.submit('1920x1080 poster')).kind, 'error'); assert.equal(f.calls.length, 0);
  f.control('size').props.onChange({ target: { value: '2048x1152' } });
  await claim.submit('1920x1080 poster'); assert.equal(f.calls[0].request.size, '2048x1152');
  f.input.phase = 'submitting';
  assert.equal(f.control('model').props.disabled, true);
  f.events.get('connection/reset')();
  assert.equal((await claim.submit('another')).kind, 'error'); assert.equal(f.calls.length, 1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { MODELS, QUALITIES, SIZE_PRESETS, commandRequest } from '../core.js';
const code = await readFile(new URL('../client.js', import.meta.url), 'utf8');

function fixture(saved = new Map()) {
  const config = { defaultModel: MODELS[1].id, quality: 'high', size: '1024x1536' };
  let source, resolveOptions;
  const calls = [], slots = new Map(), events = new Map(), disposers = [], definitions = new Map(), registrations = new Map();
  let states = [], cursor = 0;
  const drafts = new Map();
  const React = {
    createElement: (type, props, ...children) => ({ type, props, children: children.flat(Infinity).filter(Boolean) }),
    Fragment: 'fragment', useSyncExternalStore: (_listen, read) => read(),
    useState: init => { const i = cursor++; if (!(i in states)) states[i] = init; return [states[i], value => { states[i] = value; }]; },
    useRef: init => { const i = cursor++; if (!(i in states)) states[i] = { current: init }; return states[i]; },
    useEffect: callback => { callback(); },
  };
  const ctx = {
    locale: { register: () => {}, bind: () => key => key, subscribe: () => () => {}, getSnapshot: () => 'zh' },
    effect: callback => { disposers.push(callback()); }, on: (name, callback) => events.set(name, callback),
    slots: { inject: (_name, callback) => callback(), register: (meta, component) => {
      // DSH's read-image-toolview already owns this declaration. Re-declaring
      // it prevents cold boot, even when the requested spec is identical.
      assert.ok(!meta.children?.['tool.call.images'], 'must not redeclare the native image slot');
      slots.set(meta.name, component); registrations.set(meta.key ?? meta.name, { meta, component });
    } },
    uiConversation: { events: { register: definition => definitions.set(definition.kind, definition) } },
    conversation: {
      resolveDraftAttachments: ids => ids.map(id => drafts.get(id)).filter(Boolean),
      createDrafts: (_id, files) => files.map(file => { const draft = { id: `draft-${drafts.size}`, kind: 'image', file }; drafts.set(draft.id, draft); return draft; }),
      releaseDraftAttachment: id => drafts.delete(id), releaseDraftAttachments: items => items.forEach(item => drafts.delete(item.id)),
    },
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
    AbortSignal, File,
    fetch: async url => {
      if (url.startsWith('fixture-image:')) return { ok: true, blob: async () => new Blob([url]) };
      assert.equal(url, 'api/openai-image.options'); return { ok: true, json: () => new Promise(resolve => { resolveOptions = resolve; }) };
    },
  });
  const finish = async () => { await new Promise(resolve => setImmediate(resolve)); resolveOptions({ models: MODELS, qualities: QUALITIES, sizes: SIZE_PRESETS,
    defaults: { model: config.defaultModel, quality: config.quality, size: config.size, sizeMode: 'prompt' } }); await new Promise(resolve => setImmediate(resolve)); };
  const input = { draft: '/draw a landscape', draftRev: 1, phase: 'plain', attachmentIds: [], occurrences: [] };
  const props = { sessionId: 'one', useInput: read => read(input), useSession: read => read({ running: false }), inputActions: {
    setDraft: draft => { input.draft = draft.text; input.occurrences = draft.references; },
    addAttachments: ids => { input.attachmentIds = [...input.attachmentIds, ...ids]; return true; },
    removeAttachment: id => { input.attachmentIds = input.attachmentIds.filter(item => item !== id); },
  } };
  const render = () => { cursor = 0; return slots.get('conversation.input.dock')(props); };
  const all = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...tree.children.flatMap(all)];
  const control = label => all(render()).find(node => node.props?.['aria-label'] === label);
  const renderComponent = (component, componentProps, fresh = false) => { if (fresh) states = []; cursor = 0; return component(componentProps); };
  return { calls, finish, input, props, render, control, source, saved, events, config, definitions, registrations, all, renderComponent, drafts };
}

test('persisted image results render as an authorized gallery outside collapsed tool steps', () => {
  const f = fixture();
  const definition = f.definitions.get('openai-image-result');
  const attachment = { attachmentId: 'sha256:test', mediaType: 'image/png', width: 1024, height: 1536 };
  const event = { type: 'tool/result', surfaceOp: 'append', seq: 12, data: { message: {
    source: { callId: 'openai_image_test' }, content: [{ type: 'text', text: '图片已生成：test' }, { type: 'image', attachment }],
  } } };
  const match = definition.match['tool/result'](event);
  assert.equal(match.role, 'start');
  const context = { key: 'image:test', id: match.id, start: { event, location: { kind: 'step' } } };
  context.state = definition.start(context, { event });
  const node = definition.buildViewNode(context);
  assert.equal(node.groupTree, 'turn');
  assert.equal(node.data.block, event.data.message);
  const view = f.registrations.get('openai_generate_image');
  const loadImage = () => {};
  const tree = view.component({ block: node.data.block, phase: 'result', loadImage,
    renderFactorySlot: () => {} });
  const gallery = tree.children.find(child => typeof child.type === 'function');
  assert.equal(gallery.props.images[0].attachment, attachment);
  assert.equal(gallery.props.loadImage, loadImage);
  assert.ok(!tree.children.some(child => child.type === 'pre'));
  const failedEvent = { ...event, data: { message: { ...event.data.message, isError: true } } };
  const failedState = definition.start(context, { event: failedEvent });
  assert.equal(failedState.status, 'failed');
  const failedView = view.component({ block: failedEvent.data.message, phase: 'result' });
  assert.ok(!failedView.children.some(child => typeof child.type === 'function'));
});

test('visible options use real defaults, snapshot each request and isolate conversations', async () => {
  const f = fixture();
  const claim = f.source.matchClaim({ sessionId: 'one' }, '/draw');
  assert.equal((await claim.submit('draft')).kind, 'error'); assert.equal(f.calls.length, 0);
  await f.finish();
  assert.equal(f.control('model').props.value, MODELS[1].id);
  f.control('model').props.onChange({ target: { value: MODELS[0].id } });
  f.control('quality').props.onChange({ target: { value: 'low' } });
  f.input.draft = '/draw 画面比例16：9.人物要自然';
  assert.ok(JSON.stringify(f.render()).includes('1536 × 864'));
  const attachment = { type: 'image', data: 'dummy' };
  assert.equal((await claim.submit('画面比例16：9.人物要自然', null, [attachment])).kind, 'success');
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

test('version comparison selects an old image and edit loads exactly that image without submitting', async () => {
  const f = fixture(); await f.finish();
  const definition = f.definitions.get('openai-image-result');
  const nodeFor = (id, seq) => {
    const attachment = { attachmentId: `sha256:${id}`, mediaType: 'image/png', width: 1536, height: 864 };
    const event = { type: 'tool/result', surfaceOp: 'append', seq, data: { message: {
      source: { callId: id }, content: [{ type: 'text', text: '图片已生成：model，实际 1536x864，low。' }, { type: 'image', attachment }],
    } } };
    return definition.buildViewNode({ key: id, id, start: { event, location: { kind: 'step' } }, state: definition.start({}, { event }) });
  };
  const nodes = [nodeFor('old', 1), nodeFor('middle', 2), nodeFor('new', 3)];
  const snapshot = { nodes: new Map(nodes.map(node => [node.id, node])) };
  const component = f.registrations.get('openai-image-result').component;
  const props = { ...f.props, node: nodes[2], useConversation: read => read({ views: { get: () => snapshot } }),
    renderFactorySlot: (_name, props) => ({ type: 'gallery', props, children: [] }), loadImage: async image => `fixture-image:${image.attachmentId}` };
  let tree = f.renderComponent(component, props, true);
  f.all(tree).find(node => node.type === 'button' && node.children.includes('compare')).props.onClick();
  tree = f.renderComponent(component, props);
  f.all(tree).find(node => node.type === 'select').props.onChange({ target: { value: 'old:0' } });
  tree = f.renderComponent(component, props);
  const selected = f.all(tree).find(node => typeof node.type === 'function' && node.type.name === 'EditableImages' && node.props.images[0].attachment.attachmentId === 'sha256:old');
  assert.ok(selected, 'chosen old image is shown beside the current result');
  const meta = f.all(tree).find(node => typeof node.type === 'function' && node.type.name === 'ImageParameters');
  const parameters = f.renderComponent(meta.type, meta.props, true);
  assert.match(JSON.stringify(parameters), /1536x864/);
  assert.match(JSON.stringify(parameters), /low/);
  assert.match(JSON.stringify(parameters), /model/);
  const editView = f.renderComponent(selected.type, selected.props, true);
  await f.all(editView).find(node => node.type === 'button' && node.children.includes('edit')).props.onClick();
  assert.equal(f.calls.length, 0);
  assert.equal(f.input.attachmentIds.length, 1);
  assert.equal(await f.drafts.get(f.input.attachmentIds[0]).file.text(), 'fixture-image:sha256:old');
  assert.equal(f.input.draft, '/draw a landscape');
});

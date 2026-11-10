import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { MODELS, QUALITIES, SIZE_PRESETS, commandRequest } from '../core.js';
import { validateRelease } from '../updates.js';
const code = await readFile(new URL('../client.js', import.meta.url), 'utf8');

function fixture(saved = new Map()) {
  const config = { defaultModel: 'gpt-image-2.5-sunburst', quality: 'high', size: '1024x1536' };
  let source, resolveOptions;
  const calls = [], slots = new Map(), events = new Map(), disposers = [], definitions = new Map(), registrations = new Map(), translations = {};
  let states = [], cursor = 0;
  const drafts = new Map();
  let imageFetch = async url => ({ ok: true, blob: async () => new Blob([url]) });
  const session = { running: false }, cleanups = [];
  const updateCalls = [], timers = [], copies = [], navigations = [];
  let updateFetch = async () => ({ ok: true, json: async () => ({ currentVersion: '1.7.1', status: 'error' }) });
  const React = {
    createElement: (type, props, ...children) => ({ type, props, children: children.flat(Infinity).filter(Boolean) }),
    Fragment: 'fragment', useSyncExternalStore: (_listen, read) => read(),
    useState: init => { const i = cursor++; if (!(i in states)) states[i] = init; return [states[i], value => { states[i] = value; }]; },
    useRef: init => { const i = cursor++; if (!(i in states)) states[i] = { current: init }; return states[i]; },
    useEffect: callback => { const cleanup = callback(); if (cleanup) cleanups.push(cleanup); },
  };
  const ctx = {
    locale: { register: (_name, copy) => Object.assign(translations, copy), bind: () => (key, values) => values ? key + JSON.stringify(values) : key, subscribe: () => () => {}, getSnapshot: () => ({ active: 'zh', revision: 1 }) },
    effect: callback => { disposers.push(callback()); }, on: (name, callback) => events.set(name, callback),
    inject: (_deps, callback) => callback(ctx),
    pluginNavigation: { openBundle: name => navigations.push(name) },
    slots: { inject: (_name, callback) => callback(), register: (meta, component) => {
      // DSH's read-image-toolview already owns this declaration. Re-declaring
      // it prevents cold boot, even when the requested spec is identical.
      assert.ok(!meta.children?.['tool.call.images'], 'must not redeclare the native image slot');
      slots.set(meta.name, component); registrations.set(meta.key ?? meta.name, { meta, component });
      if (meta.id) registrations.set(meta.id, { meta, component });
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
    AbortSignal, AbortController, File,
    setTimeout: (callback, ms) => { const item = { callback, ms }; timers.push(item); return item; }, clearTimeout: () => {},
    navigator: { clipboard: { writeText: async text => copies.push(text) } },
    fetch: async url => {
      if (url.startsWith('fixture-image:')) return imageFetch(url);
      if (url.startsWith('api/openai-image.updates')) { updateCalls.push(url); return updateFetch(url); }
      assert.equal(url, 'api/openai-image.options'); return { ok: true, json: () => new Promise(resolve => { resolveOptions = resolve; }) };
    },
  });
  const finish = async () => { await new Promise(resolve => setImmediate(resolve)); resolveOptions({ models: MODELS, qualities: QUALITIES, sizes: SIZE_PRESETS,
    defaults: { model: config.defaultModel, quality: config.quality, size: config.size, sizeMode: 'prompt' } }); await new Promise(resolve => setImmediate(resolve)); };
  const input = { draft: '/draw a landscape', draftRev: 1, phase: 'plain', attachmentIds: [], occurrences: [] };
  const props = { sessionId: 'one', useInput: read => read(input), useSession: read => read(session), inputActions: {
    setDraft: draft => { input.draft = draft.text; input.draftRev++; input.occurrences = draft.references; },
    addAttachments: ids => { input.attachmentIds = [...input.attachmentIds, ...ids]; return true; },
    removeAttachment: id => { input.attachmentIds = input.attachmentIds.filter(item => item !== id); },
  } };
  const render = () => { cursor = 0; return slots.get('conversation.input.dock')(props); };
  const all = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...tree.children.flatMap(all)];
  const control = label => all(render()).find(node => node.props?.['aria-label'] === label);
  const renderComponent = (component, componentProps, fresh = false) => { if (fresh) states = []; cursor = 0; return component(componentProps); };
  return { calls, finish, input, props, render, control, source, saved, events, config, definitions, registrations, all, renderComponent, drafts, translations,
    ctx, session, timers, copies, navigations, updateCalls, setUpdateFetch: fn => updateFetch = fn,
    setImageFetch: fn => imageFetch = fn, unmount: () => [...cleanups, ...disposers].forEach(fn => { if (typeof fn === 'function') fn(); }) };
}

test('update badge, manual check, copy, ignore and manager navigation never change image drafts or send commands', async () => {
  const f = fixture(); await f.finish();
  const reply = { currentVersion: '1.7.1', status: 'available', source: 'Gitee', compatibility: 'compatible',
    release: validateRelease({ schema: 1, package: 'dsh-openai-image', version: '1.8.0', publishedAt: '2026-11-10', sha256: 'a'.repeat(64),
      dshVersions: ['0.2.2-rc.1'], notes: { zh: ['测试说明'], en: ['Test notes'] } }) };
  f.setUpdateFetch(async () => ({ ok: true, json: async () => reply }));
  const draw = () => f.renderComponent(f.registrations.get('openai-image-draw').component, f.props, true);
  const panel = () => f.renderComponent(f.registrations.get('openai-image-updates').component, f.props, true);
  const button = label => f.all(panel()).find(n => n.type === 'button' && n.children.includes(label));
  const original = JSON.stringify(f.input);
  assert.equal(panel(), null, 'background checks never open the panel');
  await f.timers[0].callback(); await new Promise(resolve => setImmediate(resolve));
  assert.ok(f.all(draw()).some(n => n.type === 'button' && n.children.includes('updateBadge')));
  assert.equal(panel(), null);
  f.all(draw()).find(n => n.props?.['aria-label'] === 'updates').props.onClick();
  assert.ok(button('copyGitee'));
  assert.ok(JSON.stringify(panel()).includes('测试说明'), 'release notes follow the native locale snapshot');
  await button('copyGitee').props.onClick(); assert.equal(f.copies[0], reply.release.links.gitee);
  await button('copyGithub').props.onClick(); assert.equal(f.copies[1], reply.release.links.github);
  button('ignoreUpdate').props.onClick(); assert.equal(panel(), null);
  assert.ok(!f.all(draw()).some(n => n.children.includes('updateBadge')));
  f.all(draw()).find(n => n.props?.['aria-label'] === 'updates').props.onClick();
  await button('checkUpdate').props.onClick(); assert.ok(f.updateCalls.at(-1).endsWith('?manual=1'));
  assert.ok(JSON.stringify(panel()).includes('updateIgnored'));
  f.session.running = true; assert.equal(button('openPlugins').props.disabled, true);
  f.session.running = false; button('openPlugins').props.onClick();
  assert.deepEqual(f.navigations, ['dsh-openai-image']); assert.equal(panel(), null);
  assert.equal(JSON.stringify(f.input), original); assert.equal(f.calls.length, 0);
  f.unmount();
});

test('incompatible release disables installation copying, errors remain in update panel without blocking draw', async () => {
  const f = fixture(); await f.finish();
  const panel = () => f.renderComponent(f.registrations.get('openai-image-updates').component, f.props, true);
  const draw = f.renderComponent(f.registrations.get('openai-image-draw').component, f.props, true);
  f.all(draw).find(n => n.props?.['aria-label'] === 'updates').props.onClick();
  const check = () => f.all(panel()).find(n => n.type === 'button' && n.children.includes('checkUpdate')).props.onClick();
  f.setUpdateFetch(async () => ({ ok: true, json: async () => ({ currentVersion: '1.7.1', status: 'available', source: 'GitHub', compatibility: 'incompatible',
    release: validateRelease({ schema: 1, package: 'dsh-openai-image', version: '2.0.0', publishedAt: '2026-11-10', sha256: 'a'.repeat(64),
      dshVersions: ['0.3.0'], notes: { zh: ['需要新版'], en: ['Needs a newer DSH'] } }) }) }));
  await check(); assert.ok(JSON.stringify(panel()).includes('incompatibleDsh'));
  assert.equal(f.all(panel()).find(n => n.type === 'button' && n.children.includes('copyGitee')).props.disabled, true);
  f.setUpdateFetch(async () => { throw new Error('offline'); }); await check();
  assert.ok(JSON.stringify(panel()).includes('updateFailed'));
  assert.equal((await f.source.matchClaim({ sessionId: 'one' }, '/draw').submit('cat')).kind, 'success');
  f.unmount();
});

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
  assert.equal(f.control('model').props.value, f.config.defaultModel);
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

test('2.6 models are selectable with bilingual tooltips while saved legacy choices survive', async () => {
  const old = { model: 'gpt-image-2.5-flare', quality: 'low', size: '864x1536', sizeMode: 'manual' };
  const f = fixture(new Map([['dsh.openaiImage.options.v1:one', JSON.stringify(old)]]));
  await f.finish();
  assert.equal(f.control('model').props.value, old.model);
  assert.equal(f.control('quality').props.value, old.quality);
  assert.equal(f.control('size').props.value, old.size);
  for (const id of ['gpt-image-2.6-flare', 'gpt-image-2.6-sunburst']) {
    const option = f.all(f.control('model')).find(node => node.type === 'option' && node.props.value === id);
    assert.ok(option, `${id} must be available in the draw picker`);
    assert.equal(option.props.title, id);
    for (const language of ['zh', 'en']) assert.match(f.translations[language][id], /PNG/);
    const label = f.registrations.get('conversation.input.model.label').component({ provider: { id: 'openai-image' }, model: MODELS.find(model => model.id === id) });
    assert.ok(label.props.title.startsWith(id));
    f.control('model').props.onChange({ target: { value: id } });
    const reference = { type: 'image', data: 'reference' };
    await f.source.matchClaim({ sessionId: 'one' }, '/draw').submit('修改背景，保留构图', null, [reference]);
    assert.equal(f.calls.at(-1).request.model, id);
    assert.equal(f.calls.at(-1).request.quality, old.quality);
    assert.equal(f.calls.at(-1).request.size, old.size);
    assert.equal(f.calls.at(-1).attachments[0], reference);
  }
  const reload = fixture(f.saved); await reload.finish();
  assert.equal(reload.control('model').props.value, 'gpt-image-2.6-sunburst');
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

async function recoveryFixture() {
  const f = fixture(); await f.finish();
  const saved = { version: 1, operation: 'edit', prompt: '图1在左，图2在中，图3在右，16:9', model: 'gpt-image-2.6-flare', quality: 'low', size: '1536x864',
    draft: { prompt: ' 图1在左，图2在中，图3在右，16:9\n', size: '1024x1024', sizeMode: 'prompt' },
    references: ['C', 'A', 'B'].map(id => ({ attachmentId: id, mediaType: 'image/png', name: `${id}.png` })), issues: [] };
  const commandCalls = [];
  f.ctx.remote.commands.execute = async (sessionId, line, attachments) => {
    commandCalls.push({ sessionId, line, attachments });
    return { ok: true, value: { result: { kind: 'success', text: line.startsWith('/image-recover') ? JSON.stringify(saved) : undefined } } };
  };
  const cardProps = { ...f.props, node: { data: { callId: 'failed', status: 'failed', operation: 'edit', request: saved } },
    useConversation: read => read({ views: { get: () => ({ nodes: new Map() }) } }), loadImage: async ref => `fixture-image:${ref.attachmentId}` };
  const card = f.renderComponent(f.registrations.get('openai-image-result').component, cardProps, true);
  const actions = f.all(card).find(node => typeof node.type === 'function' && node.type.name === 'RecoveryActions');
  assert.ok(actions, 'failed card exposes recovery actions');
  let first = true;
  const render = () => { const tree = f.renderComponent(actions.type, actions.props, first); first = false; return tree; };
  const button = label => f.all(render()).find(node => node.type === 'button' && node.children.includes(label));
  return { ...f, savedRequest: saved, commandCalls, renderActions: render, action: button };
}

test('re-edit asks before replacing, restores all three references in order and original draft settings, without generating', async () => {
  const f = await recoveryFixture();
  const [old] = f.ctx.conversation.createDrafts('one', [new File(['old'], 'old.png', { type: 'image/png' })]);
  f.input.attachmentIds = [old.id];
  await f.action('reedit').props.onClick();
  assert.ok(f.action('replace'));
  assert.equal(f.input.draft, '/draw a landscape');
  f.action('keepDraft').props.onClick();
  assert.deepEqual(f.input.attachmentIds, [old.id]); assert.ok(f.drafts.has(old.id));
  await f.action('reedit').props.onClick();
  await f.action('replace').props.onClick();
  assert.equal(f.input.draft, '/draw ' + f.savedRequest.draft.prompt);
  assert.deepEqual(await Promise.all(f.input.attachmentIds.map(id => f.drafts.get(id).file.text())), ['fixture-image:C', 'fixture-image:A', 'fixture-image:B']);
  assert.ok(!f.drafts.has(old.id));
  assert.ok(f.commandCalls.every(call => call.line === '/image-recover failed'));
  const options = JSON.parse(f.saved.get('dsh.openaiImage.options.v1:one'));
  assert.equal(options.model, f.savedRequest.model); assert.equal(options.quality, 'low');
  assert.equal(options.sizeMode, 'prompt'); assert.equal(options.size, '1024x1024');
  assert.deepEqual([...f.input.occurrences], []);
});

test('a missing middle reference, draft edits during reads, or unmount leave the original composer intact', async () => {
  for (const scenario of ['missing', 'changed', 'unmount', 'admission']) {
    const f = await recoveryFixture();
    f.setImageFetch(async url => {
      if (url.endsWith(':A')) {
        if (scenario === 'missing') return { ok: false };
        if (scenario === 'changed') { f.input.draft = 'new typing'; f.input.draftRev++; }
        if (scenario === 'unmount') f.unmount();
      }
      return { ok: true, blob: async () => new Blob([url]) };
    });
    if (scenario === 'admission') f.props.inputActions.addAttachments = () => false;
    await f.action('reedit').props.onClick();
    await f.action('replace').props.onClick();
    assert.equal(f.input.draft, scenario === 'changed' ? 'new typing' : '/draw a landscape');
    assert.deepEqual(f.input.attachmentIds, []);
    assert.equal(f.drafts.size, 0, 'no leaked partial attachment drafts');
    if (scenario === 'missing') assert.match(JSON.stringify(f.renderActions()), /referenceMissing.*index.*2/);
    assert.ok(f.commandCalls.every(call => call.line.startsWith('/image-recover')));
  }
});

test('direct retry is single-flight and leaves unrelated text, references and selected settings untouched', async () => {
  const f = await recoveryFixture();
  const [draft] = f.ctx.conversation.createDrafts('one', [new File(['mine'], 'mine.png', { type: 'image/png' })]);
  f.input.attachmentIds = [draft.id];
  const previous = JSON.stringify(f.input);
  let complete, calls = 0;
  f.ctx.remote.commands.execute = async (_id, line) => {
    assert.equal(line, '/image-retry failed'); calls++;
    await new Promise(resolve => complete = resolve);
    return { ok: true, value: { result: { kind: 'success' } } };
  };
  const retry = f.action('retryOriginal').props.onClick;
  const pending = retry(); await retry(); assert.equal(calls, 1);
  complete(); await pending;
  assert.equal(JSON.stringify(f.input), previous);
  assert.equal(f.saved.size, 0); assert.ok(f.drafts.has(draft.id));
  assert.match(JSON.stringify(f.renderActions()), /retried/);
  f.session.running = true;
  assert.equal(f.action('retryOriginal').props.disabled, true);
});

test('incomplete legacy parameters restore as explicit blanks and cannot send using current defaults', async () => {
  const f = await recoveryFixture();
  delete f.savedRequest.quality;
  delete f.savedRequest.size;
  f.savedRequest.draft = { prompt: 'legacy', sizeMode: 'manual' };
  f.savedRequest.references = [];
  f.savedRequest.operation = 'generate';
  f.savedRequest.issues = ['quality missing', 'size missing'];
  await f.action('reedit').props.onClick(); await f.action('replace').props.onClick();
  const claim = f.source.matchClaim({ sessionId: 'one' }, '/draw');
  assert.equal((await claim.submit('legacy')).kind, 'error');
  const recovered = JSON.parse(f.saved.get('dsh.openaiImage.options.v1:one'));
  assert.equal(recovered.quality, ''); assert.equal(recovered.size, '');
  const reload = fixture(f.saved); await reload.finish();
  assert.equal((await reload.source.matchClaim({ sessionId: 'one' }, '/draw').submit('legacy')).kind, 'error');
});

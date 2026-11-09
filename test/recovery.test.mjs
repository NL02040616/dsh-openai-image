import test from 'node:test';
import assert from 'node:assert/strict';
import { commandRequest, commandDraft, generateImage, OPTIONS_PREFIX } from '../core.js';
import { REQUEST_RECORD, requestSnapshot, recoverRequest } from '../recovery.js';
import { createImageHistory } from '../image-history.js';

const config = { defaultModel: 'gpt-image-2.6-flare', quality: 'low', size: '1024x1024', timeoutMs: 1000 };
const references = ['third', 'first', 'second'].map(id => ({ attachmentId: `sha256:${id}`, mediaType: 'image/png', width: 1024, height: 1536, name: `${id}.png` }));
const call = (id, args, name = 'openai_edit_image') => ({ type: 'tool/call', seq: 2, data: { callId: id, name, arguments: JSON.stringify(args) } });
const user = (prompt, refs, selection) => ({ type: 'user/message', data: { role: 'user', source: { kind: 'user', ...(selection ? { openaiImage: selection } : {}) },
  content: [{ type: 'text', text: prompt }, ...refs.map(attachment => ({ type: 'image', attachment }))] } });

test('request snapshot matches the failed API body, preserving draft mode, text and reference order through JSON replay', async () => {
  const draft = { prompt: '  图1在左侧，图2在中间，图3在右侧。\n画面比例16：9  ', model: config.defaultModel, quality: 'low', size: '1024x1024', sizeMode: 'prompt' };
  const raw = OPTIONS_PREFIX + JSON.stringify({ ...draft, size: '1536x864', sizeMode: 'manual', draftSize: draft.size, draftSizeMode: draft.sizeMode });
  const args = commandRequest(raw, config);
  const snapshot = requestSnapshot(args, { ...config, apiKey: 'never-store', proxyUrl: 'private-proxy' }, references, 'edit', commandDraft(raw, config));
  let calls = 0;
  await assert.rejects(generateImage({ args, config, references, resolveKey: async () => 'fake-key', readImage: async ref => ({ data: Buffer.from(ref.attachmentId) }),
    fetchImpl: async (_url, init) => {
      calls++;
      const body = JSON.parse(init.body);
      for (const key of ['prompt', 'model', 'quality', 'size']) assert.equal(body[key], snapshot[key]);
      assert.deepEqual(body.images.map(image => Buffer.from(image.image_url.split(',')[1], 'base64').toString()), references.map(ref => ref.attachmentId));
      return Response.json({ error: { message: 'simulated proxy failure' } }, { status: 503 });
    }, saveImage: () => assert.fail('failed call must not save a result'),
  }), /simulated proxy failure/);
  assert.equal(calls, 1);
  const log = JSON.parse(JSON.stringify([call('one', args), { type: REQUEST_RECORD, seq: 3, ignorable: true, data: { callId: 'one', request: snapshot } }]));
  const recovered = recoverRequest(log, 'one');
  assert.deepEqual(recovered.issues, []);
  assert.equal(recovered.draft.prompt, draft.prompt);
  assert.equal(recovered.draft.sizeMode, 'prompt');
  assert.equal(recovered.draft.size, '1024x1024');
  assert.equal(recovered.size, '1536x864');
  assert.deepEqual(recovered.references, references);
  assert.doesNotMatch(JSON.stringify(log), /never-store|private-proxy|fake-key/);
  const history = createImageHistory();
  let state = history.definition.start({}, { event: log[0] });
  state = history.definition.update({ state }, { event: log[1] });
  state = history.definition.update({ state }, { event: { type: 'tool/result', seq: 4, data: { message: { source: { callId: 'one' }, isError: true, content: [] } } } });
  assert.equal(state.status, 'failed');
  assert.deepEqual(state.request, recovered);
  assert.equal(history.info(state.block, state.meta, {}, state.request).requestedSize, '1536x864');
});

test('legacy recovery is tied to the original call, never later messages or current defaults', () => {
  const args = { prompt: 'original prompt', model: config.defaultModel };
  const log = [user('original prompt', references), call('old', args), user('later prompt', [references[1]], { version: 1, model: 'wrong', quality: 'high', size: '864x1536' })];
  const saved = recoverRequest(log, 'old');
  assert.equal(saved.prompt, 'original prompt');
  assert.deepEqual(saved.references, references);
  assert.equal(saved.quality, undefined);
  assert.equal(saved.size, undefined);
  assert.ok(saved.issues.some(issue => issue.includes('quality')));
  assert.ok(saved.issues.some(issue => issue.includes('size')));
  assert.throws(() => recoverRequest(log, 'other-session'), /找不到/);
  const marker = { version: 1, model: config.defaultModel, quality: 'medium', size: '1536x864' };
  const known = recoverRequest([user('saved prompt', references, marker), call('openai_image_legacy', {})], 'openai_image_legacy');
  assert.deepEqual(known.issues, []);
  assert.equal(known.quality, 'medium');
  assert.deepEqual(known.references, references);
});

test('invalid history stays explicitly incomplete; default edit dimensions are captured before failure', () => {
  const invalid = recoverRequest([call('bad', null)], 'bad');
  assert.ok(invalid.issues.length >= 5);
  assert.ok(recoverRequest([call('malformed', { prompt: 5, model: [] })], 'malformed').issues.length >= 5);
  const request = requestSnapshot({ prompt: 'edit the background' }, config, references, 'edit');
  assert.equal(request.size, '1024x1536');
  assert.equal(request.quality, 'low');
  assert.deepEqual(request.references, references);
  assert.throws(() => commandDraft(OPTIONS_PREFIX + JSON.stringify({ prompt: 'hello', model: config.defaultModel, quality: 'low', size: '1536x864', draftSizeMode: 'unknown' }), config), /尺寸选项/);
});

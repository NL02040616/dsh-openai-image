import assert from 'node:assert/strict';
import test from 'node:test';
import { commandRequest, OPTIONS_PREFIX, generateImage, isTitleRequest, promptFromMessages, referenceImages, requestFromMessages, validateRequest } from '../core.js';

const config = { apiKeyEnv: 'OPENAI_API_KEY', defaultModel: 'gpt-image-2.5-flare', quality: 'medium', size: '1024x1024', timeoutMs: 1000 };
const png = Buffer.from('89504e470d0a1a0a0000000049454e44ae426082', 'hex');
const response = () => ({ ok: true, status: 200, json: async () => ({ data: [{ b64_json: png.toString('base64') }], usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 } }) });

test('per-image selections are explicit, validated, and keep prompt text separate', () => {
  const selected = { model: 'gpt-image-1-mini', quality: 'low', size: '1024x1536', prompt: '画出文字 "high"\n新建图片：雪山' };
  assert.deepEqual(commandRequest(OPTIONS_PREFIX + JSON.stringify(selected), config), { ...selected, n: 1, output_format: 'png' });
  assert.equal(commandRequest('plain prompt', config).model, config.defaultModel);
  for (const bad of [null, {}, { ...selected, model: 'unknown' }, { ...selected, quality: 'auto' }, { ...selected, size: undefined }]) {
    assert.throws(() => commandRequest(OPTIONS_PREFIX + JSON.stringify(bad), config));
  }
  assert.throws(() => commandRequest(OPTIONS_PREFIX + '{', config));
});

test('the displayed size and quality also apply to edits with a differently oriented reference', async () => {
  const selected = { model: 'gpt-image-1-mini', quality: 'low', size: '1024x1536', prompt: 'make a portrait poster' };
  let calls = 0;
  const result = await generateImage({
    args: commandRequest(OPTIONS_PREFIX + JSON.stringify(selected), config), config,
    references: [{ attachmentId: 'landscape', mediaType: 'image/png', width: 1536, height: 1024 }],
    readImage: async () => ({ data: png }), resolveKey: async () => 'dummy-key', saveImage: async () => ({ attachmentId: 'output' }),
    fetchImpl: async (url, init) => {
      calls++;
      const body = JSON.parse(init.body);
      assert.ok(url.endsWith('/edits'));
      for (const key of ['model', 'quality', 'size', 'prompt']) assert.equal(body[key], selected[key]);
      return response();
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.size, selected.size);
});

test('one-shot creation ignores old pictures and editing uses only visible attached references', () => {
  const old = { attachmentId: 'old', mediaType: 'image/png' };
  const chosen = { attachmentId: 'chosen', mediaType: 'image/png' };
  const history = [{ role: 'assistant', source: { kind: 'model', provider: 'openai-image' }, content: [{ type: 'image', attachment: old }] }];
  const request = { role: 'user', source: { kind: 'user', openaiImage: { version: 1, model: config.defaultModel } }, content: [{ type: 'text', text: 'draw a new scene' }] };
  assert.deepEqual(requestFromMessages([...history, request]).references, []);
  request.content.push({ type: 'image', attachment: chosen });
  assert.deepEqual(requestFromMessages([...history, request]).references, [chosen]);
  assert.equal(requestFromMessages([...history, request]).prompt, 'draw a new scene');
});

test('one official request, correct parameters and durable image result, no key in output', async () => {
  let calls = 0;
  const result = await generateImage({
    args: { prompt: '画一只猫', size: '1536x1024', quality: 'low' }, config,
    resolveKey: async () => 'sk-test-secret',
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, 'https://api.openai.com/v1/images/generations');
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers.authorization, 'Bearer sk-test-secret');
      assert.deepEqual(JSON.parse(options.body), { model: config.defaultModel, prompt: '画一只猫', quality: 'low', size: '1536x1024', n: 1, output_format: 'png' });
      return response();
    },
    saveImage: async input => {
      assert.deepEqual(input.data, png);
      assert.equal(input.mediaType, 'image/png');
      return { id: 'stored-image', mediaType: 'image/png' };
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.attachment.id, 'stored-image');
  assert.equal(result.usage.totalTokens, 30);
  assert.ok(!JSON.stringify(result).includes('sk-test-secret'));
});

test('invalid arguments and missing credential do not dispatch or save', async () => {
  let calls = 0;
  const common = { config, fetchImpl: async () => { calls++; }, saveImage: async () => { throw new Error('unexpected save'); }, resolveKey: async () => undefined };
  await assert.rejects(generateImage({ ...common, args: { prompt: '' } }), error => error.code === 'INVALID_REQUEST');
  await assert.rejects(generateImage({ ...common, args: { prompt: 'cat' } }), error => error.code === 'MISSING_CREDENTIAL');
  assert.throws(() => validateRequest({ prompt: 'cat', model: 'unknown' }, config));
  assert.equal(calls, 0);
});

test('quota failure is classified, redacted, and never automatically retried', async () => {
  let calls = 0;
  await assert.rejects(generateImage({
    args: { prompt: 'cat' }, config,
    resolveKey: async () => 'sk-test-secret',
    saveImage: async () => { throw new Error('unexpected save'); },
    fetchImpl: async () => { calls++; return { ok: false, status: 429, json: async () => ({ error: { code: 'insufficient_quota', message: 'no quota sk-test-secret' } }) }; },
  }), error => error.code === 'QUOTA' && !error.message.includes('sk-test-secret'));
  assert.equal(calls, 1);
});

test('cancelled invocation makes no request', async () => {
  const cancel = new AbortController();
  cancel.abort(new Error('cancelled by user'));
  await assert.rejects(generateImage({ args: { prompt: 'cat' }, config, signal: cancel.signal, resolveKey: async () => { throw new Error('unexpected read'); } }), /cancelled by user/);
});

test('malformed image is not published', async () => {
  await assert.rejects(generateImage({
    args: { prompt: 'cat' }, config, resolveKey: async () => 'sk-test',
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ data: [{ b64_json: Buffer.from('not a PNG').toString('base64') }] }) }),
    saveImage: async () => { throw new Error('unexpected save'); },
  }), error => error.code === 'INVALID_RESPONSE');
});

test('only latest real user message is the image prompt; injected context is not sent', () => {
  const messages = [
    { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'old prompt' }] },
    { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'current prompt' }] },
    { role: 'user', source: { kind: 'context' }, content: [{ type: 'text', text: 'private workspace information' }] },
  ];
  assert.equal(promptFromMessages(messages), 'current prompt');
  assert.equal(isTitleRequest(messages), false);
  assert.equal(isTitleRequest([{ role: 'user', source: { kind: 'dsh-session-title-llm' } }]), true);
});

const ref = (id, width = 1024, height = 1024) => ({ attachmentId: `sha256:${id}`, mediaType: 'image/png', width, height });
const user = (text, refs = []) => ({ role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text }, ...refs.map(attachment => ({ type: 'image', attachment }))] });
const output = attachment => ({ role: 'assistant', source: { kind: 'model', provider: 'openai-image' }, content: [{ type: 'image', attachment }] });

test('current upload batch wins, order is preserved, duplicates and injected images are excluded', () => {
  const first = ref('a'), second = ref('b');
  const messages = [user('old', [ref('old')]), output(ref('previous')), user('combine', [first, second, first]),
    { role: 'user', source: { kind: 'runtime-context' }, content: [{ type: 'image', attachment: ref('private') }] }];
  assert.deepEqual(requestFromMessages(messages), { prompt: 'combine', references: [first, second] });
});

test('follow-up edits use latest output, separate upload messages work, and new-image boundary resets references', () => {
  const upload = ref('upload'), edited = ref('edited');
  assert.deepEqual(referenceImages([user('', [upload]), user('make red')]), [upload]);
  const messages = [user('make red', [upload]), output(edited), user('now yellow')];
  assert.deepEqual(referenceImages(messages), [edited]);
  assert.deepEqual(requestFromMessages([...messages, user('新建图片：一只猫')]), { prompt: '一只猫', references: [] });
  assert.deepEqual(requestFromMessages([...messages, user('/new a cat')]), { prompt: 'a cat', references: [] });
  assert.deepEqual(referenceImages([...messages, user('/new a cat'), user('try again')]), []);
});

test('only successful image-tool results can become follow-up references', () => {
  const attachment = ref('tool-image');
  const call = { role: 'assistant', source: { kind: 'model', provider: 'chat' }, content: [{ type: 'tool-call', id: 'call1', name: 'openai_edit_image', arguments: '{}' }] };
  const result = { role: 'tool', source: { kind: 'tool', callId: 'call1' }, content: [{ type: 'image', attachment }] };
  assert.deepEqual(referenceImages([call, result, user('adjust')]), [attachment]);
  assert.deepEqual(referenceImages([result, user('adjust')]), []);
  assert.deepEqual(referenceImages([call, { ...result, isError: true }, user('adjust')]), []);
});

test('editing sends actual reference bytes to official edit endpoint and preserves portrait orientation', async () => {
  const references = [ref('portrait', 800, 1200), ref('second')];
  const read = [];
  const result = await generateImage({
    args: { prompt: 'make red' }, config, references,
    resolveKey: async () => 'sk-test',
    readImage: async attachment => { read.push(attachment); return { ref: attachment, data: png }; },
    saveImage: async () => ref('saved'),
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/images/edits');
      const body = JSON.parse(options.body);
      assert.equal(body.size, '1024x1536');
      assert.equal(body.prompt, 'make red');
      assert.deepEqual(body.images, references.map(() => ({ image_url: `data:image/png;base64,${png.toString('base64')}` })));
      assert.ok(!options.body.includes('sha256:'));
      return response();
    },
  });
  assert.deepEqual(read, references);
  assert.equal(result.operation, 'edit');
  assert.equal(result.referenceCount, 2);
});

test('bad or unreadable references fail before any paid request; cancellation during read is preserved', async () => {
  let calls = 0;
  const common = { args: { prompt: 'edit' }, config, resolveKey: async () => 'sk-test', fetchImpl: async () => { calls++; }, readImage: async () => { throw new Error('missing file'); } };
  await assert.rejects(generateImage({ ...common, references: Array(17).fill(ref('many')) }), error => error.code === 'INVALID_REQUEST');
  await assert.rejects(generateImage({ ...common, references: [{ ...ref('gif'), mediaType: 'image/gif' }] }), error => error.code === 'INVALID_REQUEST');
  await assert.rejects(generateImage({ ...common, references: [ref('missing')] }), /重新上传/);
  const cancel = new AbortController();
  await assert.rejects(generateImage({ ...common, references: [ref('cancelled')], signal: cancel.signal,
    readImage: async () => { cancel.abort(new Error('cancel read')); return { data: png }; },
  }), /cancel read/);
  assert.equal(calls, 0);
});

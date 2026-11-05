import test from 'node:test';
import assert from 'node:assert/strict';
import { createSizing } from '../sizing.js';
import { commandRequest, generateImage } from '../core.js';
const sizing = createSizing();
const model = 'gpt-image-2.5-flare';
const config = { defaultModel: model, quality: 'medium', size: '1024x1024', timeoutMs: 1000 };

test('description ratios and explicit pixels determine the actual request for every entry point', async () => {
  for (const [prompt, size] of [
    ['画一个16:9的海报', '1536x864'], ['画幅 9：16', '864x1536'], ['比例 4:5', '896x1120'],
    ['生成 2048 × 1152 像素', '2048x1152'], ['宽1536像素，高864像素', '1536x864'],
    ['参考图1024x1024，最终输出2048x1152', '2048x1152'], ['海报', '1024x1024'],
    ['画面比例16：9.人物要自然', '1536x864'], ['画幅9:16. Keep the subject centered.', '864x1536'],
    ['Output 1536x864.', '1536x864'], ['生成2048×1152.背景留白', '2048x1152'],
  ]) {
    assert.equal(commandRequest(prompt, config).size, size);
    await generateImage({ args: { model, prompt }, config,
      resolveKey: async () => 'dummy', saveImage: async () => ({}),
      fetchImpl: async (_url, init) => {
        assert.equal(JSON.parse(init.body).size, size);
        return { ok: true, json: async () => ({ data: [{ b64_json: 'iVBORw0KGgo=' }] }) };
      },
    });
  }
});

test('sentence punctuation does not hide dimensions or truncate decimal numbers', () => {
  for (const punctuation of ['.', '。', '，', ',', '!', '！', ';', '；', '\n']) {
    assert.equal(sizing.fromPrompt(`画面比例16：9${punctuation}人物要自然`, model), '1536x864');
    assert.equal(sizing.fromPrompt(`输出1536x864${punctuation}背景留白`, model), '1536x864');
  }
  assert.equal(sizing.fromPrompt('比例1.5:1.画面居中', model), '1536x1024');
  assert.equal(sizing.fromPrompt('比例16:9.123', model), undefined);
  assert.equal(sizing.fromPrompt('尺寸1536x864.5', model), undefined);
});

test('invalid pixels, ambiguous dimensions and unsupported Mini ratios fail before billing', async () => {
  let calls = 0;
  for (const prompt of ['1920x1080', '256x256', '4000x4000', '生成比例4:1', '1024x1024 或 1536x1024', '16:9 或 9:16']) {
    await assert.rejects(generateImage({ args: { prompt }, config, resolveKey: async () => 'dummy', fetchImpl: async () => { calls++; } }));
  }
  assert.throws(() => sizing.resolve({ model: 'gpt-image-1-mini', prompt: '16:9 海报' }), /Mini/);
  assert.equal(calls, 0);
});

test('manual sizing is explicit, exact ratios stay exact, and non-pixel measurements are ignored', () => {
  assert.equal(sizing.resolve({ model, prompt: '16:9 poster', sizeMode: 'manual', size: '1024x1024' }).size, '1024x1024');
  assert.equal(sizing.resolve({ model, prompt: '打印20x30厘米' }).size, '1024x1024');
  assert.equal(sizing.resolve({ model, prompt: '画一个时钟显示16:09' }).size, '1024x1024');
  const [w, h] = sizing.resolve({ model, prompt: '比例21:9' }).size.split('x').map(Number);
  assert.equal(w / h, 21 / 9);
  assert.equal(sizing.resolve({ model, size: '3840x2160' }).experimental, true);
});

test('result reports PNG dimensions instead of claiming the requested size was returned', async () => {
  const png = Buffer.alloc(33);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(png); png.write('IHDR', 12); png.writeUInt32BE(1024, 16); png.writeUInt32BE(1024, 20);
  const result = await generateImage({ args: { prompt: '16:9' }, config, resolveKey: async () => 'dummy', saveImage: async () => ({}),
    fetchImpl: async () => ({ ok: true, json: async () => ({ data: [{ b64_json: png.toString('base64') }] }) }),
  });
  assert.equal(result.requestedSize, '1536x864'); assert.equal(result.size, '1024x1024');
});

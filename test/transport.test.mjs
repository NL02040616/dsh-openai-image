import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import http from 'node:http';
import test from 'node:test';
import { generateImage } from '../core.js';
import { createImageFetch, transportMode, windowsFetch } from '../transport.js';

const endpoint = 'https://api.openai.com/v1/images/generations';
const config = { timeoutMs: 10000, networkMode: 'system' };
const options = { method: 'POST', redirect: 'error', headers: { authorization: 'Bearer fixture-secret', 'content-type': 'application/json' }, body: '{"prompt":"测试 café"}' };

function fakeHelper(reply, capture = {}, { hang = false, exitCode = 0 } = {}) {
  return (executable, args, spawnOptions) => {
    Object.assign(capture, { executable, args, spawnOptions });
    const child = new EventEmitter();
    const input = [];
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => { capture.killed = true; child.emit('close', null); };
    child.stdin = new Writable({ write(chunk, _encoding, done) { input.push(chunk); done(); } });
    child.stdin.on('finish', () => {
      capture.packet = JSON.parse(Buffer.concat(input).toString());
      if (hang) return;
      child.stdout.end(typeof reply === 'string' ? reply : JSON.stringify(reply));
      child.emit('close', exitCode);
    });
    return child;
  };
}

test('automatic mode preserves existing DSH proxy policy; system mode opts into Windows PAC', () => {
  assert.equal(transportMode({}, 'win32', {}), 'system');
  for (const name of ['HTTPS_PROXY', 'https_proxy', 'ALL_PROXY', 'HTTP_PROXY']) {
    assert.equal(transportMode({}, 'win32', { [name]: 'http://fixture.invalid:3128' }), 'host');
    assert.equal(transportMode({ networkMode: 'system' }, 'win32', { [name]: 'http://fixture.invalid:3128' }), 'system');
  }
  assert.equal(transportMode({}, 'linux', {}), 'host');
  assert.equal(transportMode({ networkMode: 'host' }, 'win32', {}), 'host');
  assert.equal(transportMode({ proxyUrl: 'http://127.0.0.1:3128' }, 'win32', {}), 'manual');
  for (const proxyUrl of ['http://user:password@proxy:3128', 'http://proxy/config.pac', 'socks5://proxy:1080', 'broken']) {
    assert.throws(() => transportMode({ proxyUrl }, 'win32', {}), error => error.code === 'INVALID_REQUEST' && !error.message.includes(proxyUrl));
  }
  assert.throws(() => transportMode({ networkMode: 'system' }, 'linux', {}), /仅支持 Windows/);
});

test('system transport carries generation and reference editing without changing global routing', async () => {
  const beforeFetch = globalThis.fetch;
  const beforeEnv = { ...process.env };
  const calls = [];
  const png = Buffer.from('89504e470d0a1a0a0000000049454e44ae426082', 'hex');
  const fetchImpl = createImageFetch(config, { platform: 'win32', env: {},
    hostFetch: () => { throw new Error('unexpected host request'); },
    systemFetch: (url, init, passed) => windowsFetch(url, init, passed, {
      spawnImpl: fakeHelper({ status: 200, body: JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }) }, (() => { const call = {}; calls.push(call); return call; })()),
    }),
  });
  const common = { config: { ...config, apiKeyEnv: 'OPENAI_API_KEY', defaultModel: 'gpt-image-2.5-flare', quality: 'medium', size: '1024x1024' },
    args: { prompt: '测试 café' }, fetchImpl, resolveKey: async () => 'fixture-secret',
    saveImage: async () => ({ attachmentId: 'saved' }), readImage: async () => ({ data: png }),
  };
  assert.equal((await generateImage(common)).operation, 'generate');
  assert.equal((await generateImage({ ...common, references: [{ mediaType: 'image/png', width: 100, height: 200 }] })).operation, 'edit');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].packet.url, endpoint);
  assert.match(calls[1].packet.url, /\/edits$/);
  assert.ok(JSON.parse(calls[1].packet.body).images[0].image_url.startsWith('data:image/png;base64,'));
  for (const call of calls) {
    assert.equal(call.packet.headers.authorization, 'Bearer fixture-secret');
    assert.equal(JSON.parse(call.packet.body).prompt, '测试 café');
    assert.equal(call.packet.proxyUseDefaultCredentials, false);
    assert.ok(!call.args.join(' ').includes('fixture-secret'));
    assert.equal(call.spawnOptions.windowsHide, true);
    assert.equal(call.spawnOptions.shell, false);
    assert.equal(call.spawnOptions.env, undefined);
    assert.ok(!call.args.includes('-ExecutionPolicy'));
  }
  assert.equal(globalThis.fetch, beforeFetch);
  assert.deepEqual({ ...process.env }, beforeEnv);
});

test('failure never retries through host transport or forwards a redirected key', async () => {
  let calls = 0;
  const fetchImpl = createImageFetch(config, { platform: 'win32', env: {},
    systemFetch: async () => { calls++; throw new Error('proxy unavailable'); },
    hostFetch: () => { throw new Error('unexpected fallback'); },
  });
  await assert.rejects(fetchImpl(endpoint, options), /proxy unavailable/);
  assert.equal(calls, 1);
  await assert.rejects(fetchImpl('https://example.com/', options), /非官方/);
  assert.equal(calls, 1);
  for (const status of [301, 302, 307, 308]) {
    await assert.rejects(windowsFetch(endpoint, options, config, { spawnImpl: fakeHelper({ status, body: 'redirect' }) }), /未转发 API Key/);
  }
});

test('host mode retains the exact fetch request and does not replace the dispatcher', async () => {
  let received;
  const reply = { ok: true };
  const fetchImpl = createImageFetch({ networkMode: 'host' }, { platform: 'win32', env: {},
    hostFetch: async (...args) => { received = args; return reply; },
    systemFetch: () => { throw new Error('unexpected Windows request'); },
  });
  assert.equal(await fetchImpl(endpoint, options), reply);
  assert.deepEqual(received, [endpoint, options]);
  assert.ok(!Object.hasOwn(received[1], 'dispatcher'));
});

test('Windows exposes only the public Gitee manifest redirect; image requests still reject redirects', async () => {
  const url = 'https://gitee.com/un-important/dsh-openai-image/raw/main/latest.json';
  const location = 'https://raw.giteeusercontent.com/un-important/dsh-openai-image/raw/main/latest.json?signature=fixture';
  const init = { method: 'GET', redirect: 'manual', headers: { accept: 'application/json' }, maxResponseBytes: 16384 };
  const response = await windowsFetch(url, init, config, { spawnImpl: fakeHelper({ status: 302, body: '', location }) });
  assert.equal(response.status, 302); assert.equal(response.headers.get('location'), location);
  await assert.rejects(windowsFetch(endpoint, { ...options, redirect: 'manual' }, config, { spawnImpl: fakeHelper({ status: 302, body: '', location }) }), /未转发 API Key/);
});

test('helper failures are bounded and sanitized; proxy authentication is distinct from API authentication', async () => {
  for (const code of ['PROXY_AUTH', 'PROXY_DENIED', 'TLS', 'DNS', 'CONNECT', 'TIMEOUT']) {
    await assert.rejects(windowsFetch(endpoint, options, config, {
      spawnImpl: fakeHelper({ error: code, status: code === 'PROXY_AUTH' ? 407 : 0, route: 'proxy', detail: 'fixture-secret' }),
    }), error => !error.message.includes('fixture-secret') && (code !== 'PROXY_AUTH' || error.status === 407));
  }
  const unauthorized = await windowsFetch(endpoint, options, config, { spawnImpl: fakeHelper({ status: 401, body: '{"error":{"message":"invalid key"}}' }) });
  assert.equal(unauthorized.status, 401);
  assert.equal(unauthorized.ok, false);
  await assert.rejects(windowsFetch(endpoint, options, config, { spawnImpl: fakeHelper('malformed fixture-secret') }), /组件无法运行/);
  await assert.rejects(windowsFetch(endpoint, options, config, { spawnImpl: fakeHelper('', {}, { exitCode: 1 }) }), /组件无法运行/);
  await assert.rejects(windowsFetch(endpoint, options, config, { spawnImpl: () => { throw new Error('fixture-secret'); } }), /组件无法运行/);
});

test('abort and timeout terminate only this request helper', async () => {
  const cancel = new AbortController();
  const capture = {};
  const pending = windowsFetch(endpoint, { ...options, signal: cancel.signal }, config, { spawnImpl: fakeHelper(null, capture, { hang: true }) });
  await new Promise(resolve => setImmediate(resolve));
  cancel.abort(new Error('cancel this image'));
  await assert.rejects(pending, /cancel this image/);
  assert.equal(capture.killed, true);
  const timed = {};
  await assert.rejects(windowsFetch(endpoint, options, { ...config, timeoutMs: 20 }, { spawnImpl: fakeHelper(null, timed, { hang: true }) }), error => error.code === 'TIMEOUT');
  assert.equal(timed.killed, true);
  await assert.rejects(windowsFetch(endpoint, { ...options, signal: cancel.signal }, config, { spawnImpl: () => { throw new Error('must not start'); } }), /cancel this image/);
});

// Only loopback listeners and per-request proxy objects. Never reads or changes system proxy settings.
test('Windows helper reaches a loopback proxy by CONNECT hostname and reports 407/403 without direct fallback', { skip: process.platform !== 'win32', timeout: 20000 }, async t => {
  for (const status of [407, 403]) {
    const requests = [];
    const sockets = new Set();
    const proxy = http.createServer();
    proxy.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
    proxy.on('connect', (request, socket) => {
      requests.push(request);
      socket.end(`HTTP/1.1 ${status} Blocked\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`);
    });
    proxy.listen(0, '127.0.0.1');
    await once(proxy, 'listening');
    t.after(() => { for (const socket of sockets) socket.destroy(); proxy.close(); });
    await assert.rejects(windowsFetch(endpoint, options, { ...config, proxyUrl: `http://127.0.0.1:${proxy.address().port}` }),
      error => error.status === status && error.message.includes(String(status)));
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'api.openai.com:443');
    assert.equal(requests[0].headers.authorization, undefined);
    assert.equal(requests[0].headers['proxy-authorization'], undefined);
    await new Promise(resolve => proxy.close(resolve));
  }
});

test('Windows helper round-trips UTF-8 request and response with an isolated local server', { skip: process.platform !== 'win32', timeout: 20000 }, async t => {
  let body;
  let receivedHeaders;
  const server = http.createServer(async (request, response) => {
    receivedHeaders = request.headers;
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    body = Buffer.concat(chunks).toString('utf8');
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ text: '已收到图片 café' }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  // Even this local-only test explicitly supplies a private proxy object: no system PAC lookup.
  const reply = await windowsFetch(`http://127.0.0.1:${server.address().port}/`, { ...options, headers: { ...options.headers, 'user-agent': 'dsh-image-integration-test', accept: 'application/json' } },
    { ...config, proxyUrl: `http://127.0.0.1:${server.address().port}` });
  assert.equal(reply.status, 200);
  assert.equal((await reply.json()).text, '已收到图片 café');
  assert.equal(body, options.body);
  assert.equal(receivedHeaders['user-agent'], 'dsh-image-integration-test');
  assert.equal(receivedHeaders.accept, 'application/json');
});

test('Windows helper supports bounded anonymous GET without a request body on an isolated local server', { skip: process.platform !== 'win32', timeout: 20000 }, async t => {
  const seen = [];
  const server = http.createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    seen.push({ method: request.method, headers: request.headers, body: Buffer.concat(chunks).toString() });
    response.end(request.url === '/large' ? 'x'.repeat(17000) : '{"version":"1.7.0"}');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const init = { method: 'GET', headers: { accept: 'application/json' }, maxResponseBytes: 16384 };
  const localConfig = { ...config, proxyUrl: base };
  const reply = await windowsFetch(base + '/latest', init, localConfig);
  assert.equal(await reply.text(), '{"version":"1.7.0"}');
  assert.equal(seen[0].method, 'GET'); assert.equal(seen[0].body, ''); assert.equal(seen[0].headers.authorization, undefined);
  await assert.rejects(windowsFetch(base + '/large', init, localConfig), /过大/);
});

test('Windows helper does not follow redirects and cancellation closes its local connection', { skip: process.platform !== 'win32', timeout: 20000 }, async t => {
  let requests = 0;
  let arrival;
  const arrived = new Promise(resolve => { arrival = resolve; });
  let disconnected;
  const closed = new Promise(resolve => { disconnected = resolve; });
  const sockets = new Set();
  const server = http.createServer(async (request, response) => {
    requests++;
    for await (const _chunk of request) { /* Drain the POST before closing the response. */ }
    if (request.url === '/redirect') {
      response.writeHead(307, { location: '/must-not-receive-key' });
      response.end();
    } else {
      request.socket.once('close', disconnected);
      arrival();
    }
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { for (const socket of sockets) socket.destroy(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const localConfig = { ...config, proxyUrl: base };
  await assert.rejects(windowsFetch(base + '/redirect', options, localConfig), /未转发 API Key/);
  assert.equal(requests, 1);
  const cancel = new AbortController();
  const pending = windowsFetch(base + '/wait', { ...options, signal: cancel.signal }, localConfig);
  const rejected = assert.rejects(pending, /fixture cancellation/);
  await arrived;
  cancel.abort(new Error('fixture cancellation'));
  await rejected;
  await closed;
  assert.equal(requests, 2);
});

test('Windows helper downloads binary tgz bytes without UTF-8 conversion or changing system proxy', { skip: process.platform !== 'win32', timeout: 20000 }, async t => {
  const bytes = Buffer.from([31, 139, 8, 0, 255, 0, 128, 192, 222, 1]);
  const server = http.createServer((request, response) => {
    assert.equal(request.method, 'GET'); assert.equal(request.headers.authorization, undefined);
    response.end(bytes);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const address = `http://127.0.0.1:${server.address().port}`;
  const reply = await windowsFetch(address, { method: 'GET', headers: { accept: 'application/octet-stream' }, responseType: 'bytes', maxResponseBytes: 2 * 1024 * 1024 },
    { ...config, proxyUrl: address });
  assert.deepEqual(Buffer.from(await reply.arrayBuffer()), bytes);
});

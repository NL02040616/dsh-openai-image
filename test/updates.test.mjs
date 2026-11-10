import test from 'node:test';
import assert from 'node:assert/strict';
import { UPDATE_SOURCES, UPDATE_INTERVAL, newerVersion, validateRelease, createUpdateChecker, createUpdateFetch } from '../updates.js';
import { createUpdateClient } from '../update-client.js';

const manifest = (version = '1.8.0') => ({ schema: 1, package: 'dsh-openai-image', version, publishedAt: '2026-11-10', sha256: 'a'.repeat(64),
  dshVersions: ['0.2.2-rc.1'], notes: { zh: ['更新提醒'], en: ['Update reminders'] } });
const response = value => Response.json(value);
const options = { currentVersion: '1.7.0', dshVersion: '0.2.2-rc.1' };
const available = (version = '1.8.0') => ({ ...options, status: 'available', compatibility: 'compatible', source: 'Gitee', release: validateRelease(manifest(version)) });

test('stable versions compare numerically; malformed metadata and unsafe links are rejected or replaced', () => {
  assert.ok(newerVersion('1.10.0', '1.9.9'));
  assert.ok(!newerVersion('1.7.0', '1.7.0'));
  assert.ok(!newerVersion('1.6.9', '1.7.0'));
  for (const version of ['1.8.0-beta.1', '01.8.0', '../x', '1.1000000.0', null]) assert.throws(() => validateRelease(manifest(version)));
  for (const patch of [{ package: 'other' }, { sha256: 'broken' }, { dshVersions: [] }, { notes: { zh: ['x'.repeat(501)], en: ['ok'] } }]) assert.throws(() => validateRelease({ ...manifest(), ...patch }));
  const release = validateRelease({ ...manifest(), links: { gitee: 'javascript:bad' }, extraSecret: 'not returned' });
  assert.equal(release.links.gitee, 'https://gitee.com/un-important/dsh-openai-image/raw/main/dsh-openai-image-1.8.0.tgz');
  assert.equal(release.extraSecret, undefined);
});

test('Gitee first, GitHub fallback; anonymous bounded GET retains proxy mode and cannot reach OpenAI', async () => {
  const seen = [], before = globalThis.fetch, env = { HTTPS_PROXY: 'fixture-proxy' };
  const transport = createUpdateFetch({ networkMode: 'auto', apiKey: 'must-not-leak', proxyUrl: '' }, { platform: 'win32', env,
    hostFetch: async (url, init) => { seen.push({ url, init }); return seen.length === 1 ? new Response('unavailable', { status: 503 }) : response(manifest()); },
    systemFetch: () => assert.fail('Existing host proxy must be retained') });
  const result = await createUpdateChecker({ ...options, fetchImpl: transport }).check();
  assert.equal(result.source, 'GitHub'); assert.equal(result.status, 'available');
  assert.deepEqual(seen.map(r => r.url), UPDATE_SOURCES.map(r => r.url));
  for (const { init } of seen) {
    assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'manual'); assert.equal(init.credentials, 'omit');
    assert.deepEqual(init.headers, { accept: 'application/json' }); assert.equal(init.body, undefined);
  }
  await assert.rejects(transport('https://api.openai.com/v1/images/generations'), /Unknown/);
  assert.equal(globalThis.fetch, before); assert.deepEqual(env, { HTTPS_PROXY: 'fixture-proxy' });
  let systemRequest;
  await createUpdateFetch({ networkMode: 'system', timeoutMs: 300000 }, { platform: 'win32', systemFetch: async (...args) => { systemRequest = args; return response(manifest()); } })(UPDATE_SOURCES[0].url);
  assert.equal(systemRequest[1].method, 'GET'); assert.equal(systemRequest[1].maxResponseBytes, 16384); assert.equal(systemRequest[2].timeoutMs, 8000);
});

test('Gitee follows one anonymous redirect only to the exact public manifest on its file domain', async () => {
  const target = 'https://raw.giteeusercontent.com/un-important/dsh-openai-image/raw/main/latest.json?signature=fixture';
  const calls = [];
  const fetchImpl = createUpdateFetch({ networkMode: 'host' }, { hostFetch: async (url, init) => {
    calls.push({ url, init });
    return calls.length === 1 ? new Response(null, { status: 302, headers: { location: target } }) : response(manifest());
  } });
  assert.equal((await createUpdateChecker({ ...options, fetchImpl }).check()).source, 'Gitee');
  assert.deepEqual(calls.map(call => call.url), [UPDATE_SOURCES[0].url, target]);
  assert.equal(calls[1].init.redirect, 'error');
  assert.equal(calls[1].init.credentials, 'omit');
  assert.deepEqual(calls[1].init.headers, { accept: 'application/json' });
  for (const location of ['http://127.0.0.1/private', target.replace('https:', 'http:'), target.replace('/latest.json', '/other.json'),
    target.replace('raw.giteeusercontent.com', 'raw.giteeusercontent.com.evil.invalid'), target.replace('https://', 'https://user:pass@')]) {
    let count = 0;
    const invalid = createUpdateFetch({ networkMode: 'host' }, { hostFetch: async () => { count++; return new Response(null, { status: 302, headers: { location } }); } });
    await assert.rejects(invalid(UPDATE_SOURCES[0].url));
    assert.equal(count, 1, 'unapproved destinations never receive a request');
  }
});

test('network failures, invalid JSON, oversized and stalled bodies use bounded fallback', async () => {
  for (const first of [() => { throw new Error('secret proxy diagnostics'); }, () => new Response('<html>login</html>'),
    () => new Response('x'.repeat(16385)), () => new Response('{}', { headers: { 'content-length': '20000' } }),
    () => response({ ...manifest(), version: '2.0.0-beta' })]) {
    let calls = 0;
    const checker = createUpdateChecker({ ...options, fetchImpl: async () => ++calls === 1 ? first() : response(manifest()) });
    assert.equal((await checker.check()).source, 'GitHub'); assert.equal(calls, 2);
  }
  const keepAlive = setInterval(() => {}, 1000);
  try {
    let calls = 0;
    const checker = createUpdateChecker({ ...options, timeoutMs: 20, fetchImpl: () => { calls++; return new Promise(() => {}); } });
    const result = await checker.check();
    assert.equal(result.status, 'error'); assert.equal(calls, 2); assert.ok(!JSON.stringify(result).includes('secret'));
  } finally { clearInterval(keepAlive); }
});

test('host coalesces concurrent checks, caches failure/success daily, manual checks bypass cache', async () => {
  let calls = 0, time = 1000, fail = false;
  const checker = createUpdateChecker({ ...options, now: () => time, fetchImpl: async () => { calls++; if (fail) throw new Error('offline'); return response(manifest()); } });
  const [a, b] = await Promise.all([checker.check(), checker.check(true)]);
  assert.deepEqual(a, b); assert.equal(calls, 1);
  await checker.check(); assert.equal(calls, 1);
  await checker.check(true); assert.equal(calls, 2);
  fail = true; time += UPDATE_INTERVAL;
  assert.equal((await checker.check()).status, 'error'); assert.equal(calls, 4);
  await checker.check(); assert.equal(calls, 4);
  time -= UPDATE_INTERVAL + 1; await checker.check(); assert.equal(calls, 6, 'clock rollback must not freeze checks');
});

test('DSH compatibility is explicit, newer does not imply compatible and older releases never prompt downgrade', async () => {
  for (const [dshVersion, compatibility] of [['0.2.2-rc.1', 'compatible'], ['0.2.1-rc.5', 'incompatible'], [null, 'unknown']]) {
    const result = await createUpdateChecker({ ...options, dshVersion, fetchImpl: async () => response(manifest()) }).check();
    assert.equal(result.compatibility, compatibility); assert.equal(result.status, 'available');
  }
  for (const version of ['1.6.1', '1.7.0']) assert.equal((await createUpdateChecker({ ...options, fetchImpl: async () => response(manifest(version)) }).check()).status, 'current');
  const stop = new AbortController(); stop.abort();
  const result = await createUpdateChecker({ ...options, signal: stop.signal, fetchImpl: () => assert.fail('disposed plugin must not fetch') }).check();
  assert.equal(result.status, 'error');
});

function browser(saved = new Map(), version = '1.7.0') {
  let time = 1000, reply = available(), calls = [], next = 0;
  const timers = new Map();
  const storage = { getItem: k => saved.get(k) ?? null, setItem: (k, v) => saved.set(k, v) };
  const client = createUpdateClient({ currentVersion: version, storage, now: () => time,
    setTimer: (fn, ms) => { timers.set(++next, { fn, ms }); return next; }, clearTimer: id => timers.delete(id),
    fetcher: async (url, init) => { calls.push({ url, init }); if (reply instanceof Error) throw reply; return response(reply); } });
  return { client, calls, saved, timers, setReply: r => { reply = r; }, advance: ms => { time += ms; } };
}

test('client starts quietly, persists daily checks across restarts and can manually refresh an ignored release', async () => {
  const f = browser(); f.client.start();
  assert.equal([...f.timers.values()][0].ms, 5000); assert.equal(f.client.getSnapshot().open, false);
  await f.client.check(false); assert.equal(f.calls.length, 1); assert.equal(f.calls[0].url, 'api/openai-image.updates');
  f.client.ignore(); assert.equal(f.client.getSnapshot().ignored, '1.8.0');
  const restarted = browser(f.saved); restarted.client.start();
  await restarted.client.check(false); assert.equal(restarted.calls.length, 0); assert.equal(restarted.client.getSnapshot().ignored, '1.8.0');
  await restarted.client.check(); assert.equal(restarted.calls.length, 1); assert.equal(restarted.client.getSnapshot().open, true);
  restarted.setReply(available('1.9.0')); await restarted.client.check();
  assert.notEqual(restarted.client.getSnapshot().result.release.version, restarted.client.getSnapshot().ignored);
  restarted.advance(UPDATE_INTERVAL); await restarted.client.check(false); assert.equal(restarted.calls.length, 3);
  f.client.dispose(); restarted.client.dispose(); assert.equal(f.timers.size, 0); assert.equal(restarted.timers.size, 0);
});

test('client errors do not open a popup, cached failures wait a day, new installations discard old version cache', async () => {
  const f = browser(); f.setReply(new Error('offline')); await f.client.check(false);
  assert.equal(f.client.getSnapshot().result.status, 'error'); assert.equal(f.client.getSnapshot().open, false);
  const restarted = browser(f.saved); await restarted.client.check(false); assert.equal(restarted.calls.length, 0);
  const upgraded = browser(f.saved, '1.8.0'); upgraded.setReply({ ...available('1.9.0'), currentVersion: '1.8.0' });
  await upgraded.client.check(false); assert.equal(upgraded.calls.length, 1);
  for (const item of [f, restarted, upgraded]) item.client.dispose();
});

test('client coalesces requests and disposal aborts pending work without persisting stale notifications', async () => {
  let resolve, calls = 0, signal;
  const saved = new Map();
  const client = createUpdateClient({ currentVersion: '1.7.0', storage: { setItem: (k, v) => saved.set(k, v) },
    fetcher: (_url, init) => { calls++; signal = init.signal; return new Promise(r => { resolve = r; }); } });
  const first = client.check(false), second = client.check(); assert.equal(first, second); assert.equal(calls, 1);
  client.dispose(); assert.equal(signal.aborted, true); resolve(response(available())); await first;
  assert.equal(client.getSnapshot().result, null); assert.ok(![...saved.values()].some(v => v.includes('1.8.0')));
});

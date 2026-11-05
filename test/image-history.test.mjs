import test from 'node:test';
import assert from 'node:assert/strict';
import { createImageHistory } from '../image-history.js';

const history = createImageHistory();
const definition = history.definition;
const call = (id = 'call-1', seq = 10) => ({ type: 'tool/call', seq, time: '2026-11-05T01:00:00Z', data: {
  callId: id, name: 'openai_edit_image', arguments: JSON.stringify({ model: 'chosen-model', quality: 'low', size: '1536x864' }),
} });
const result = (id = 'call-1', seq = 12, imageId = 'sha256:one') => ({ type: 'tool/result', surfaceOp: 'append', seq, data: {
  message: { source: { callId: id }, content: [{ type: 'text', text: '图片已生成：legacy-model，实际 1024x1024，medium。' },
    { type: 'image', attachment: { attachmentId: imageId, width: 1536, height: 864, mediaType: 'image/png' } }] },
  meta: { openaiImage: { version: 1, model: 'chosen-model', quality: 'low', size: '1536x864', requestedSize: '1536x864', referenceIds: ['sha256:old'] } },
} });
function context(event) {
  return { key: 'image:' + (event.data.callId ?? event.data.message.source.callId), id: event.data.callId ?? event.data.message.source.callId,
    start: { event, location: { kind: 'step', step: { status: 'open' }, turn: { status: 'open' } } }, matches: [],
    state: definition.start({}, { event }) };
}

test('pending and completed images replace one stable turn-level card', () => {
  const ctx = context(call());
  const pending = definition.buildViewNode(ctx);
  assert.equal(pending.data.status, 'running');
  assert.equal(pending.groupTree, 'turn');
  ctx.state = definition.update(ctx, { event: result() });
  const done = definition.buildViewNode(ctx);
  assert.equal(done.key, pending.key);
  assert.equal(done.anchorSeq, pending.anchorSeq);
  assert.equal(done.data.status, 'succeeded');
  const details = history.info(done.data.block, done.data.meta, done.data.args);
  assert.equal(details.model, 'chosen-model');
  assert.equal(details.quality, 'low');
  assert.deepEqual(details.referenceIds, ['sha256:old']);
});

test('closed turns and failed results never remain generating or enter version history', () => {
  for (const reason of ['aborted', 'interrupted', 'error']) {
    const ctx = context(call());
    ctx.start.location.turn = { status: 'closed', end: { data: { reason: { kind: reason } } } };
    const node = definition.buildViewNode(ctx);
    assert.equal(node.data.status, reason === 'aborted' ? 'cancelled' : 'interrupted');
    assert.deepEqual(history.versions({ nodes: new Map([[node.key, node]]) }), []);
  }
  const event = result(); event.data.message.isError = true;
  const ctx = context(call()); ctx.state = definition.update(ctx, { event });
  assert.equal(definition.buildViewNode(ctx).data.status, 'failed');
  assert.deepEqual(history.images(event.data.message), []);
  ctx.start.location.step = { status: 'closed', end: { type: 'step/end', data: {} } };
  ctx.start.location.turn = { status: 'closed', end: { data: { reason: { kind: 'aborted' } } } };
  assert.equal(definition.buildViewNode(ctx).data.status, 'cancelled');
  assert.equal(definition.match['tool/call']({ ...call(), data: { name: 'unrelated_tool' } }), null);
  assert.equal(definition.buildViewNode({ state: undefined }), null);
});

test('replay reconstructs old images, parameters and ordered versions without cross-session state', () => {
  const old = result('old', 4, 'sha256:old'); delete old.data.meta;
  const oldNode = definition.buildViewNode(context(old));
  const nextNode = definition.buildViewNode(context(result()));
  const snapshot = { nodes: new Map([[nextNode.key, nextNode], [oldNode.key, oldNode]]) };
  const versions = history.versions(snapshot);
  assert.equal(versions.length, 2);
  assert.equal(versions[0].model, 'legacy-model');
  assert.equal(versions[1].model, 'chosen-model');
  assert.ok(versions[1].referenceIds.includes(versions[0].image.attachment.attachmentId));
  assert.deepEqual(history.versions({ nodes: new Map() }), []);
  assert.deepEqual(history.versions(snapshot), versions);
  assert.equal(history.info({ content: [] }).model, undefined);
});

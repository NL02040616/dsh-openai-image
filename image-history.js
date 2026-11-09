// Shared by the client bundle and isolated replay tests. No global/session cache.
export function createImageHistory() {
  const kind = 'openai-image-result';
  const tools = new Set(['openai_generate_image', 'openai_edit_image']);
  const requestRecord = 'plugin:openai-image/request';
  const textOf = block => (block?.content ?? []).filter(part => part.type === 'text').map(part => part.text).join('\n');
  function info(block, meta, args = {}, request = {}) {
    const text = textOf(block);
    const saved = meta?.openaiImage?.version === 1 ? meta.openaiImage : {};
    // Older releases saved a human-readable result but no presentation metadata.
    const legacy = text.match(/^图片已(?:生成|编辑[^：]*)：([^，]+)，实际 (\d+x\d+)，([^。]+)。/);
    return {
      model: saved.model ?? legacy?.[1] ?? request.model ?? args.model,
      quality: saved.quality ?? legacy?.[3] ?? request.quality ?? args.quality,
      size: saved.size ?? legacy?.[2], requestedSize: saved.requestedSize ?? request.size ?? args.size,
      referenceIds: Array.isArray(saved.referenceIds) ? saved.referenceIds : [],
      text,
    };
  }
  function images(block) {
    return block?.isError ? [] : (block?.content ?? []).filter(part => part.type === 'image' && part.attachment?.attachmentId)
      .map(part => ({ attachment: part.attachment }));
  }
  function knownResult(event) {
    return event.data?.meta?.openaiImage?.version === 1 || /^图片已(?:生成|编辑)/.test(textOf(event.data?.message));
  }
  function reduce(previous, match) {
    const event = match.event;
    if (event.type === requestRecord) return { ...previous, callId: String(event.data.callId), request: event.data.request,
      operation: event.data.request.operation, seq: previous?.seq ?? event.seq, time: previous?.time ?? event.time,
      status: previous?.status ?? 'running' };
    if (event.type === 'tool/call') {
      let args = {};
      try {
        const parsed = JSON.parse(event.data.arguments);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) args = parsed;
      } catch {}
      return { ...previous, callId: String(event.data.callId), args, operation: event.data.name === 'openai_edit_image' ? 'edit' : 'generate',
        seq: previous?.seq ?? event.seq, time: event.time, status: 'running' };
    }
    const block = event.data.message;
    return { ...previous, callId: String(block.source.callId), args: previous?.args ?? {},
      seq: previous?.seq ?? event.seq, time: previous?.time ?? event.time, block, meta: event.data.meta,
      status: block.isError ? 'failed' : images(block).length ? 'succeeded' : 'failed' };
  }
  const definition = {
    kind, target: 'chat',
    match: {
      [requestRecord]: event => event.data?.request?.version === 1 && event.data.callId ? { id: String(event.data.callId), role: 'start' } : null,
      'tool/call': event => tools.has(event.data?.name) ? { id: String(event.data.callId), role: 'start' } : null,
      'tool/result': event => event.surfaceOp === 'append' && event.data?.message?.source?.callId
        ? { id: String(event.data.message.source.callId), role: knownResult(event) ? 'start' : 'update' } : null,
    },
    start: (_context, match) => reduce(undefined, match),
    update: (context, match) => reduce(context.state, match),
    publication: () => 'immediate',
    buildViewNode(context) {
      const state = context.state;
      if (!state) return null;
      const location = context.start?.location ?? context.matches?.[0]?.location ?? { kind: 'unresolved' };
      const ended = location.step?.status === 'closed' ? location.step.end : location.turn?.status === 'closed' ? location.turn.end : null;
      const reason = location.turn?.end?.data?.reason?.kind ?? ended?.data?.reason?.kind;
      const data = state.status !== 'succeeded' && reason === 'aborted' ? { ...state, status: 'cancelled' }
        : state.status === 'running' && ended ? { ...state, status: 'interrupted' } : state;
      return { key: context.key, kind, id: context.id, target: 'chat', anchorSeq: state.seq,
        location, visibility: 'visible', groupTree: 'turn', data };
    },
  };
  function versions(snapshot) {
    const nodes = snapshot?.nodes?.values?.() ?? [];
    return [...nodes].filter(node => node.kind === kind && node.visibility !== 'hidden' && node.data.status === 'succeeded')
      .sort((a, b) => a.anchorSeq - b.anchorSeq)
      .flatMap(node => images(node.data.block).map((image, index) => ({
        key: `${node.id}:${index}`, image, callId: node.id, seq: node.anchorSeq,
        ...info(node.data.block, node.data.meta, node.data.args, node.data.request),
      })));
  }
  return { kind, definition, info, images, versions };
}

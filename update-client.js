// Shared by the generated browser bundle and isolated lifecycle tests.
export function createUpdateClient({ currentVersion, fetcher, storage, now = Date.now,
  setTimer = setTimeout, clearTimer = clearTimeout }) {
  const interval = 86400000, key = `dsh.openaiImage.updates.v1:${currentVersion}`;
  const ignoredKey = 'dsh.openaiImage.updates.ignored';
  const listeners = new Set();
  let state = { open: false, checking: false, result: null, ignored: '', checkedAt: 0 };
  let pending, timer, disposed = false;
  const controller = new AbortController();
  const publish = patch => { if (!disposed) { state = { ...state, ...patch }; for (const listener of listeners) listener(); } };
  const save = () => { try { storage?.setItem(key, JSON.stringify({ result: state.result, checkedAt: state.checkedAt })); } catch {} };
  const valid = result => {
    if (result?.currentVersion !== currentVersion || !['available', 'current', 'error'].includes(result.status)) return false;
    if (result.status === 'error') return true;
    const release = result.release, file = `dsh-openai-image-${release?.version}.tgz`;
    return /^\d+\.\d+\.\d+$/.test(release?.version) && ['compatible', 'incompatible', 'unknown'].includes(result.compatibility)
      && Array.isArray(release.dshVersions) && ['zh', 'en'].every(lang => Array.isArray(release.notes?.[lang]) && release.notes[lang].every(line => typeof line === 'string'))
      && release.links?.gitee === `https://gitee.com/un-important/dsh-openai-image/raw/main/${file}`
      && release.links?.github === `https://raw.githubusercontent.com/NL02040616/dsh-openai-image/main/${file}`;
  };
  try {
    const saved = JSON.parse(storage?.getItem(key) ?? 'null');
    const age = now() - saved?.checkedAt;
    if (Number.isFinite(age) && age >= 0 && age < interval) state = { ...state, checkedAt: saved.checkedAt, result: valid(saved.result) ? saved.result : null };
    state.ignored = storage?.getItem(ignoredKey) ?? '';
  } catch {}
  const schedule = delay => {
    clearTimer(timer);
    if (!disposed) timer = setTimer(() => { void check(false); }, delay);
  };
  function check(manual = true) {
    if (disposed) return Promise.resolve();
    if (manual) publish({ open: true });
    if (pending) return pending;
    const age = now() - state.checkedAt;
    if (!manual && state.checkedAt && age >= 0 && age < interval) { schedule(interval - age); return Promise.resolve(state.result); }
    publish({ checking: true, checkedAt: now() }); save();
    pending = (async () => {
      let result;
      try {
        const response = await fetcher(`api/openai-image.updates${manual ? '?manual=1' : ''}`, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) });
        if (!response.ok) throw new Error('Check failed');
        result = await response.json();
        if (!valid(result)) throw new Error('Invalid response');
      } catch { result = { currentVersion, status: 'error' }; }
      if (!disposed) { publish({ result, checking: false }); save(); schedule(interval); }
      return result;
    })().finally(() => { pending = undefined; });
    return pending;
  }
  return {
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot: () => state,
    start: () => schedule(state.checkedAt ? Math.max(1000, interval - (now() - state.checkedAt)) : 5000),
    check,
    toggle: () => publish({ open: !state.open }),
    close: () => publish({ open: false }),
    ignore() {
      const ignored = state.result?.release?.version;
      if (!ignored) return;
      try { storage?.setItem(ignoredKey, ignored); } catch {}
      publish({ ignored, open: false });
    },
    dispose() { disposed = true; clearTimer(timer); controller.abort(); listeners.clear(); },
  };
}

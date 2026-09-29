// A store that exists at once and holds every call until the real store is open (gate G27: while the IndexedDB
// versionchange runs, a capture waits for it instead of failing). Pure: `opening` is a promise of a store.
const METHODS = ['getAll', 'get', 'put', 'putMany', 'delete', 'deleteMany', 'clear', 'getByOrigin', 'getQuarantined', 'getSetting', 'setSetting',
  'getEmbedding', 'putEmbedding', 'deleteEmbedding', 'getAllEmbeddings'];

export const MIGRATING = Object.freeze({ state: 'migrating', count: 0, quarantined: 0, readOnly: false });

export function queueUntilReady(opening) {
  let real = null;
  const early = new Set(); // onChange listeners added before the store opened
  const attached = new Map();
  const ready = opening.then((store) => {
    real = store;
    for (const fn of early) attached.set(fn, store.onChange(fn));
  });
  ready.catch(() => {}); // a failed open is reported to every waiting call and to `ready` readers, never as an unhandled rejection

  const facade = {
    // resolves when the store is open and any migration is finished; rejects when storage is unavailable
    ready,
    get migration() { return real ? real.migration : { ...MIGRATING }; },
    onChange(fn) {
      if (real) return real.onChange(fn);
      early.add(fn);
      return () => { early.delete(fn); attached.get(fn)?.(); attached.delete(fn); };
    },
  };
  for (const name of METHODS) facade[name] = async (...args) => { await ready; return real[name](...args); };
  return facade;
}

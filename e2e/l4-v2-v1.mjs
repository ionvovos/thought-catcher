// L4a v2 (X10): a profile written by build a999310 (v1 database at version 1, v1 localStorage settings with an Anthropic key
// and its binding) opens in the REAL v2 shell with no user action; nothing is lost; the key never reaches an export; export,
// clear, import round-trips; a v1 export file imports; a bad file changes nothing. Run outside the sandbox: node e2e/l4-v2-v1.mjs
import { launch, sleep } from './lib/cdp.mjs';

let failed = 0;
const check = (id, name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}${detail ? `  ${detail}` : ''}`); if (!ok) failed += 1; };
const b = await launch({});
await b.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

const KEY = 'sk-ant-DEADBEEF-L4A-TEST-KEY-000000000';
const rows = Array.from({ length: 8 }, (_, i) => ({
  id: `v1-${i}`, text: `v1 thought ${i} about the garden`, type: ['idea', 'task', 'journal', 'reminder'][i % 4], title: `V1 thought ${i}`, tags: ['garden', `t${i}`],
  created_at: `2026-09-0${i + 1}T09:00:00.000Z`, updated_at: `2026-09-0${i + 1}T09:30:00.000Z`, source: i % 2 ? 'voice' : 'typed',
  sort: { by: i === 2 ? 'ai' : 'rules', confidence: 0.8, alt_type: null, model: i === 2 ? 'claude-x' : null },
  due_at: i % 4 === 3 ? '2026-10-02T15:00:00.000Z' : null, done: i === 1, done_at: i === 1 ? '2026-09-10T10:00:00.000Z' : null,
  clarify: { state: 'none', case: null, question: null, answer: null },
  expansion: i % 4 === 0 ? { next_steps: ['a', 'b', 'c'], questions: ['q1', 'q2', 'q3'], outline: ['o1', 'o2', 'o3'], generated_at: '2026-09-07T09:00:00.000Z', model: 'claude-x' } : null,
  review: { last_reviewed_at: i === 3 ? '2026-09-08T09:00:00.000Z' : null, snoozed_until: null, dismissed: i === 3 },
}));

// v1 database exactly as build a999310 created it (idb.js at that commit: version 1, thoughts + 3 indexes, settings).
await b.load(`${b.base}/x-seed.html`, 50);
await b.ev(`(async (rows) => {
  localStorage.clear();
  await new Promise((res) => { const d = indexedDB.deleteDatabase('thought-catcher'); d.onsuccess = d.onerror = d.onblocked = () => res(); });
  const db = await new Promise((res, rej) => { const r = indexedDB.open('thought-catcher', 1); r.onupgradeneeded = () => { const s = r.result.createObjectStore('thoughts', { keyPath: 'id' }); s.createIndex('by_type', 'type'); s.createIndex('by_created', 'created_at'); s.createIndex('by_due', 'due_at'); r.result.createObjectStore('settings', { keyPath: 'key' }); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  await new Promise((res, rej) => { const tx = db.transaction(['thoughts', 'settings'], 'readwrite'); for (const t of rows) tx.objectStore('thoughts').put(t); tx.objectStore('settings').put({ key: 'schema.version', value: 1 }); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  db.close();
  const set = (k, v) => localStorage.setItem('thought-catcher.' + k, JSON.stringify(v));
  set('review.days', 6); set('ai.provider', 'anthropic'); set('onboarding.done', true); set('speech.engine', 'typing');
  localStorage.setItem('thought-catcher.ai-key', ${JSON.stringify(KEY)});
  localStorage.setItem('thought-catcher.ai-key-binding', JSON.stringify({ provider: 'anthropic', host: 'api.anthropic.com' }));
})(${JSON.stringify(rows)})`);

b.problems.length = 0;
await b.load(`${b.base}/?capture=1`, 2500);
const shown = await b.ev(`document.body.innerText`);
check('AC-X10.2', 'success shows "Migrated N thoughts" with N equal to the v1 count (8)', /Migrated 8 thoughts/.test(shown), shown.match(/Migrated \d+ thoughts/)?.[0] ?? 'no notice');
check('AC-X10.1', 'the app opened on the assistant with no user action', await b.ev(`!!document.querySelector('.orb')`));

const after = await b.ev(`(async () => {
  const { createIdbStore } = await import('/src/storage/idb.js'); const s = await createIdbStore(indexedDB);
  const all = await s.getAll();
  const dbs = await indexedDB.databases();
  return { all, version: dbs.find((d) => d.name === 'thought-catcher').version, settingsDays: JSON.parse(localStorage.getItem('thought-catcher.review.days')), key: localStorage.getItem('thought-catcher.ai-key'), binding: localStorage.getItem('thought-catcher.ai-key-binding') };
})()`);
const byId = new Map(after.all.map((t) => [t.id, t]));
const lost = [];
for (const r of rows) {
  const t = byId.get(r.id);
  if (!t) { lost.push(`${r.id} missing`); continue; }
  for (const f of ['type', 'title', 'text', 'created_at', 'updated_at', 'due_at', 'done', 'done_at', 'source']) if (JSON.stringify(t[f]) !== JSON.stringify(r[f])) lost.push(`${r.id}.${f}`);
  if (JSON.stringify(t.tags) !== JSON.stringify(r.tags)) lost.push(`${r.id}.tags`);
  if (JSON.stringify(t.expansion) !== JSON.stringify(r.expansion)) lost.push(`${r.id}.expansion`);
  if (JSON.stringify(t.review) !== JSON.stringify(r.review)) lost.push(`${r.id}.review`);
}
check('AC-X10.1', 'all 8 thoughts keep id, type, title, tags, dates, done state, expansion and review state', after.all.length === 8 && lost.length === 0, lost.slice(0, 5).join(', '));
check('AC-X10.1', 'database is upgraded to version 2', after.version === 2, `version ${after.version}`);
check('AC-X10.1', 'settings and the key are kept (review days 6, key and binding unchanged)', after.settingsDays === 6 && after.key === KEY && !!after.binding, JSON.stringify({ days: after.settingsDays, keyKept: after.key === KEY, binding: after.binding }));

// export never carries the key; round trip; v1 file; invalid file
const rt = await b.ev(`(async () => {
  const { createIdbStore } = await import('/src/storage/idb.js'); const s = await createIdbStore(indexedDB);
  const { settingsApi } = await import('/src/storage/settings.js');
  const { buildExport, parseImport, mergeImport } = await import('/src/core/exportImport.js');
  const before = await s.getAll();
  const file = JSON.stringify(buildExport(before, settingsApi.getSettings(), new Date('2026-09-29T12:00:00Z'), { quarantined: await s.getQuarantined() }));
  const keyInFile = file.includes(${JSON.stringify(KEY)}) || /sk-ant|ai-key|api[_-]?key/i.test(file);
  await s.clear();
  const emptied = (await s.getAll()).length;
  const p = parseImport(file);
  const m = mergeImport(await s.getAll(), p.data.thoughts);
  await s.putMany(m.toAdd ?? m.added ?? p.data.thoughts);
  const restored = await s.getAll();
  const norm = (a) => JSON.stringify([...a].sort((x, y) => x.id.localeCompare(y.id)));
  const badBefore = (await s.getAll()).length;
  const bad = parseImport('{"not":"an export"}');
  const v1file = JSON.stringify({ format: 'thought-catcher-export', version: 1, exported_at: '2026-09-28T10:00:00.000Z', app_version: '1.0.1', settings: {}, thoughts: ${JSON.stringify(rows)} });
  const pv1 = parseImport(v1file);
  return { keyInFile, emptied, equal: norm(restored) === norm(before), n: restored.length, badOk: bad.ok, badAfter: (await s.getAll()).length === badBefore, v1ok: pv1.ok, v1n: pv1.data?.thoughts?.length, mergeKeys: Object.keys(m) };
})()`);
check('AC-X10.3', 'the export file contains no key and no key-like string', rt.keyInFile === false);
check('AC-X10.3', 'export, clear, import gives a record set deep-equal to the original', rt.emptied === 0 && rt.equal && rt.n === 8, JSON.stringify({ emptied: rt.emptied, equal: rt.equal, n: rt.n, mergeKeys: rt.mergeKeys }));
check('AC-X10.3', 'an invalid file is rejected and changes nothing', rt.badOk === false && rt.badAfter === true);
check('AC-X10.3', 'a v1 export file is read (8 rows)', rt.v1ok && rt.v1n === 8, `n=${rt.v1n}`);

// the key is not sent anywhere on its own: opening the app made no request off the local server
const foreign = b.network.filter((u) => !u.startsWith(b.base) && !u.startsWith('data:') && !u.startsWith('blob:'));
check('AC-X10.5', 'a session with a v1 profile and a stored key makes no request off the local server', foreign.length === 0, foreign.slice(0, 3).join(', '));
check('AC-Q.1', 'no console error during the v1 migration session', b.problems.filter((p) => !/WebGPU|favicon|404/.test(p)).length === 0, b.problems.slice(0, 2).join(' ; '));
await b.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);

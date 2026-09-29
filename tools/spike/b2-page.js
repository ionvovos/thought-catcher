// B2 feasibility spike page: loads one model, runs the split job on the test rambles, reports timings and raw output.
// Driven by tools/spike/b2-spike.mjs through the DevTools protocol (window.runSpike).
export const WEBLLM_URL = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.85/+esm';
export const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0';

export const RAMBLES = [
  "Okay so tomorrow I need to call the dentist to move my appointment, and also buy dog food on the way home. Oh and I had this idea, what if the gym app showed a streak calendar. Remind me on Friday at 6pm to send the invoice to Maria.",
  "Had a rough day at work, the meeting went badly and I felt nobody listened. I'm grateful my sister called though.",
  "Idea for the weekend: a small herb garden on the balcony, basil and mint, maybe with a drip system so it survives August.",
  "Pay the electricity bill before the 5th and renew the car insurance next week.",
  "Don't forget mum's birthday on October 12th. And I should really think about going back to the gym, I keep skipping it and I feel worse.",
];

export const PROMPT_VERSION = 3;
export const SYSTEM = `You split a spoken note into separate thoughts and sort each one.
Types: task = something to do. reminder = something to be reminded of at a date or time. idea = something to think about or develop. journal = a feeling or an event.
Reply with one JSON object only, no prose.
Example note: "I need to email Nick about the flat and remind me Monday at 9 to book the car service. Also, a podcast about old Athens bars could be fun."
Example reply: {"items":[{"type":"task","title":"Email Nick about the flat","text":"I need to email Nick about the flat","when":null},{"type":"reminder","title":"Book the car service","text":"remind me Monday at 9 to book the car service","when":"Monday at 9"},{"type":"idea","title":"Podcast about old Athens bars","text":"a podcast about old Athens bars could be fun","when":null}]}
Rules: one item per separate thought; never invent items; title is at most 8 words from the note; text is the exact words of the note for that item; when is the date or time words copied from the note, or null.`;

function parse(raw) {
  const t = raw.replace(/```(?:json)?/g, '');
  const a = t.indexOf('{'); if (a < 0) return null;
  let depth = 0;
  for (let i = a; i < t.length; i += 1) {
    if (t[i] === '{') depth += 1;
    if (t[i] === '}') { depth -= 1; if (depth === 0) { try { return JSON.parse(t.slice(a, i + 1)); } catch { return null; } } }
  }
  return null;
}

async function webllm(model, onLog, inWorker = false) {
  const lib = await import(WEBLLM_URL);
  const t0 = performance.now();
  const engine = inWorker
    ? await lib.CreateWebWorkerMLCEngine(new Worker(new URL('./b2-worker.js', import.meta.url), { type: 'module' }), model, { initProgressCallback: (p) => onLog(p.text) })
    : await lib.CreateMLCEngine(model, { initProgressCallback: (p) => onLog(p.text) });
  const loadMs = performance.now() - t0;
  const run = async (user) => {
    const s = performance.now(); let first = null; let text = ''; let usage = null;
    const chunks = await engine.chat.completions.create({ ...(/qwen3/i.test(model) ? { extra_body: { enable_thinking: false } } : {}), messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }], temperature: 0, max_tokens: 400, stream: true, stream_options: { include_usage: true } });
    for await (const c of chunks) {
      const d = c.choices?.[0]?.delta?.content; if (d) { if (first === null) first = performance.now() - s; text += d; }
      if (c.usage) usage = c.usage;
    }
    return { text, ttftMs: Math.round(first), totalMs: Math.round(performance.now() - s), tokens: usage?.completion_tokens, promptTokens: usage?.prompt_tokens, decodeTps: usage?.extra?.decode_tokens_per_s, prefillTps: usage?.extra?.prefill_tokens_per_s };
  };
  return { loadMs, run, unload: () => engine.unload() };
}

async function tjs(model, device, dtype, onLog) {
  const { pipeline, TextStreamer } = await import(TRANSFORMERS_URL);
  const t0 = performance.now();
  const gen = await pipeline('text-generation', model, { device, dtype, progress_callback: (p) => { if (p.status === 'done') onLog(`done ${p.file}`); } });
  const loadMs = performance.now() - t0;
  const run = async (user) => {
    const s = performance.now(); let first = null; let n = 0;
    const streamer = new TextStreamer(gen.tokenizer, { skip_prompt: true, callback_function: () => { if (first === null) first = performance.now() - s; }, token_callback_function: () => { n += 1; } });
    const out = await gen([{ role: 'system', content: SYSTEM }, { role: 'user', content: /qwen3/i.test(model) ? `${user} /no_think` : user }], { max_new_tokens: 400, do_sample: false, streamer });
    const total = performance.now() - s;
    const text = out[0].generated_text.at(-1).content;
    return { text, ttftMs: Math.round(first), totalMs: Math.round(total), tokens: n, decodeTps: n && first !== null ? +(n / ((total - first) / 1000)).toFixed(1) : null };
  };
  return { loadMs, run, unload: () => gen.dispose?.() };
}

async function embed(model, device, onLog) {
  const { pipeline } = await import(TRANSFORMERS_URL);
  const t0 = performance.now();
  const fe = await pipeline('feature-extraction', model, { device, dtype: 'q8', progress_callback: (p) => { if (p.status === 'done') onLog(`done ${p.file}`); } });
  const loadMs = performance.now() - t0;
  const docs = ['call the dentist', 'buy dog food', 'gym app streak calendar', 'send invoice to Maria', 'rough day at work', 'herb garden on the balcony', 'pay electricity bill', 'renew car insurance', "mum's birthday", 'go back to the gym, keep skipping it'];
  const q = 'what did I say about exercise?';
  await fe('warm up', { pooling: 'mean', normalize: true });
  const s = performance.now();
  const v = await fe(docs, { pooling: 'mean', normalize: true });
  const batchMs = performance.now() - s;
  const s2 = performance.now();
  const qv = (await fe(q, { pooling: 'mean', normalize: true })).tolist()[0];
  const queryMs = performance.now() - s2;
  const rows = v.tolist();
  const ranked = rows.map((r, i) => [docs[i], +r.reduce((a, x, j) => a + x * qv[j], 0).toFixed(3)]).sort((a, b) => b[1] - a[1]);
  return { loadMs: Math.round(loadMs), dims: rows[0].length, batch10Ms: Math.round(batchMs), queryMs: Math.round(queryMs), query: q, top3: ranked.slice(0, 3) };
}

window.runSpike = (args) => { const log = []; return Promise.race([run(args, log), new Promise((r) => { setTimeout(() => r({ error: 'timeout after 150 s', logTail: log.slice(-6) }), 150000); })]); };

async function run({ lib, model, device = 'webgpu', dtype = 'q4f16', rambles = RAMBLES.length }, log) {
  const onLog = (t) => { if (log.length < 400) log.push(t); };
  const env = { gpu: !!navigator.gpu, adapter: null };
  try { const a = await navigator.gpu?.requestAdapter(); env.adapter = a ? (a.info?.vendor ?? 'yes') + ' ' + (a.info?.architecture ?? '') : null; env.shaderF16 = a?.features.has('shader-f16') ?? null; } catch (e) { env.adapter = `error ${e.message}`; }
  try {
    if (lib === 'embed') return { env, embed: await embed(model, device, onLog) };
    const m = lib.startsWith('webllm') ? await webllm(model, onLog, lib === 'webllm-worker') : await tjs(model, device, dtype, onLog);
    const results = [];
    for (const r of RAMBLES.slice(0, rambles)) {
      const res = await m.run(r);
      const json = parse(res.text);
      results.push({ ...res, json, validJson: !!(json && Array.isArray(json.items)) });
    }
    await m.unload?.();
    return { env, loadMs: Math.round(m.loadMs), results, logTail: log.slice(-3) };
  } catch (e) { return { env, error: String(e?.message ?? e), stack: String(e?.stack ?? '').slice(0, 400), logTail: log.slice(-5) }; }
}
document.getElementById('out').textContent = 'loaded';

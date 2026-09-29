// Quality checks (architecture section 7). Run outside the Bash sandbox: node e2e/quality.mjs   Exit 0 = pass.
//  AC-D3.1 animated properties: only transform, opacity, scale, rotate, translate (G24: the individual transform properties count)
//  AC-D3.3 reduced motion: no running infinite animation, every transition duration <= 100 ms
//  AC-D3.2 frames: 4x CPU throttle, 95% of animation frame deltas <= 20 ms
//  AC-D2.4 installability: Page.getInstallabilityErrors is empty
//  AC-D2.5 axe-core 4.13.0 (fetched at test time from jsDelivr, evaluated through CDP, never shipped): no serious or critical violation
import { launch } from './lib/cdp.mjs';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`); if (!ok) failed += 1; };

export const ALLOWED_PROPS = ['transform', 'opacity', 'scale', 'rotate', 'translate', 'offset', 'easing', 'composite', 'computedOffset'];
const FIXTURES = ['assistant-idle', 'assistant-filed', 'assistant-listening', 'assistant-thinking', 'assistant-question', 'library-half', 'settings-model-downloading', 'about'];

const b = await launch();
await b.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

// ---- AC-D3.1 ----
const PROPS = `(() => {
  const allowed = ${JSON.stringify(ALLOWED_PROPS)};
  const bad = new Set();
  for (const a of document.getAnimations()) {
    for (const f of a.effect?.getKeyframes?.() ?? []) for (const k of Object.keys(f)) if (!allowed.includes(k)) bad.add((a.animationName || a.transitionProperty || 'anim') + ':' + k);
    if (a.transitionProperty && !allowed.includes(a.transitionProperty)) bad.add('transition:' + a.transitionProperty);
  }
  return [...bad];
})()`;
const seen = new Set();
for (const name of FIXTURES) {
  await b.load(`${b.base}/?fixture=${name}`, 900);
  for (const p of await b.ev(PROPS)) seen.add(`${name} ${p}`);
}
check('D3.1: animations animate only transform, opacity, scale, rotate, translate', seen.size === 0, [...seen].slice(0, 6).join(' ; '));

// ---- AC-D3.3 ----
await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
let loops = 0;
const slow = [];
for (const name of ['assistant-idle', 'assistant-listening', 'assistant-thinking', 'assistant-filed']) {
  await b.load(`${b.base}/?fixture=${name}`, 900);
  loops += await b.ev(`document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations === Infinity && a.playState === 'running').length`);
  slow.push(...await b.ev(`[...document.querySelectorAll('*')].filter((e) => getComputedStyle(e).transitionDuration.split(',').some((d) => parseFloat(d) * (d.trim().endsWith('ms') ? 1 : 1000) > 100)).slice(0, 3).map((e) => String(e.className))`));
}
check('D3.3: reduced motion has no running infinite animation', loops === 0, `running=${loops}`);
check('D3.3: reduced motion transitions are 100 ms or shorter', slow.length === 0, slow.join(', '));
await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });

// ---- AC-D3.2 ----
await b.send('Emulation.setCPUThrottlingRate', { rate: 4 });
const FRAMES = `new Promise((res) => { const d = []; let last = performance.now(); const end = last + 2500; const tick = (t) => { d.push(t - last); last = t; if (t < end) requestAnimationFrame(tick); else res(d.slice(2)); }; requestAnimationFrame(tick); })`;
for (const name of ['assistant-idle', 'assistant-listening', 'assistant-thinking', 'assistant-filed']) {
  await b.load(`${b.base}/?fixture=${name}`, 500);
  const d = await b.ev(FRAMES);
  const ok = d.filter((x) => x <= 20).length / d.length;
  check(`D3.2: ${name} at 4x CPU throttle, 95% of frames <= 20 ms`, ok >= 0.95, `${Math.round(ok * 100)}% of ${d.length}`);
}
await b.send('Emulation.setCPUThrottlingRate', { rate: 1 });

// ---- AC-D2.4 ----
await b.load(`${b.base}/`, 1200);
const inst = await b.send('Page.getInstallabilityErrors');
check('D2.4: no installability error', (inst.result?.installabilityErrors ?? []).length === 0, JSON.stringify(inst.result?.installabilityErrors ?? []));

// ---- AC-D2.5 ----
let axeSrc = null;
try { axeSrc = await (await fetch('https://cdn.jsdelivr.net/npm/axe-core@4.13.0/axe.min.js')).text(); } catch { /* offline */ }
if (!axeSrc) {
  check('D2.5: axe-core fetched from jsDelivr', false, 'no network; run again with access');
} else {
  for (const name of ['assistant-idle', 'assistant-filed', 'library-half', 'settings-model-downloading', 'about']) {
    await b.load(`${b.base}/?fixture=${name}`, 900);
    await b.ev(axeSrc);
    const res = await b.ev(`axe.run(document, { resultTypes: ['violations'] }).then((r) => r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id + ' x' + v.nodes.length + ' ' + (v.nodes[0]?.target?.join(' ') ?? '')))`);
    check(`D2.5: axe on ${name}: no serious or critical violation`, res.length === 0, res.slice(0, 4).join(' ; '));
  }
}
await b.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);

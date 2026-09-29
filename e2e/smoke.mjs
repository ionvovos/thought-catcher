// Browser smoke test for the v2 shell: every route renders on a phone and a desktop viewport, no horizontal scroll, no
// console error, no request to another host, no 404. Run outside the Bash sandbox: node e2e/smoke.mjs   Exit 0 = pass.
import { launch, sleep } from './lib/cdp.mjs';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`); if (!ok) failed += 1; };

const ROUTES = [['#/', '.orb'], ['#/library', '.sheet[role="dialog"]'], ['#/settings', '#page:not([hidden]) h1, #page:not([hidden]) .large-title'], ['#/about', '#page:not([hidden]) h1, #page:not([hidden]) .about-hero']];

for (const [label, vp] of [['phone', { width: 390, height: 844, mobile: true }], ['desktop', { width: 1280, height: 800, mobile: false }]]) {
  const b = await launch();
  await b.send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: vp.mobile ? 2 : 1, mobile: vp.mobile });
  await b.load(`${b.base}/`, 600);
  await b.ev(`localStorage.setItem('thought-catcher.onboarding.done', 'true')`);
  let n = 0;
  for (const [hash, sel] of ROUTES) {
    n += 1;
    await b.load(`${b.base}/?r=${n}${hash}`, 900); // a new query makes it a fresh page load, as a deep link or a refresh is
    check(`${label}: ${hash} renders`, await b.until(`!!document.querySelector(${JSON.stringify(sel)})`, 5000));
    check(`${label}: ${hash} has no horizontal scroll`, (await b.ev('document.documentElement.scrollWidth - innerWidth')) === 0);
  }
  const bad = b.problems.filter((p) => !/WebGPU|favicon/.test(p));
  check(`${label}: no console error or exception`, bad.length === 0, bad.slice(0, 3).join(' ; '));
  check(`${label}: no 404 from the static server`, b.requests.filter((r) => r.status === 404 && !/favicon/.test(r.url)).length === 0, b.requests.filter((r) => r.status === 404).map((r) => r.url).join(', '));
  const foreign = b.network.filter((u) => !u.startsWith(b.base) && !u.startsWith('data:') && !u.startsWith('blob:'));
  check(`${label}: no request to another host`, foreign.length === 0, foreign.slice(0, 3).join(', '));
  await b.close();
  await sleep(200);
}
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);

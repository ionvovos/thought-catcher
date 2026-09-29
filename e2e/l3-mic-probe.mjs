// Prints where the app lands for a given start URL and whether a fake microphone is granted (debug helper).
// Usage (outside the Bash sandbox): node e2e/l3-mic-probe.mjs [query]   e.g. "?capture=1&record=1"
import { launch } from './lib/cdp.mjs';

const b = await launch({ chromeArgs: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const grant = await b.send('Browser.grantPermissions', { permissions: ['audioCapture'], origin: b.base });
console.log('grant', JSON.stringify(grant.error ?? 'ok'));
await b.load(`${b.base}/${process.argv[2] ?? ''}`, 1500);
console.log(await b.ev(`JSON.stringify({ hash: location.hash, main: document.querySelector('.app-main')?.innerText.slice(0, 120) })`));
console.log(await b.ev(`navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => 'mic ok ' + s.getTracks().length, (e) => 'mic ERR ' + e.name)`));
console.log('PROBLEMS', JSON.stringify(b.problems));
await b.close();

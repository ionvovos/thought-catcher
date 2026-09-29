// Prints whether headless Chrome grants a fake microphone to the app origin (used to debug the Whisper check).
// Usage (outside the Bash sandbox): node e2e/l3-mic-probe.mjs
import { launch } from './lib/cdp.mjs';

const b = await launch({ chromeArgs: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const grant = await b.send('Browser.grantPermissions', { permissions: ['audioCapture'], origin: b.base });
console.log('grant', JSON.stringify(grant.error ?? 'ok'));
await b.load(`${b.base}/#/capture`);
console.log(await b.ev(`navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => 'ok ' + s.getTracks().length, (e) => 'ERR ' + e.name + ': ' + e.message)`));
console.log(await b.ev(`navigator.mediaDevices.enumerateDevices().then((d) => d.map((x) => x.kind))`));
await b.close();

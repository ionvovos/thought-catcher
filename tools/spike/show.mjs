// Prints one spike result file compactly: timings, download, and each ramble's parsed items.
import fs from 'node:fs';
for (const f of process.argv.slice(2)) {
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  console.log(`# ${f.split('/').pop()} wall=${j.wallMs} peakRss=${j.peakChromeRssMb} load=${j.result.loadMs} dl=${JSON.stringify(j.downloadedMbByHost)} err=${j.result.error ?? ''}`);
  for (const r of j.result.results ?? []) console.log(` ttft=${r.ttftMs} tok=${r.tokens} tps=${Math.round(r.decodeTps)} valid=${r.validJson} ${r.json ? JSON.stringify(r.json.items?.map((i) => [i.type, i.title, i.when])) : `RAW ${JSON.stringify(r.text).slice(0, 200)}`}`);
}

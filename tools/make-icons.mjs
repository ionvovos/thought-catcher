// Writes the PNG icons with node:zlib only (no image library). Run once: node tools/make-icons.mjs. Output is committed.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const outDir = path.join(fileURLToPath(new URL('..', import.meta.url)), 'icons');
const BLUE = [29, 78, 216]; // --accent in css/app.css
const WHITE = [255, 255, 255];

// Thought bubble: a big circle with three dots and two small circles trailing to the lower left.
// Coordinates are in the unit square. `scale` shrinks the drawing toward the centre (maskable icons keep to the safe zone).
const BUBBLE = { x: 0.5, y: 0.42, r: 0.25 };
const TRAIL = [{ x: 0.34, y: 0.73, r: 0.07 }, { x: 0.25, y: 0.84, r: 0.04 }];
const DOTS = [0.4, 0.5, 0.6].map((x) => ({ x, y: 0.42, r: 0.035 }));

const inCircle = (c, u, v) => (u - c.x) ** 2 + (v - c.y) ** 2 <= c.r ** 2;

// kind: 'rounded' (transparent corners), 'full' (opaque square: apple-touch-icon and maskable)
function pixel(x, y, size, kind, scale) {
  const px = x / size;
  const py = y / size;
  if (kind === 'rounded') {
    const r = 0.22;
    const cx = Math.min(Math.max(px, r), 1 - r);
    const cy = Math.min(Math.max(py, r), 1 - r);
    if ((px - cx) ** 2 + (py - cy) ** 2 > r * r) return [0, 0, 0, 0];
  }
  const u = (px - 0.5) / scale + 0.5;
  const v = (py - 0.5) / scale + 0.5 + 0.03;
  if (DOTS.some((d) => inCircle(d, u, v))) return [...BLUE, 255];
  if (inCircle(BUBBLE, u, v) || TRAIL.some((t) => inCircle(t, u, v))) return [...WHITE, 255];
  return [...BLUE, 255];
}

function render(size, kind, scale) {
  const ss = 4;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < size; x += 1) {
      const acc = [0, 0, 0, 0];
      for (let sy = 0; sy < ss; sy += 1) {
        for (let sx = 0; sx < ss; sx += 1) {
          const p = pixel(x + (sx + 0.5) / ss, y + (sy + 0.5) / ss, size, kind, scale);
          // premultiply so transparent corners blend correctly
          acc[0] += p[0] * p[3]; acc[1] += p[1] * p[3]; acc[2] += p[2] * p[3]; acc[3] += p[3];
        }
      }
      const n = ss * ss;
      const a = acc[3] / n;
      const o = row + 1 + x * 4;
      raw[o] = a ? Math.round(acc[0] / acc[3]) : 0;
      raw[o + 1] = a ? Math.round(acc[1] / acc[3]) : 0;
      raw[o + 2] = a ? Math.round(acc[2] / acc[3]) : 0;
      raw[o + 3] = Math.round(a);
    }
  }
  return raw;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}
export function png(size, kind, scale) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(render(size, kind, scale), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export const ICONS = [
  ['icon-192.png', 192, 'rounded', 1],
  ['icon-512.png', 512, 'rounded', 1],
  ['icon-maskable-512.png', 512, 'full', 0.8],
  ['apple-touch-icon-180.png', 180, 'full', 0.95],
];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fs.mkdirSync(outDir, { recursive: true });
  for (const [name, size, kind, scale] of ICONS) {
    fs.writeFileSync(path.join(outDir, name), png(size, kind, scale));
    console.log(`wrote icons/${name}`);
  }
}

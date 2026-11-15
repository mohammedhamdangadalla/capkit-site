// ═══════════════════════════════════════════════════════════════════════
// make-book-cover.mjs — يولّد book-cover.png (1200×630) بلا أي مكتبة
// PNG encoder مصغّر: IHDR + IDAT (zlib) + IEND
// ═══════════════════════════════════════════════════════════════════════

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const W = 1200;
const H = 630;

/* ── CRC32 ── */
const table = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  table[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/* ── أدوات رسم ── */
const mix = (a, b, t) => Math.round(a + (b - a) * t);
function px(buf, x, y, r, g, b) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  buf[i] = r; buf[i + 1] = g; buf[i + 2] = b;
}
function rect(buf, x0, y0, x1, y1, r, g, b) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) px(buf, x, y, r, g, b);
}
function border(buf, x0, y0, x1, y1, r, g, b, t = 2) {
  rect(buf, x0, y0, x1, y0 + t, r, g, b);
  rect(buf, x0, y1 - t, x1, y1, r, g, b);
  rect(buf, x0, y0, x0 + t, y1, r, g, b);
  rect(buf, x1 - t, y0, x1, y1, r, g, b);
}

/* ── اللوحة ── */
const raw = Buffer.alloc(W * H * 3);

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const t = (x / W) * 0.45 + (y / H) * 0.55;
    const r = mix(11, 26, t);
    const g = mix(10, 21, t);
    const b = mix(8, 15, t);
    px(raw, x, y, r, g, b);
  }
}

// شبكة خفيفة
for (let x = 0; x < W; x += 40) {
  for (let y = 0; y < H; y++) {
    const i = (y * W + x) * 3;
    raw[i] = Math.min(255, raw[i] + 6);
    raw[i + 1] = Math.min(255, raw[i + 1] + 5);
    raw[i + 2] = Math.min(255, raw[i + 2] + 3);
  }
}
for (let y = 0; y < H; y += 40) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    raw[i] = Math.min(255, raw[i] + 5);
    raw[i + 1] = Math.min(255, raw[i + 1] + 4);
    raw[i + 2] = Math.min(255, raw[i + 2] + 3);
  }
}

// إطار ذهبي
border(raw, 28, 28, W - 28, H - 28, 201, 169, 97, 3);

// كتاب في المنتصف
const bx0 = 470, by0 = 96, bx1 = 730, by1 = 436;
rect(raw, bx0, by0, bx1, by1, 27, 23, 16);
border(raw, bx0, by0, bx1, by1, 201, 169, 97, 3);
rect(raw, bx0 + 20, by0 + 20, bx1 - 20, by0 + 22, 201, 169, 97);
rect(raw, 599, by0 + 6, 601, by1 - 6, 201, 169, 97);

// نقاط داخل الصفحة اليسرى
const dots = [[-70, -120], [-30, -120], [-70, -80], [-30, -80], [-70, -40], [-30, -40]];
for (const [dx, dy] of dots) {
  rect(raw, 600 + dx - 6, 266 + dy - 6, 600 + dx + 6, 266 + dy + 6, 201, 169, 97);
}

// خطوط داخل الصفحة اليمنى
for (let i = 0; i < 5; i++) {
  const y = 150 + i * 42;
  rect(raw, 620, y, 620 + (i % 2 === 0 ? 80 : 56), y + 10, 201, 169, 97);
}

// شريط ذهبي أسفل الكتاب
rect(raw, 520, 486, 680, 510, 201, 169, 97);

// خط فاصل سفلي
rect(raw, 380, 556, 820, 558, 201, 169, 97);

/* ── كتابة PNG ── */
const scanlines = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) {
  scanlines[y * (W * 3 + 1)] = 0; // filter none
  raw.copy(scanlines, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 2;  // RGB
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(scanlines, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

writeFileSync('book-cover.png', png);
console.log('✔ book-cover.png', (png.length / 1024).toFixed(1), 'KB', `${W}×${H}`);

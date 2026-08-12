#!/usr/bin/env node
'use strict';
// Erases a stray bottom text label (e.g. "Clawde") that the background remover
// left baked into a transparent sprite. Strategy: scan up from the bottom,
// skip the transparent margin, and if the bottom-most opaque block is SHORT
// (text-like) and sits low with a transparent gap above it (separating it from
// the creature), clear that block's alpha. Aborts safely if the bottom block
// is tall (that's the creature's legs, not text).
//
// Usage: node scripts/trim-text.js web/assets/egg.png web/assets/voidmaw.png ...

const zlib = require('zlib');
const fs = require('fs');

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = t[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
})();
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function paeth(a, b, c) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }

function decode(buf) {
  const W = buf.readUInt32BE(16), H = buf.readUInt32BE(20);
  if (buf[24] !== 8 || buf[25] !== 6) throw new Error('expected 8-bit RGBA');
  let o = 8; const idat = [];
  while (o < buf.length) { const len = buf.readUInt32BE(o); const type = buf.toString('ascii', o + 4, o + 8); if (type === 'IDAT') idat.push(buf.slice(o + 8, o + 8 + len)); if (type === 'IEND') break; o += 12 + len; }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4, stride = W * bpp;
  const out = Buffer.alloc(H * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < H; y++) {
    const f = raw[y * (stride + 1)];
    const cur = raw.slice(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const rec = out.slice(y * stride, y * stride + stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? rec[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = cur[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) v += paeth(a, b, c);
      rec[i] = v & 0xff;
    }
    prev = rec;
  }
  return { W, H, px: out };
}

function encode(W, H, px) {
  const stride = W * 4;
  const raw = Buffer.alloc((stride + 1) * H);
  for (let y = 0; y < H; y++) { raw[y * (stride + 1)] = 0; px.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

function rowContent(px, W, y) { let n = 0; for (let x = 0; x < W; x++) if (px[(y * W + x) * 4 + 3] > 30) n++; return n; }

function trim(file) {
  const { W, H, px } = decode(fs.readFileSync(file));
  // scan up from bottom
  let y = H - 1;
  while (y >= 0 && rowContent(px, W, y) === 0) y--;      // skip bottom transparent margin
  if (y < 0) return console.log(`${file}: fully transparent? skipped`);
  const blockBottom = y;
  while (y >= 0 && rowContent(px, W, y) > 0) y--;         // walk up through the block
  const blockTop = y + 1;
  const blockH = blockBottom - blockTop + 1;
  // guards: block must be short (text-like) and sit in the lower part of the image,
  // and there must be a transparent gap above it (y now points at a transparent row).
  const gapAbove = y >= 0 && rowContent(px, W, y) === 0;
  if (blockH <= H * 0.14 && blockBottom >= H * 0.72 && gapAbove) {
    for (let yy = blockTop; yy <= blockBottom; yy++) for (let x = 0; x < W; x++) px[(yy * W + x) * 4 + 3] = 0;
    fs.writeFileSync(file, encode(W, H, px));
    console.log(`${file}: erased text block rows ${blockTop}-${blockBottom} (h=${blockH}) ✂`);
  } else {
    console.log(`${file}: no text block (bottom block h=${blockH} at ${blockTop}-${blockBottom}, gapAbove=${gapAbove}) — left as-is`);
  }
}

const files = process.argv.slice(2);
if (!files.length) { console.error('usage: node scripts/trim-text.js <png>...'); process.exit(1); }
for (const f of files) { try { trim(f); } catch (e) { console.error(f, 'ERROR', e.message); } }

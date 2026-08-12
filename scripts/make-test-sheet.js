#!/usr/bin/env node
'use strict';
// Generates a placeholder animated sprite sheet (a little blob monster) to
// validate the tank's sprite-sheet renderer end-to-end BEFORE we spend real
// Sprite-AI generations. Zero-dependency PNG encoder (zlib for IDAT).
//
// Output: web/assets/clawde-test.png  (64x64 = 2 cols x 2 rows of 32x32)
//   row 0 = idle (2 frames, blink)   row 1 = walk (2 frames, legs)

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const FW = 32, FH = 32, COLS = 2, ROWS = 2;
const W = FW * COLS, H = FH * ROWS;
const buf = Buffer.alloc(W * H * 4); // RGBA, transparent

function set(x, y, rgba) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  buf[i] = rgba[0]; buf[i + 1] = rgba[1]; buf[i + 2] = rgba[2]; buf[i + 3] = rgba[3] == null ? 255 : rgba[3];
}

// palette (Digimon-ish teal monster with orange belly)
const BODY = [0x3a, 0xc0, 0xa0], DARK = [0x1d, 0x6b, 0x5a], BELLY = [0xff, 0xc4, 0x6b];
const WHITE = [0xff, 0xff, 0xff], PUP = [0x18, 0x14, 0x2a], SPIKE = [0x2a, 0x8f, 0x78];

// draw one 32x32 frame at grid (cx,cy). walk=animate legs, blink=close eyes
function drawFrame(cx, cy, { walk = false, blink = false, legPhase = 0 } = {}) {
  const ox = cx * FW, oy = cy * FH;
  const P = (x, y, c) => set(ox + x, oy + y, c);

  // body: rounded blob centered ~ (16,18), radius ~10
  for (let y = 0; y < FH; y++) {
    for (let x = 0; x < FW; x++) {
      const dx = (x - 16) / 10, dy = (y - 18) / 9;
      const d = dx * dx + dy * dy;
      if (d <= 1.0) {
        // outline ring darker
        P(x, y, d > 0.78 ? DARK : BODY);
      }
    }
  }
  // belly patch
  for (let y = 18; y < 27; y++) for (let x = 12; x < 21; x++) {
    const dx = (x - 16) / 5, dy = (y - 22) / 4.5;
    if (dx * dx + dy * dy <= 1.0) P(x, y, BELLY);
  }
  // head spikes (little horns) — the "cool" digimon touch
  P(11, 8, SPIKE); P(11, 7, SPIKE); P(12, 9, SPIKE);
  P(20, 8, SPIKE); P(20, 7, SPIKE); P(19, 9, SPIKE);
  // eyes
  if (blink) {
    for (let x = 11; x <= 14; x++) P(x, 16, DARK);
    for (let x = 18; x <= 21; x++) P(x, 16, DARK);
  } else {
    for (let y = 14; y <= 17; y++) for (let x = 11; x <= 14; x++) P(x, y, WHITE);
    for (let y = 14; y <= 17; y++) for (let x = 18; x <= 21; x++) P(x, y, WHITE);
    P(13, 15, PUP); P(13, 16, PUP); P(20, 15, PUP); P(20, 16, PUP);
  }
  // little arms/claws on sides
  P(5, 20, DARK); P(6, 19, BODY); P(6, 21, BODY);
  P(26, 20, DARK); P(25, 19, BODY); P(25, 21, BODY);
  // legs (animate for walk)
  const off = walk ? (legPhase ? 1 : -1) : 0;
  for (let x = 10; x <= 13; x++) P(x, 27 + (off > 0 ? 1 : 0), DARK);
  for (let x = 18; x <= 21; x++) P(x, 27 + (off < 0 ? 1 : 0), DARK);
  P(11, 29 + (off > 0 ? 1 : 0), DARK); P(20, 29 + (off < 0 ? 1 : 0), DARK);
}

drawFrame(0, 0, { blink: false });          // idle frame 0
drawFrame(1, 0, { blink: true });           // idle frame 1 (blink)
drawFrame(0, 1, { walk: true, legPhase: 0 }); // walk frame 0
drawFrame(1, 1, { walk: true, legPhase: 1 }); // walk frame 1

// ---- encode PNG -------------------------------------------------------
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

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit RGBA

// raw scanlines with filter byte 0
const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 4 + 1)] = 0;
  buf.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
}
const idat = zlib.deflateSync(raw, { level: 9 });

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', idat),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = path.join(__dirname, '..', 'web', 'assets', 'clawde-test.png');
fs.writeFileSync(out, png);
console.log('wrote', out, png.length, 'bytes');

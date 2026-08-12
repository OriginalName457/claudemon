'use strict';
// Preview panel of CUTER / more-detailed takes on the approved #2 tank vessel.
// Hand-composited (no AI re-rolls) so the silhouette stays the one you picked.
// 4 directions, barren interior + look-through glass kept in every one.

const fs = require('fs');
const path = require('path');
const { decodePNG, encodePNG } = require('./img');

const ROOT = path.join(__dirname, '..');
const t2 = decodePNG(fs.readFileSync(path.join(ROOT, 'web', 'assets', '_tanks2', 't2.png')));
const W = t2.W, H = t2.H;
// interior bbox detected from t2
const X0 = 51, Y0 = 43, X1 = 213, Y1 = 197, FLOOR = 158;

// deterministic rng so previews are stable
let seed = 1337; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

function set(px, x, y, r, g, b, a = 255) {
  x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  if (a >= 255) { px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255; return; }
  const A = px[i + 3] / 255, na = a / 255, o = na + A * (1 - na); if (o <= 0) return;
  px[i] = Math.round((r * na + px[i] * A * (1 - na)) / o);
  px[i + 1] = Math.round((g * na + px[i + 1] * A * (1 - na)) / o);
  px[i + 2] = Math.round((b * na + px[i + 2] * A * (1 - na)) / o);
  px[i + 3] = Math.round(o * 255);
}
const rect = (px, x, y, w, h, r, g, b, a) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) set(px, xx, yy, r, g, b, a); };
const disc = (px, cx, cy, rx, ry, r, g, b, a) => { for (let yy = -ry; yy <= ry; yy++) for (let xx = -rx; xx <= rx; xx++) if ((xx * xx) / (rx * rx) + (yy * yy) / (ry * ry) <= 1) set(px, cx + xx, cy + yy, r, g, b, a); };

// ---- reusable detail bits ----
function glass(px, strong) {
  const s = strong ? 1 : 0.8;
  for (let k = 0; k < 2; k++) {
    const topX = X0 + (k ? 25 : 9), w = k ? 4 : 9, a = (k ? 30 : 24) * s;
    for (let y = Y0 + 3; y < Y1 - 2; y++) { const cx = topX + Math.round((y - Y0) * 0.55); for (let x = cx; x < cx + w; x++) if (x > X0 + 1 && x < X1 - 1) set(px, x, y, 255, 255, 255, a); }
  }
  for (let x = X0; x <= X1; x++) { set(px, x, Y0, 255, 255, 255, 80 * s); set(px, x, Y0 + 1, 255, 255, 255, 40 * s); }
  for (let y = Y0; y <= Y1; y++) { set(px, X0, y, 255, 255, 255, 46); set(px, X1, y, 200, 214, 224, 46); }
}
function sparkle(px, cx, cy, a) { set(px, cx, cy, 255, 255, 255, a); set(px, cx - 1, cy, 255, 255, 255, a * 0.6); set(px, cx + 1, cy, 255, 255, 255, a * 0.6); set(px, cx, cy - 1, 255, 255, 255, a * 0.6); set(px, cx, cy + 1, 255, 255, 255, a * 0.6); }
function vignette(px) { for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) { const dx = Math.min(x - X0, X1 - x) / 24, dy = Math.min(y - Y0, Y1 - y) / 24; const e = Math.max(0, 1 - Math.min(1, Math.min(dx, dy))); if (e > 0) set(px, x, y, 20, 40, 60, e * 22); } }
function caustics(px) { for (let y = FLOOR - 30; y < Y1 - 2; y++) for (let x = X0 + 3; x < X1 - 3; x++) { const v = Math.sin(x * 0.25 + y * 0.15) + Math.sin(x * 0.11 - y * 0.2); if (v > 1.2) set(px, x, y, 255, 255, 240, 26); } }
function bubbles(px, bx) { for (let i = 0; i < 7; i++) { const y = Y1 - 10 - i * 16 - (i * i) % 7; const x = bx + Math.round(Math.sin(i * 1.3) * 4); disc(px, x, y, 2 + (i % 2), 2 + (i % 2), 220, 240, 255, 60); } }
function pebbles(px) { for (let i = 0; i < 90; i++) { const x = X0 + 6 + rnd() * (X1 - X0 - 12); const y = FLOOR + 2 + rnd() * (Y1 - FLOOR - 4); const r = 2 + (rnd() * 2 | 0); const pal = [[214, 196, 168], [232, 216, 188], [190, 176, 152], [206, 188, 200]][rnd() * 4 | 0]; disc(px, x | 0, y | 0, r, r - 1 < 1 ? 1 : r - 1, pal[0], pal[1], pal[2], 255); disc(px, (x | 0) - 1, (y | 0) - 1, 1, 1, 255, 255, 255, 60); } }
function woodBase(px) {
  const bx = X0 - 8, bw = (X1 - X0) + 16, by = Y1 + 1, bh = 16;
  // shadow
  disc(px, (X0 + X1) >> 1, by + bh + 2, bw / 2, 4, 20, 30, 45, 40);
  rect(px, bx, by, bw, bh, 196, 150, 96, 255);            // body
  rect(px, bx, by, bw, 3, 224, 184, 130, 255);            // top light edge
  rect(px, bx, by + bh - 3, bw, 3, 150, 110, 64, 255);    // bottom shade
  for (let x = bx + 4; x < bx + bw - 4; x += 9) set(px, x, by + 8, 168, 124, 78, 120); // grain
  rect(px, bx + 8, by + bh, 8, 5, 168, 124, 78, 255);     // left foot
  rect(px, bx + bw - 16, by + bh, 8, 5, 168, 124, 78, 255); // right foot
}
function softWater(px) { // pastel gradient recolour of the water
  for (let y = Y0; y < FLOOR; y++) { const t = (y - Y0) / (FLOOR - Y0); const r = Math.round(198 + t * -20), g = Math.round(246 + t * -10), b = Math.round(252 + t * -6); for (let x = X0 + 1; x < X1; x++) { const i = (y * W + x) * 4; if (px[i] > 120 && px[i + 2] > 200 && px[i + 1] > 200) { px[i] = r; px[i + 1] = g; px[i + 2] = b; } } }
}

function variant(fn) { const px = Buffer.from(t2.px); fn(px); return px; }

const A = variant(px => { caustics(px); glass(px, true); sparkle(px, X0 + 10, Y0 + 8, 200); sparkle(px, X0 + 18, Y0 + 14, 120); vignette(px); });
const B = variant(px => { glass(px, false); caustics(px); woodBase(px); });
const C = variant(px => { pebbles(px); caustics(px); bubbles(px, X1 - 16); glass(px, false); });
const D = variant(px => { softWater(px); glass(px, true); bubbles(px, X0 + 20); sparkle(px, X0 + 12, Y0 + 10, 220); });

// panel: 1x4 with gaps on a dark card bg
const variants = [A, B, C, D];
const gap = 10, PW = W * 4 + gap * 3, PH = H;
const out = Buffer.alloc(PW * PH * 4);
for (let i = 0; i < PW * PH; i++) { out[i * 4] = 14; out[i * 4 + 1] = 20; out[i * 4 + 2] = 44; out[i * 4 + 3] = 255; }
variants.forEach((v, vi) => { const ox = vi * (W + gap); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const s = (y * W + x) * 4, d = (y * PW + (ox + x)) * 4; out[d] = v[s]; out[d + 1] = v[s + 1]; out[d + 2] = v[s + 2]; out[d + 3] = 255; } });
const dir = 'C:/Users/13wie/.claude/jobs/63c8e5e6/tmp/claw';
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(dir + '/tank_styles.png', encodePNG(PW, PH, out));
// also drop individual variants into web/ so the labeled preview page can show them
const pdir = path.join(ROOT, 'web', 'assets', '_preview');
fs.mkdirSync(pdir, { recursive: true });
['a', 'b', 'c', 'd'].forEach((n, i) => fs.writeFileSync(path.join(pdir, n + '.png'), encodePNG(W, H, variants[i])));
console.log('wrote tank_styles.png + _preview/{a,b,c,d}.png');

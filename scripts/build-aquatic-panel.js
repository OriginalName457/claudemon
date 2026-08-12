'use strict';
// Composite the desert options (+ original) into the real vessel with Dunepup
// inside + glass, so we can pick desert variants in context.

const fs = require('fs');
const path = require('path');
const { decodePNG, encodePNG, resize } = require('./img');

const ROOT = path.join(__dirname, '..');
const OUT = 'C:/Users/13wie/.claude/jobs/63c8e5e6/tmp/claw';
const PREV = path.join(ROOT, 'web', 'assets', '_preview');
const CW = 512, CH = 480;
const IX0 = 72, IX1 = 440, ITY = 46, IBY = 340, IW = IX1 - IX0, IH = IBY - ITY;
const FLOOR = 0.60, CREATURE = 'clawde', CSCALE = 2.2;

const cl = (v) => v < 0 ? 0 : v > 255 ? 255 : v;
function set(px, x, y, r, g, b, a = 255) {
  x |= 0; y |= 0; if (x < 0 || y < 0 || x >= CW || y >= CH) return; r = cl(r); g = cl(g); b = cl(b);
  const i = (y * CW + x) * 4;
  if (a >= 255) { px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255; return; }
  const A = px[i + 3] / 255, na = a / 255, o = na + A * (1 - na); if (o <= 0) return;
  px[i] = Math.round((r * na + px[i] * A * (1 - na)) / o); px[i + 1] = Math.round((g * na + px[i + 1] * A * (1 - na)) / o); px[i + 2] = Math.round((b * na + px[i + 2] * A * (1 - na)) / o); px[i + 3] = Math.round(o * 255);
}
const rect = (px, x, y, w, h, r, g, b, a) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) set(px, xx, yy, r, g, b, a); };
const disc = (px, cx, cy, rx, ry, r, g, b, a) => { for (let yy = -ry; yy <= ry; yy++) for (let xx = -rx; xx <= rx; xx++) if ((xx * xx) / (rx * rx) + (yy * yy) / (ry * ry) <= 1) set(px, cx + xx, cy + yy, r, g, b, a); };
function fit(im, cropB, w, h) {
  if (cropB > 0) { const nw = im.W - cropB * 2, nh = im.H - cropB * 2, px = Buffer.alloc(nw * nh * 4); for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) { const s = ((y + cropB) * im.W + (x + cropB)) * 4, d = (y * nw + x) * 4; px[d] = im.px[s]; px[d + 1] = im.px[s + 1]; px[d + 2] = im.px[s + 2]; px[d + 3] = im.px[s + 3]; } im = { W: nw, H: nh, px }; }
  return resize(im, w, h);
}
function woodBase(px) {
  const bx = IX0 - 14, bw = IW + 28, by = IBY + 2, bh = 30;
  disc(px, (IX0 + IX1) >> 1, by + bh + 4, bw >> 1, 8, 20, 30, 45, 40);
  rect(px, bx + 3, by, bw - 6, bh, 198, 152, 98, 255); rect(px, bx, by + 4, bw, bh - 8, 198, 152, 98, 255);
  rect(px, bx + 3, by, bw - 6, 5, 226, 186, 132, 255); rect(px, bx, by + bh - 6, bw, 6, 148, 108, 62, 255);
  for (let x = bx + 10; x < bx + bw - 10; x += 16) rect(px, x, by + 12, 2, 8, 170, 126, 80, 110);
  rect(px, bx + 18, by + bh, 16, 9, 168, 122, 76, 255); rect(px, bx + bw - 34, by + bh, 16, 9, 168, 122, 76, 255);
}
function rim(px) {
  for (let y = ITY; y <= IBY; y++) { set(px, IX0 - 1, y, 255, 255, 255, 70); set(px, IX1 + 1, y, 210, 224, 234, 70); }
  for (let x = IX0 - 1; x <= IX1 + 1; x++) { set(px, x, ITY - 1, 255, 255, 255, 90); set(px, x, IBY + 1, 190, 206, 220, 50); }
}
function glass() {
  const px = Buffer.alloc(CW * CH * 4);
  for (let y = ITY + 4; y < IBY - 2; y++) { const cx = IX0 + 26 + Math.round((y - ITY) * 0.55); for (let x = cx; x < cx + 40; x++) { const e = Math.min(x - cx, cx + 40 - x) / 20; if (x > IX0 && x < IX1) set(px, x, y, 255, 255, 255, 16 * Math.min(1, e + 0.35)); } }
  for (let x = IX0; x <= IX1; x++) set(px, x, ITY, 255, 255, 255, 70);
  rect(px, IX0 + 20, ITY + 16, 7, 1, 255, 255, 255, 150); rect(px, IX0 + 23, ITY + 13, 1, 7, 255, 255, 255, 150);
  return px;
}
const G = glass();
function tile(scenePath, cropB) {
  const px = Buffer.alloc(CW * CH * 4);
  for (let i = 0; i < CW * CH; i++) { px[i * 4] = 226; px[i * 4 + 1] = 236; px[i * 4 + 2] = 246; px[i * 4 + 3] = 255; }
  const scene = fit(decodePNG(fs.readFileSync(scenePath)), cropB, IW, IH);
  for (let y = 0; y < IH; y++) for (let x = 0; x < IW; x++) { const s = (y * IW + x) * 4; if (scene.px[s + 3] < 8) continue; set(px, IX0 + x, ITY + y, scene.px[s], scene.px[s + 1], scene.px[s + 2], 255); }
  rim(px); woodBase(px);
  const spr = decodePNG(fs.readFileSync(path.join(ROOT, 'web', 'assets', CREATURE + '.png')));
  const fw = 48, dw = Math.round(fw * CSCALE * 0.9), dh = dw, cx = CW >> 1, fy = Math.round(FLOOR * CH), ox = cx - (dw >> 1), oy = fy - dh;
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) { const sxp = (x / dw * fw) | 0, syp = (y / dh * 48) | 0, si = (syp * spr.W + sxp) * 4; if (spr.px[si + 3] < 128) continue; set(px, ox + x, oy + y, spr.px[si], spr.px[si + 1], spr.px[si + 2], 255); }
  for (let i = 0; i < px.length; i += 4) { const a = G[i + 3]; if (a) { const A = a / 255; px[i] = Math.round(G[i] * A + px[i] * (1 - A)); px[i + 1] = Math.round(G[i + 1] * A + px[i + 1] * (1 - A)); px[i + 2] = Math.round(G[i + 2] * A + px[i + 2] * (1 - A)); } }
  return px;
}

const ITEMS = [
  ['aqua0', path.join(ROOT, 'web', 'assets', '_interiors', 'aquatic.png'), 2, 'ORIGINAL'],
  ['aqua1', path.join(ROOT, 'web', 'assets', '_aqua_opts', 'o1_reef.png'), 3, '1 reef'],
  ['aqua2', path.join(ROOT, 'web', 'assets', '_aqua_opts', 'o2_kelp.png'), 3, '2 kelp'],
  ['aqua3', path.join(ROOT, 'web', 'assets', '_aqua_opts', 'o3_lagoon.png'), 3, '3 lagoon'],
  ['aqua4', path.join(ROOT, 'web', 'assets', '_aqua_opts', 'o4_deep.png'), 3, '4 deep'],
  ['aqua5', path.join(ROOT, 'web', 'assets', '_aqua_opts', 'o5_glow.png'), 3, '5 glow'],
  ['aqua6', path.join(ROOT, 'web', 'assets', '_aqua_opts', 'o6_sunny.png'), 3, '6 sunny'],
];

fs.mkdirSync(PREV, { recursive: true });
const built = [];
for (const [name, p, crop, label] of ITEMS) {
  try { const t = tile(p, crop); fs.writeFileSync(path.join(PREV, name + '.png'), encodePNG(CW, CH, t)); built.push([t, label]); console.log('built', name, label); }
  catch (e) { console.log('skip', name, e.message); }
}
const TW = 300, TH = Math.round(300 * CH / CW), cols = 4, rows = Math.ceil(built.length / cols), gap = 8;
const PW = cols * TW + gap * (cols + 1), PH = rows * TH + gap * (rows + 1);
const out = Buffer.alloc(PW * PH * 4); for (let i = 0; i < PW * PH; i++) { out[i * 4] = 14; out[i * 4 + 1] = 20; out[i * 4 + 2] = 44; out[i * 4 + 3] = 255; }
built.forEach(([t], i) => { const sc = resize({ W: CW, H: CH, px: t }, TW, TH); const c = i % cols, r = (i / cols) | 0, ox = gap + c * (TW + gap), oy = gap + r * (TH + gap); for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) { const s = (y * TW + x) * 4, d = ((oy + y) * PW + (ox + x)) * 4; out[d] = sc.px[s]; out[d + 1] = sc.px[s + 1]; out[d + 2] = sc.px[s + 2]; out[d + 3] = 255; } });
fs.writeFileSync(OUT + '/aquatic_options.png', encodePNG(PW, PH, out));
console.log('contact sheet desert_options.png');

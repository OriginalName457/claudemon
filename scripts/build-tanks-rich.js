'use strict';
// Compose the rich PixelLab interiors into our consistent 512x480 vessel:
//   background layer = interior scene + wood base + thin frameless glass rim
//   glass layer      = clear soft sheen overlay (reused tank_glass.png)
// Writes _bg/<biome> tanks and a preview panel with real creatures inside.

const fs = require('fs');
const path = require('path');
const { decodePNG, encodePNG, resize } = require('./img');

const ROOT = path.join(__dirname, '..');
const IN = path.join(ROOT, 'web', 'assets', '_interiors');
const OUT = path.join(ROOT, 'web', 'assets', '_bg');
const CW = 512, CH = 480;
// interior window in the frame + wood base
const IX0 = 72, IX1 = 440, ITY = 46, IBY = 340;         // interior scene box
const IW = IX1 - IX0, IH = IBY - ITY;

const cl = (v) => v < 0 ? 0 : v > 255 ? 255 : v;
function set(px, x, y, r, g, b, a = 255) {
  x |= 0; y |= 0; if (x < 0 || y < 0 || x >= CW || y >= CH) return;
  r = cl(r); g = cl(g); b = cl(b);
  const i = (y * CW + x) * 4;
  if (a >= 255) { px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255; return; }
  const A = px[i + 3] / 255, na = a / 255, o = na + A * (1 - na); if (o <= 0) return;
  px[i] = Math.round((r * na + px[i] * A * (1 - na)) / o);
  px[i + 1] = Math.round((g * na + px[i + 1] * A * (1 - na)) / o);
  px[i + 2] = Math.round((b * na + px[i + 2] * A * (1 - na)) / o);
  px[i + 3] = Math.round(o * 255);
}
const rect = (px, x, y, w, h, r, g, b, a) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) set(px, xx, yy, r, g, b, a); };
const disc = (px, cx, cy, rx, ry, r, g, b, a) => { for (let yy = -ry; yy <= ry; yy++) for (let xx = -rx; xx <= rx; xx++) if ((xx * xx) / (rx * rx) + (yy * yy) / (ry * ry) <= 1) set(px, cx + xx, cy + yy, r, g, b, a); };

// crop a decoded png inward by `b` px on each side, then resize to WxH
function fit(im, cropB, w, h) {
  if (cropB > 0) {
    const nw = im.W - cropB * 2, nh = im.H - cropB * 2, px = Buffer.alloc(nw * nh * 4);
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) { const s = ((y + cropB) * im.W + (x + cropB)) * 4, d = (y * nw + x) * 4; px[d] = im.px[s]; px[d + 1] = im.px[s + 1]; px[d + 2] = im.px[s + 2]; px[d + 3] = im.px[s + 3]; }
    im = { W: nw, H: nh, px };
  }
  return resize(im, w, h);
}

function woodBase(px) {
  const bx = IX0 - 14, bw = IW + 28, by = IBY + 2, bh = 30;
  disc(px, (IX0 + IX1) >> 1, by + bh + 4, bw >> 1, 8, 20, 30, 45, 40);
  rect(px, bx + 3, by, bw - 6, bh, 198, 152, 98, 255);
  rect(px, bx, by + 4, bw, bh - 8, 198, 152, 98, 255);
  rect(px, bx + 3, by, bw - 6, 5, 226, 186, 132, 255);
  rect(px, bx, by + bh - 6, bw, 6, 148, 108, 62, 255);
  for (let x = bx + 10; x < bx + bw - 10; x += 16) rect(px, x, by + 12, 2, 8, 170, 126, 80, 110);
  rect(px, bx + 18, by + bh, 16, 9, 168, 122, 76, 255);
  rect(px, bx + bw - 34, by + bh, 16, 9, 168, 122, 76, 255);
}

// thin frameless glass rim so the interior reads as a contained tank
function rim(px) {
  for (let y = ITY; y <= IBY; y++) { set(px, IX0 - 1, y, 255, 255, 255, 70); set(px, IX0 - 2, y, 210, 226, 236, 40); set(px, IX1 + 1, y, 210, 224, 234, 70); set(px, IX1 + 2, y, 190, 206, 220, 36); }
  for (let x = IX0 - 1; x <= IX1 + 1; x++) { set(px, x, ITY - 1, 255, 255, 255, 90); set(px, x, ITY - 2, 255, 255, 255, 40); set(px, x, IBY + 1, 190, 206, 220, 50); }
}

const CROP = { aquatic: 2, vivarium: 14, desert: 2 };  // viv had a dark drawn border

function background(biome) {
  const px = Buffer.alloc(CW * CH * 4);
  for (let i = 0; i < CW * CH; i++) { px[i * 4] = 226; px[i * 4 + 1] = 236; px[i * 4 + 2] = 246; px[i * 4 + 3] = 255; } // desk
  const scene = fit(decodePNG(fs.readFileSync(path.join(IN, biome + '.png'))), CROP[biome], IW, IH);
  for (let y = 0; y < IH; y++) for (let x = 0; x < IW; x++) { const s = (y * IW + x) * 4; if (scene.px[s + 3] < 8) continue; set(px, IX0 + x, ITY + y, scene.px[s], scene.px[s + 1], scene.px[s + 2], 255); }
  rim(px);
  woodBase(px);
  return px;
}

// clear soft glass sheen overlay (transparent)
function glass() {
  const px = Buffer.alloc(CW * CH * 4);
  for (let y = ITY + 4; y < IBY - 2; y++) { const cx = IX0 + 26 + Math.round((y - ITY) * 0.55); for (let x = cx; x < cx + 40; x++) { const e = Math.min(x - cx, cx + 40 - x) / 20; if (x > IX0 && x < IX1) set(px, x, y, 255, 255, 255, 16 * Math.min(1, e + 0.35)); } }
  for (let x = IX0; x <= IX1; x++) { set(px, x, ITY, 255, 255, 255, 70); set(px, x, ITY + 1, 255, 255, 255, 34); }
  for (let y = ITY; y <= IBY; y++) { set(px, IX0, y, 255, 255, 255, 30); set(px, IX1, y, 200, 214, 224, 30); }
  rect(px, IX0 + 20, ITY + 16, 7, 1, 255, 255, 255, 150); rect(px, IX0 + 23, ITY + 13, 1, 7, 255, 255, 255, 150); // sparkle
  return px;
}

const MAP = { aquatic: 'tank_aqua_a.png', vivarium: 'tank_viv.png', desert: 'tank_desert.png' };
if (process.argv.includes('--write')) {
  for (const [b, name] of Object.entries(MAP)) { fs.writeFileSync(path.join(OUT, name), encodePNG(CW, CH, background(b))); console.log('wrote', name); }
  fs.writeFileSync(path.join(OUT, 'tank_glass.png'), encodePNG(CW, CH, glass()));
  console.log('wrote tank_glass.png');
}

// ---- preview panel with real creatures inside ----
const FLOOR = { aquatic: 0.60, vivarium: 0.64, desert: 0.63 };
const SPR = { aquatic: ['clawde', 2.2], vivarium: ['mosskit', 1.6], desert: ['dunepup', 1.6] };
const g = glass();
function tile(biome) {
  const px = background(biome);
  const [sp, sc] = SPR[biome];
  const spr = decodePNG(fs.readFileSync(path.join(ROOT, 'web', 'assets', sp + '.png')));
  const fw = 48, dw = Math.round(fw * sc * 0.9), dh = dw, cx = CW >> 1, fy = Math.round(FLOOR[biome] * CH), ox = cx - (dw >> 1), oy = fy - dh;
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) { const sxp = (x / dw * fw) | 0, syp = (y / dh * 48) | 0, si = (syp * spr.W + sxp) * 4; if (spr.px[si + 3] < 128) continue; set(px, ox + x, oy + y, spr.px[si], spr.px[si + 1], spr.px[si + 2], 255); }
  for (let i = 0; i < px.length; i += 4) { const a = g[i + 3]; if (a) { const A = a / 255; px[i] = Math.round(g[i] * A + px[i] * (1 - A)); px[i + 1] = Math.round(g[i + 1] * A + px[i + 1] * (1 - A)); px[i + 2] = Math.round(g[i + 2] * A + px[i + 2] * (1 - A)); } }
  return px;
}
const tiles = ['aquatic', 'vivarium', 'desert'].map(tile);
const gap = 10, PW = CW * 3 + gap * 2, out = Buffer.alloc(PW * CH * 4);
for (let i = 0; i < PW * CH; i++) { out[i * 4] = 12; out[i * 4 + 1] = 18; out[i * 4 + 2] = 44; out[i * 4 + 3] = 255; }
tiles.forEach((t, i) => { const ox = i * (CW + gap); for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) { const s = (y * CW + x) * 4, d = (y * PW + (ox + x)) * 4; out[d] = t[s]; out[d + 1] = t[s + 1]; out[d + 2] = t[s + 2]; out[d + 3] = 255; } });
fs.writeFileSync('C:/Users/13wie/.claude/jobs/63c8e5e6/tmp/claw/rich.png', encodePNG(PW, CH, out));
console.log('preview rich.png');

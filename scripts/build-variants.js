'use strict';
// Build background-only tank variants at 512x480 — ZOOMED IN: the biome scene
// FILLS the full width (0..512) up to y=410, with a wood shelf below and no desk
// white-space. Also writes the matching clear glass overlay (tank_glass.png).
// NO creature, NO camera zoom (authored 1:1 → crisp).

const fs = require('fs');
const path = require('path');
const { decodePNG, encodePNG, resize } = require('./img');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'web', 'assets', '_bg');
const CW = 512, CH = 480, SCENE_H = 410;   // scene 0..410, wood shelf 410..480

const cl = (v) => v < 0 ? 0 : v > 255 ? 255 : v;
function set(px, x, y, r, g, b, a = 255) {
  x |= 0; y |= 0; if (x < 0 || y < 0 || x >= CW || y >= CH) return; r = cl(r); g = cl(g); b = cl(b);
  const i = (y * CW + x) * 4;
  if (a >= 255) { px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255; return; }
  const A = px[i + 3] / 255, na = a / 255, o = na + A * (1 - na); if (o <= 0) return;
  px[i] = Math.round((r * na + px[i] * A * (1 - na)) / o); px[i + 1] = Math.round((g * na + px[i + 1] * A * (1 - na)) / o); px[i + 2] = Math.round((b * na + px[i + 2] * A * (1 - na)) / o); px[i + 3] = Math.round(o * 255);
}
const rect = (px, x, y, w, h, r, g, b, a) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) set(px, xx, yy, r, g, b, a); };
function cropBorder(im, b) {
  if (b <= 0) return im;
  const nw = im.W - b * 2, nh = im.H - b * 2, px = Buffer.alloc(nw * nh * 4);
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) { const s = ((y + b) * im.W + (x + b)) * 4, d = (y * nw + x) * 4; px[d] = im.px[s]; px[d + 1] = im.px[s + 1]; px[d + 2] = im.px[s + 2]; px[d + 3] = im.px[s + 3]; }
  return { W: nw, H: nh, px };
}

// full-width wood shelf the tank sits on
function woodShelf(px) {
  rect(px, 0, SCENE_H, CW, CH - SCENE_H, 198, 152, 98, 255);   // body
  rect(px, 0, SCENE_H, CW, 5, 226, 186, 132, 255);            // top light edge
  rect(px, 0, CH - 9, CW, 9, 148, 108, 62, 255);              // bottom shade
  for (let x = 10; x < CW - 10; x += 20) rect(px, x, SCENE_H + 18, 2, 22, 170, 126, 80, 90); // grain
}

function background(scenePath, crop) {
  const px = Buffer.alloc(CW * CH * 4);
  const scene = resize(cropBorder(decodePNG(fs.readFileSync(scenePath)), crop), CW, SCENE_H);
  for (let y = 0; y < SCENE_H; y++) for (let x = 0; x < CW; x++) { const s = (y * CW + x) * 4; set(px, x, y, scene.px[s], scene.px[s + 1], scene.px[s + 2], 255); }
  woodShelf(px);
  return px;
}

// clear glass overlay matching the full-width framing (edges at the frame border)
function glass() {
  const px = Buffer.alloc(CW * CH * 4);
  for (let y = 4; y < SCENE_H - 4; y++) { const cx = 30 + Math.round(y * 0.5); for (let x = cx; x < cx + 46; x++) { const e = Math.min(x - cx, cx + 46 - x) / 23; if (x > 1 && x < CW - 1) set(px, x, y, 255, 255, 255, 15 * Math.min(1, e + 0.35)); } }
  for (let x = 0; x < CW; x++) { set(px, x, 0, 255, 255, 255, 80); set(px, x, 1, 255, 255, 255, 40); set(px, x, 2, 255, 255, 255, 20); } // top lip
  for (let y = 0; y < SCENE_H; y++) { set(px, 0, y, 255, 255, 255, 60); set(px, 1, y, 255, 255, 255, 26); set(px, CW - 1, y, 200, 214, 224, 60); set(px, CW - 2, y, 200, 214, 224, 26); } // side edges
  for (let x = 0; x < CW; x++) { set(px, x, SCENE_H - 1, 210, 224, 236, 120); set(px, x, SCENE_H - 2, 210, 224, 236, 50); } // bottom glass edge
  rect(px, 22, 16, 8, 1, 255, 255, 255, 150); rect(px, 25, 13, 1, 8, 255, 255, 255, 150); // sparkle
  return px;
}

const BUILD = require(path.join(__dirname, 'variants-config.json'));
const registry = {};
for (const [biome, cfg] of Object.entries(BUILD)) {
  registry[biome] = { default: cfg.default, variants: {} };
  for (const [key, v] of Object.entries(cfg.variants)) {
    fs.writeFileSync(path.join(OUT, v.file), encodePNG(CW, CH, background(path.join(ROOT, v.src), v.crop)));
    registry[biome].variants[key] = v.file;
    console.log('built', biome, key, '->', v.file);
  }
}
fs.writeFileSync(path.join(OUT, 'tank_glass.png'), encodePNG(CW, CH, glass()));
fs.writeFileSync(path.join(OUT, 'variants.json'), JSON.stringify(registry, null, 2));
console.log('wrote tank_glass.png + variants.json');

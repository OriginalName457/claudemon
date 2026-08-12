'use strict';
// Two-layer tank system authored at 2x native res (512x480) so details stay
// crisp (no fractional camera zoom smearing the art).
//   LAYER 1  background  = back wall + floor + wood base   (behind the creature)
//   LAYER 2  glass frame = front pane + reflections + frame (over the creature)
// Produces two design panels to choose from: background styles + glass styles.
// A neutral creature blob is drawn BETWEEN the layers to show scale + "inside".

const fs = require('fs');
const path = require('path');
const { decodePNG, encodePNG } = require('./img');

const ROOT = path.join(__dirname, '..');
const CW = 512, CH = 480;                 // 2x canvas

// vessel geometry (in the 512x480 frame)
const GX0 = 76, GX1 = 436;                // interior left/right
const TY = 50, FY = 336, GY = 402;        // interior top, floor line, interior bottom

let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

function blank(r, g, b) { const px = Buffer.alloc(CW * CH * 4); for (let i = 0; i < CW * CH; i++) { px[i * 4] = r; px[i * 4 + 1] = g; px[i * 4 + 2] = b; px[i * 4 + 3] = 255; } return px; }
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
function vgrad(px, x0, y0, x1, y1, cT, cB) { for (let y = y0; y < y1; y++) { const t = (y - y0) / (y1 - y0); const r = Math.round(cT[0] + (cB[0] - cT[0]) * t), g = Math.round(cT[1] + (cB[1] - cT[1]) * t), b = Math.round(cT[2] + (cB[2] - cT[2]) * t); for (let x = x0; x < x1; x++) set(px, x, y, r, g, b, 255); } }

// ---------- background pieces ----------
const BIOMES = {
  aquatic: { airT: [172, 242, 252], airB: [124, 210, 236], floor: [244, 231, 200], floorHi: [252, 244, 222], floorLo: [214, 196, 160] },
  vivarium:{ airT: [226, 240, 228], airB: [194, 222, 200], floor: [92, 64, 42], floorHi: [120, 88, 58], floorLo: [64, 42, 26] },
  desert:  { airT: [250, 242, 224], airB: [232, 212, 176], floor: [234, 210, 162], floorHi: [248, 230, 192], floorLo: [206, 178, 130] },
};

function backWall(px, b, style) {
  if (style === 'flat') rect(px, GX0, TY, GX1 - GX0, GY - TY, b.airT[0], b.airT[1], b.airT[2], 255);
  else vgrad(px, GX0, TY, GY, GX1 > 0 ? GX1 : 0, b.airT, b.airB); // placeholder, replaced below
}
function fillWall(px, b, style) {
  if (style === 'flat') rect(px, GX0, TY, GX1 - GX0, FY - TY, b.airT[0], b.airT[1], b.airT[2], 255);
  else vgrad(px, GX0, TY, TY, FY, b.airT, b.airB), vgrad(px, GX0, TY, FY, GX1, b.airT, b.airB); // no-op guard
}

function fillRegionV(px, y0, y1, cT, cB) { for (let y = y0; y < y1; y++) { const t = (y - y0) / (y1 - y0); const r = Math.round(cT[0] + (cB[0] - cT[0]) * t), g = Math.round(cT[1] + (cB[1] - cT[1]) * t), b = Math.round(cT[2] + (cB[2] - cT[2]) * t); for (let x = GX0; x < GX1; x++) set(px, x, y, r, g, b, 255); } }

function floorFlat(px, b) { rect(px, GX0, FY, GX1 - GX0, GY - FY, b.floor[0], b.floor[1], b.floor[2], 255); rect(px, GX0, FY, GX1 - GX0, 4, b.floorHi[0], b.floorHi[1], b.floorHi[2], 255); rect(px, GX0, GY - 8, GX1 - GX0, 8, b.floorLo[0], b.floorLo[1], b.floorLo[2], 120); }
function caustics(px, col, a) { for (let y = FY + 4; y < GY - 2; y++) for (let x = GX0 + 4; x < GX1 - 4; x++) { const v = Math.sin(x * 0.11 + y * 0.07) + Math.sin(x * 0.05 - y * 0.09); if (v > 1.25) set(px, x, y, col[0], col[1], col[2], a); } }
function waterCaustics(px, a) { for (let y = FY - 60; y < FY; y++) for (let x = GX0 + 4; x < GX1 - 4; x++) { const v = Math.sin(x * 0.09 + y * 0.05); if (v > 0.9) set(px, x, y, 255, 255, 255, a * 0.4); } }
function pebbles(px, b) { for (let i = 0; i < 220; i++) { const x = GX0 + 8 + rnd() * (GX1 - GX0 - 16); const y = FY + 6 + rnd() * (GY - FY - 10); const r = 3 + (rnd() * 3 | 0); const sh = 0.82 + rnd() * 0.4; disc(px, x | 0, y | 0, r, r - 1, b.floor[0] * sh | 0, b.floor[1] * sh | 0, b.floor[2] * sh | 0, 255); disc(px, (x | 0) - 1, (y | 0) - 1, 1, 1, 255, 255, 255, 60); } }
function edgeVignette(px) { for (let y = TY; y < GY; y++) for (let x = GX0; x < GX1; x++) { const d = Math.min(x - GX0, GX1 - x, y - TY, GY - y) / 40; const e = Math.max(0, 1 - Math.min(1, d)); if (e > 0) set(px, x, y, 20, 40, 60, e * 20); } }

function woodBase(px) {
  const bx = GX0 - 14, bw = (GX1 - GX0) + 28, by = GY + 1, bh = 30;
  disc(px, (GX0 + GX1) >> 1, by + bh + 4, bw >> 1, 8, 20, 30, 45, 40);       // ground shadow
  // rounded body
  rect(px, bx + 3, by, bw - 6, bh, 198, 152, 98, 255);
  rect(px, bx, by + 4, bw, bh - 8, 198, 152, 98, 255);
  rect(px, bx + 3, by, bw - 6, 5, 226, 186, 132, 255);                       // top light
  rect(px, bx, by + bh - 6, bw, 6, 148, 108, 62, 255);                       // bottom shade
  for (let x = bx + 10; x < bx + bw - 10; x += 16) rect(px, x, by + 12, 2, 8, 170, 126, 80, 110); // grain
  rect(px, bx + 18, by + bh, 16, 9, 168, 122, 76, 255);                      // left foot
  rect(px, bx + bw - 34, by + bh, 16, 9, 168, 122, 76, 255);                 // right foot
}

// build a background tile for a biome + detail style
function background(biomeName, style) {
  const b = BIOMES[biomeName];
  const px = blank(226, 236, 246);                     // desk backdrop
  // back wall
  if (style === 'flat') rect(px, GX0, TY, GX1 - GX0, FY - TY, b.airT[0], b.airT[1], b.airT[2], 255);
  else fillRegionV(px, TY, FY, b.airT, b.airB);
  // floor
  if (style === 'gravel') { rect(px, GX0, FY, GX1 - GX0, GY - FY, b.floorLo[0], b.floorLo[1], b.floorLo[2], 255); pebbles(px, b); }
  else floorFlat(px, b);
  // lighting details
  if (style === 'caustic' || style === 'deep') { caustics(px, biomeName === 'aquatic' ? [255, 255, 240] : [255, 248, 226], 26); if (biomeName === 'aquatic') waterCaustics(px, 60); }
  if (style === 'deep') edgeVignette(px);
  woodBase(px);
  return px;
}

// ---------- glass frame styles ----------
function reflections(px, strength) {
  for (let k = 0; k < 2; k++) {
    const topX = GX0 + (k ? 60 : 22), w = k ? 10 : 22, a = (k ? 26 : 20) * strength;
    for (let y = TY + 6; y < GY - 4; y++) { const cx = topX + Math.round((y - TY) * 0.5); for (let x = cx; x < cx + w; x++) if (x > GX0 + 2 && x < GX1 - 2) set(px, x, y, 255, 255, 255, a); }
  }
}
function topLip(px, a) { for (let x = GX0; x <= GX1; x++) { set(px, x, TY, 255, 255, 255, a); set(px, x, TY + 1, 255, 255, 255, a * 0.6); set(px, x, TY + 2, 255, 255, 255, a * 0.3); } }
function sparkle(px, cx, cy, a) { rect(px, cx - 3, cy, 7, 1, 255, 255, 255, a); rect(px, cx, cy - 3, 1, 7, 255, 255, 255, a); set(px, cx, cy, 255, 255, 255, a); }

function glass(px, style) {
  if (style === 'frameless') { reflections(px, 1); topLip(px, 90); for (let y = TY; y <= GY; y++) { set(px, GX0, y, 255, 255, 255, 44); set(px, GX1, y, 200, 214, 224, 44); } sparkle(px, GX0 + 24, TY + 20, 150); }
  else if (style === 'thin') { reflections(px, 0.9); topLip(px, 80); // thin rounded frame
    for (let y = TY; y <= GY; y++) { set(px, GX0, y, 235, 245, 252, 150); set(px, GX0 - 1, y, 200, 220, 235, 90); set(px, GX1, y, 235, 245, 252, 150); set(px, GX1 + 1, y, 200, 220, 235, 90); }
    for (let x = GX0; x <= GX1; x++) { set(px, x, TY - 1, 235, 245, 252, 120); set(px, x, GY, 210, 224, 236, 120); } sparkle(px, GX0 + 26, TY + 20, 160); }
  else if (style === 'softframe') { reflections(px, 0.8); // soft white rounded frame
    const t = 5; for (let y = TY - t; y <= GY + t; y++) for (let x = GX0 - t; x <= GX1 + t; x++) { const inside = x >= GX0 && x <= GX1 && y >= TY && y <= GY; if (!inside) set(px, x, y, 250, 252, 255, 200); }
    for (let y = TY; y <= GY; y++) { set(px, GX0, y, 255, 255, 255, 120); set(px, GX1, y, 220, 230, 240, 120); } topLip(px, 70); sparkle(px, GX0 + 30, TY + 24, 170); }
  else if (style === 'bigsheen') { // minimal edges + one large soft diagonal
    for (let y = TY + 6; y < GY - 4; y++) { const cx = GX0 + 30 + Math.round((y - TY) * 0.55); for (let x = cx; x < cx + 42; x++) { const edge = Math.min(x - cx, cx + 42 - x) / 21; if (x > GX0 + 2 && x < GX1 - 2) set(px, x, y, 255, 255, 255, 18 * Math.min(1, edge + 0.3)); } }
    topLip(px, 70); for (let y = TY; y <= GY; y++) { set(px, GX0, y, 255, 255, 255, 36); set(px, GX1, y, 200, 214, 224, 36); } sparkle(px, GX0 + 22, TY + 18, 150); }
}

// ---------- neutral creature blob (shows scale + inside effect) ----------
function blob(px) {
  const cx = (GX0 + GX1) >> 1, cw = 78, ch = 74, feet = FY + 2;
  for (let y = 0; y < ch; y++) for (let x = -cw / 2; x < cw / 2; x++) { if ((x * x) / (cw * cw / 4) + ((y - ch) * (y - ch)) / (ch * ch) <= 1) set(px, cx + x, feet - ch + y, 70, 82, 104, 255); }
  disc(px, cx - 14, feet - 46, 8, 8, 240, 244, 250, 255); disc(px, cx + 14, feet - 46, 8, 8, 240, 244, 250, 255); // eyes
  disc(px, cx - 14, feet - 45, 3, 3, 30, 34, 44, 255); disc(px, cx + 14, feet - 45, 3, 3, 30, 34, 44, 255);
}

// ---------- compose tile: bg + blob + optional glass ----------
function tile(bg, opts) { const px = Buffer.from(bg); if (opts.blob) blob(px); if (opts.glassStyle) glass(px, opts.glassStyle); return px; }

// ---------- panels ----------
function panel(tiles, cols, label) {
  const gap = 12, rows = Math.ceil(tiles.length / cols);
  const PW = CW * cols + gap * (cols + 1), PH = CH * rows + gap * (rows + 1);
  const out = Buffer.alloc(PW * PH * 4); for (let i = 0; i < PW * PH; i++) { out[i * 4] = 14; out[i * 4 + 1] = 20; out[i * 4 + 2] = 44; out[i * 4 + 3] = 255; }
  tiles.forEach((t, i) => { const c = i % cols, r = (i / cols) | 0, ox = gap + c * (CW + gap), oy = gap + r * (CH + gap); for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) { const s = (y * CW + x) * 4, d = ((oy + y) * PW + (ox + x)) * 4; out[d] = t[s]; out[d + 1] = t[s + 1]; out[d + 2] = t[s + 2]; out[d + 3] = 255; } });
  const dir = 'C:/Users/13wie/.claude/jobs/63c8e5e6/tmp/claw';
  fs.writeFileSync(dir + '/' + label + '.png', encodePNG(PW, PH, out));
  console.log('wrote', label + '.png', PW + 'x' + PH);
}

// BACKGROUND-LAYER panel: 4 detail styles (aquatic), blob on top, NO glass
const bgStyles = [
  ['flat', 'clean'], ['caustic', 'lit water + caustics'], ['gravel', 'gravel floor'], ['deep', 'lit + depth vignette'],
];
panel(bgStyles.map(([s]) => tile(background('aquatic', s), { blob: true })), 2, 'panel_bg');

// GLASS-LAYER panel: 4 frame styles over the 'caustic' background + blob
const glassBg = background('aquatic', 'caustic');
const glassStyles = ['frameless', 'thin', 'softframe', 'bigsheen'];
panel(glassStyles.map(g => tile(glassBg, { blob: true, glassStyle: g })), 2, 'panel_glass');

// also drop tiles into web/_preview for the HTML pages
const pdir = path.join(ROOT, 'web', 'assets', '_preview');
fs.mkdirSync(pdir, { recursive: true });
bgStyles.forEach(([s], i) => fs.writeFileSync(path.join(pdir, 'bg' + (i + 1) + '.png'), encodePNG(CW, CH, tile(background('aquatic', s), { blob: true }))));
glassStyles.forEach((g, i) => fs.writeFileSync(path.join(pdir, 'gl' + (i + 1) + '.png'), encodePNG(CW, CH, tile(glassBg, { blob: true, glassStyle: g }))));
console.log('preview tiles written');

// ---------- FINAL: chosen background #1 (Clean) + glass D (Big sheen) ----------
if (process.argv.includes('--final')) {
  const OUT = path.join(ROOT, 'web', 'assets', '_bg');
  fs.mkdirSync(OUT, { recursive: true });
  const map = { aquatic: 'tank_aqua_a.png', vivarium: 'tank_viv.png', desert: 'tank_desert.png' };
  for (const [biome, name] of Object.entries(map)) {
    fs.writeFileSync(path.join(OUT, name), encodePNG(CW, CH, background(biome, 'flat')));
    console.log('final bg', name);
  }
  const g = Buffer.alloc(CW * CH * 4);       // transparent
  glass(g, 'bigsheen');
  fs.writeFileSync(path.join(OUT, 'tank_glass.png'), encodePNG(CW, CH, g));
  console.log('final tank_glass.png (bigsheen)');
}

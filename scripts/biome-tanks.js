'use strict';
// Build the tanks as TWO layers so the creature reads as being INSIDE the glass:
//   1. back layer  (tank_<biome>.png) — barren interior: back wall + flat floor.
//   2. front glass (tank_glass.png)   — a mostly-transparent pane drawn OVER the
//      creature: faint frameless edges + a soft reflection streak + a base line.
// Everything derives from the approved frameless #2 tank (t2) so the silhouette
// is byte-for-byte identical across all three biomes.

const fs = require('fs');
const path = require('path');
const { decodePNG, encodePNG } = require('./img');

const SRC = path.join(__dirname, '..', 'web', 'assets', '_tanks2', 't2.png');
const OUT = path.join(__dirname, '..', 'web', 'assets', '_bg');
const src = decodePNG(fs.readFileSync(SRC));
const W = src.W, H = src.H;

const WATER = [166, 242, 250], SAND = [250, 239, 219];
const near = (px, i, c, tol) => Math.max(Math.abs(px[i] - c[0]), Math.abs(px[i + 1] - c[1]), Math.abs(px[i + 2] - c[2])) <= tol;

// alpha-aware pixel set (a = 0..255)
function set(px, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  if (a >= 255) { px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255; return; }
  const A = px[i + 3] / 255, na = a / 255, o = na + A * (1 - na);
  if (o <= 0) return;
  px[i] = Math.round((r * na + px[i] * A * (1 - na)) / o);
  px[i + 1] = Math.round((g * na + px[i + 1] * A * (1 - na)) / o);
  px[i + 2] = Math.round((b * na + px[i + 2] * A * (1 - na)) / o);
  px[i + 3] = Math.round(o * 255);
}

// ---- detect the tank interior from t2's water + sand regions ----------------
let x0 = W, y0 = H, x1 = 0, y1 = 0, floorTop = H;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * 4;
  const isW = near(src.px, i, WATER, 60), isS = near(src.px, i, SAND, 26);
  if (isW || isS) {
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
    if (isS && y < floorTop) floorTop = y;
  }
}
console.log('interior bbox', { x0, y0, x1, y1, floorTop });

// ---- back layer: recolour interior, keep it barren --------------------------
function recolour(px, airTo, floorTo) {
  for (let i = 0; i < px.length; i += 4) {
    if (near(px, i, WATER, 55)) { px[i] = airTo[0]; px[i + 1] = airTo[1]; px[i + 2] = airTo[2]; }
    else if (near(px, i, SAND, 22)) { px[i] = floorTo[0]; px[i + 1] = floorTo[1]; px[i + 2] = floorTo[2]; }
  }
}

const rect = (px, x, y, w, h, r, g, b, a) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) set(px, xx, yy, r, g, b, a); };
const disc = (px, cx, cy, rx, ry, r, g, b, a) => { for (let yy = -ry; yy <= ry; yy++) for (let xx = -rx; xx <= rx; xx++) if ((xx * xx) / (rx * rx) + (yy * yy) / (ry * ry) <= 1) set(px, cx + xx, cy + yy, r, g, b, a); };

// soft dappled light on the floor (water caustics for aquatic, gentle sheen else)
function sheen(px, col, a) {
  for (let y = floorTop - 28; y < y1 - 2; y++) for (let x = x0 + 3; x < x1 - 3; x++) {
    const v = Math.sin(x * 0.25 + y * 0.15) + Math.sin(x * 0.11 - y * 0.2);
    if (v > 1.2) set(px, x, y, col[0], col[1], col[2], a);
  }
}

// cozy warm-wood stand + little feet under the tank (design B)
function woodBase(px) {
  const bx = x0 - 8, bw = (x1 - x0) + 16, by = y1 + 1, bh = 16;
  disc(px, (x0 + x1) >> 1, by + bh + 2, bw >> 1, 4, 20, 30, 45, 40);      // ground shadow
  rect(px, bx, by, bw, bh, 196, 150, 96, 255);                            // body
  rect(px, bx, by, bw, 3, 224, 184, 130, 255);                           // top light edge
  rect(px, bx, by + bh - 3, bw, 3, 150, 110, 64, 255);                   // bottom shade
  for (let x = bx + 4; x < bx + bw - 4; x += 9) set(px, x, by + 8, 168, 124, 78, 120); // grain
  rect(px, bx + 8, by + bh, 8, 5, 168, 124, 78, 255);                    // left foot
  rect(px, bx + bw - 16, by + bh, 8, 5, 168, 124, 78, 255);              // right foot
}

function buildBack(name, airTo, floorTo, causticCol) {
  const px = Buffer.from(src.px);
  if (airTo) recolour(px, airTo, floorTo);   // aquatic passes null → keep t2 water
  sheen(px, causticCol, name === 'tank_aqua_a.png' ? 26 : 16);
  woodBase(px);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, name), encodePNG(W, H, px));
  console.log('built', name);
}

buildBack('tank_aqua_a.png', null, null, [255, 255, 240]);                          // aquatic = t2 water + caustics
buildBack('tank_viv.png', [220, 234, 222], [78, 54, 36], [230, 238, 220]);          // humid air + dark soil
buildBack('tank_desert.png', [244, 236, 218], [230, 206, 156], [255, 246, 220]);    // warm air + tan sand

// ---- front glass pane: transparent overlay, drawn over the creature ---------
function buildGlass() {
  const px = Buffer.alloc(W * H * 4); // fully transparent
  // soft diagonal reflection streaks (classic "looking through glass")
  function streak(topX, w, a) {
    for (let y = y0 + 3; y < y1 - 2; y++) {
      const cx = topX + Math.round((y - y0) * 0.55);
      for (let x = cx; x < cx + w; x++) if (x > x0 + 1 && x < x1 - 1) set(px, x, y, 255, 255, 255, a);
    }
  }
  streak(x0 + 9, 9, 24);
  streak(x0 + 25, 4, 30);
  // faint frameless edges (thin, so it stays a "faceless" tank)
  for (let y = y0; y <= y1; y++) { set(px, x0, y, 255, 255, 255, 46); set(px, x0 + 1, y, 255, 255, 255, 22); set(px, x1, y, 200, 214, 224, 46); set(px, x1 - 1, y, 200, 214, 224, 20); }
  // bright top lip highlight
  for (let x = x0; x <= x1; x++) { set(px, x, y0, 255, 255, 255, 80); set(px, x, y0 + 1, 255, 255, 255, 40); }
  // front-glass base line where the pane meets the desk (adds containment)
  for (let x = x0; x <= x1; x++) { set(px, x, y1, 40, 60, 80, 30); set(px, x, y1 - 1, 40, 60, 80, 16); }
  fs.writeFileSync(path.join(OUT, 'tank_glass.png'), encodePNG(W, H, px));
  console.log('built tank_glass.png');
}
buildGlass();

// ---- preview: back + fake creature box + glass, per biome -------------------
function preview() {
  const glass = decodePNG(fs.readFileSync(path.join(OUT, 'tank_glass.png')));
  const biomes = ['tank_aqua_a.png', 'tank_viv.png', 'tank_desert.png'];
  const gap = 8, PW = W * 3 + gap * 2, out = Buffer.alloc(PW * H * 4).fill(20);
  for (let i = 0; i < PW * H; i++) { out[i * 4] = 12; out[i * 4 + 1] = 18; out[i * 4 + 2] = 46; out[i * 4 + 3] = 255; }
  biomes.forEach((b, bi) => {
    const back = decodePNG(fs.readFileSync(path.join(OUT, b)));
    const layer = Buffer.from(back.px);
    // fake creature: a dark rounded blob standing on the floor, to test enclosure
    const cx = (x0 + x1) >> 1, cw = 34, ch = 30, cy = floorTop;
    for (let y = 0; y < ch; y++) for (let x = -cw / 2; x < cw / 2; x++) {
      if ((x * x) / (cw * cw / 4) + ((y - ch) * (y - ch)) / (ch * ch) <= 1) set(layer, cx + x, cy - ch + y, 60, 70, 90, 255);
    }
    // composite glass over
    for (let i = 0; i < layer.length; i += 4) { const a = glass.px[i + 3]; if (a) { const p = i; const A = a / 255; layer[p] = Math.round(glass.px[p] * A + layer[p] * (1 - A)); layer[p + 1] = Math.round(glass.px[p + 1] * A + layer[p + 1] * (1 - A)); layer[p + 2] = Math.round(glass.px[p + 2] * A + layer[p + 2] * (1 - A)); } }
    const ox = bi * (W + gap);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const s = (y * W + x) * 4, d = (y * PW + (ox + x)) * 4; out[d] = layer[s]; out[d + 1] = layer[s + 1]; out[d + 2] = layer[s + 2]; out[d + 3] = 255; }
  });
  const dir = 'C:/Users/13wie/.claude/jobs/63c8e5e6/tmp/claw';
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(dir + '/layers.png', encodePNG(PW, H, out));
  console.log('preview -> layers.png');
}
preview();

'use strict';
// Build SMALL CONTAINED glass tanks: a clean simple back (see-through), a
// shallow substrate, a couple of TINY PixelLab props, and a clearly-defined
// but CLEAR glass box on a wood base. Creature goes between bg + glass.
//   background layer = desk + clean back + substrate + props + wood base
//   glass layer      = the clear glass box frame + soft sheen (over creature)

const fs = require('fs');
const path = require('path');
const { decodePNG, encodePNG, resize } = require('./img');

const ROOT = path.join(__dirname, '..');
const PROPS = path.join(ROOT, 'web', 'assets', '_props');
const OUT = path.join(ROOT, 'web', 'assets', '_bg');
const CW = 512, CH = 480;

// contained glass box geometry (leaves desk margin around it)
const IX0 = 96, IX1 = 416, ITY = 60, IBY = 344;   // interior
const SUB_Y = 286;                                  // substrate surface (creature floor)

const cl = (v) => v < 0 ? 0 : v > 255 ? 255 : v;
let seed = 99; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
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
function vgrad(px, y0, y1, cT, cB) { for (let y = y0; y < y1; y++) { const t = (y - y0) / (y1 - y0); const r = Math.round(cT[0] + (cB[0] - cT[0]) * t), g = Math.round(cT[1] + (cB[1] - cT[1]) * t), b = Math.round(cT[2] + (cB[2] - cT[2]) * t); for (let x = IX0; x < IX1; x++) set(px, x, y, r, g, b, 255); } }

const BIO = {
  aquatic:  { top: [176, 236, 250], bot: [140, 214, 236], sub: [240, 228, 196], hi: [250, 240, 216], lo: [212, 196, 162] },
  vivarium: { top: [214, 236, 214], bot: [186, 216, 192], sub: [96, 66, 44],   hi: [122, 90, 58],  lo: [70, 48, 30] },
  desert:   { top: [250, 238, 214], bot: [236, 216, 182], sub: [236, 212, 164], hi: [248, 230, 192], lo: [210, 184, 138] },
};

// trim a prop to its opaque bbox, scale to targetH, return {W,H,px}
function prop(slug, targetH) {
  const im = decodePNG(fs.readFileSync(path.join(PROPS, slug + '.png')));
  let x0 = im.W, y0 = im.H, x1 = 0, y1 = 0;
  for (let y = 0; y < im.H; y++) for (let x = 0; x < im.W; x++) if (im.px[(y * im.W + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, cpx = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const s = ((y + y0) * im.W + (x + x0)) * 4, d = (y * cw + x) * 4; cpx[d] = im.px[s]; cpx[d + 1] = im.px[s + 1]; cpx[d + 2] = im.px[s + 2]; cpx[d + 3] = im.px[s + 3]; }
  const s = targetH / ch, nw = Math.max(1, Math.round(cw * s)), nh = Math.max(1, Math.round(ch * s));
  return resize({ W: cw, H: ch, px: cpx }, nw, nh);
}
function place(px, p, cx, baseY) { const ox = cx - (p.W >> 1), oy = baseY - p.H; for (let y = 0; y < p.H; y++) for (let x = 0; x < p.W; x++) { const s = (y * p.W + x) * 4; if (p.px[s + 3] < 40) continue; set(px, ox + x, oy + y, p.px[s], p.px[s + 1], p.px[s + 2], p.px[s + 3]); } }

function woodBase(px) {
  const bx = IX0 - 16, bw = (IX1 - IX0) + 32, by = IBY + 2, bh = 30;
  disc(px, (IX0 + IX1) >> 1, by + bh + 4, bw >> 1, 8, 20, 30, 45, 40);
  rect(px, bx + 3, by, bw - 6, bh, 198, 152, 98, 255);
  rect(px, bx, by + 4, bw, bh - 8, 198, 152, 98, 255);
  rect(px, bx + 3, by, bw - 6, 5, 226, 186, 132, 255);
  rect(px, bx, by + bh - 6, bw, 6, 148, 108, 62, 255);
  for (let x = bx + 10; x < bx + bw - 10; x += 16) rect(px, x, by + 12, 2, 8, 170, 126, 80, 110);
  rect(px, bx + 18, by + bh, 16, 9, 168, 122, 76, 255);
  rect(px, bx + bw - 34, by + bh, 16, 9, 168, 122, 76, 255);
}

const LAYOUT = {
  aquatic:  [['aqua_plant', 82, IX0 + 46], ['aqua_coral', 60, IX1 - 46]],
  vivarium: [['viv_fern', 78, IX0 + 48], ['viv_rock', 50, IX1 - 44]],
  desert:   [['desert_cactus', 74, IX0 + 52], ['desert_rock', 44, IX1 - 46]],
};

function background(biome) {
  const b = BIO[biome];
  const px = Buffer.alloc(CW * CH * 4);
  for (let i = 0; i < CW * CH; i++) { px[i * 4] = 226; px[i * 4 + 1] = 236; px[i * 4 + 2] = 246; px[i * 4 + 3] = 255; } // desk
  vgrad(px, ITY, SUB_Y, b.top, b.bot);                          // clean simple back
  rect(px, IX0, SUB_Y, IX1 - IX0, IBY - SUB_Y, b.sub[0], b.sub[1], b.sub[2], 255); // substrate
  rect(px, IX0, SUB_Y, IX1 - IX0, 3, b.hi[0], b.hi[1], b.hi[2], 255);             // surface highlight
  rect(px, IX0, IBY - 6, IX1 - IX0, 6, b.lo[0], b.lo[1], b.lo[2], 130);           // depth shade
  for (let i = 0; i < 60; i++) { const x = IX0 + 4 + rnd() * (IX1 - IX0 - 8), y = SUB_Y + 4 + rnd() * (IBY - SUB_Y - 6); const d = rnd() < 0.5; set(px, x | 0, y | 0, d ? b.lo[0] : b.hi[0], d ? b.lo[1] : b.hi[1], d ? b.lo[2] : b.hi[2], 150); } // speckle
  for (const [slug, h, cx] of LAYOUT[biome]) { try { place(px, prop(slug, h), cx, SUB_Y + 2); } catch (e) { console.error('prop miss', slug, e.message); } }
  woodBase(px);
  return px;
}

// clear glass box frame + soft sheen (transparent overlay, drawn over creature)
function glass() {
  const px = Buffer.alloc(CW * CH * 4);
  // thin clear frame around the box → reads as a glass tank, stays see-through
  for (let y = ITY - 2; y <= IBY + 1; y++) {
    set(px, IX0 - 2, y, 255, 255, 255, 150); set(px, IX0 - 1, y, 235, 246, 252, 90); set(px, IX0, y, 255, 255, 255, 40);
    set(px, IX1 + 2, y, 210, 226, 238, 150); set(px, IX1 + 1, y, 225, 238, 248, 90); set(px, IX1, y, 255, 255, 255, 34);
  }
  // top rim / open lip (a touch thicker + inner shadow line)
  rect(px, IX0 - 3, ITY - 5, (IX1 - IX0) + 6, 4, 255, 255, 255, 170);
  rect(px, IX0, ITY, IX1 - IX0, 1, 120, 150, 165, 60);
  // bottom front glass edge
  rect(px, IX0 - 2, IBY, (IX1 - IX0) + 4, 2, 200, 216, 228, 130);
  // soft diagonal sheen (clear)
  for (let y = ITY + 3; y < IBY - 2; y++) { const cx = IX0 + 22 + Math.round((y - ITY) * 0.55); for (let x = cx; x < cx + 40; x++) { const e = Math.min(x - cx, cx + 40 - x) / 20; if (x > IX0 && x < IX1) set(px, x, y, 255, 255, 255, 15 * Math.min(1, e + 0.35)); } }
  // corner sparkle
  rect(px, IX0 + 16, ITY + 12, 8, 1, 255, 255, 255, 160); rect(px, IX0 + 19, ITY + 9, 1, 8, 255, 255, 255, 160);
  return px;
}

const MAP = { aquatic: 'tank_aqua_a.png', vivarium: 'tank_viv.png', desert: 'tank_desert.png' };
if (process.argv.includes('--write')) {
  for (const [b, name] of Object.entries(MAP)) { fs.writeFileSync(path.join(OUT, name), encodePNG(CW, CH, background(b))); console.log('wrote', name); }
  fs.writeFileSync(path.join(OUT, 'tank_glass.png'), encodePNG(CW, CH, glass()));
  console.log('wrote tank_glass.png');
}

// preview with real creatures inside (floor = substrate surface)
const SPR = { aquatic: ['clawde', 2.2], vivarium: ['mosskit', 1.6], desert: ['dunepup', 1.6] };
const g = glass();
function tile(biome) {
  const px = background(biome);
  const [sp, sc] = SPR[biome];
  const spr = decodePNG(fs.readFileSync(path.join(ROOT, 'web', 'assets', sp + '.png')));
  const fw = 48, dw = Math.round(fw * sc * 0.9), dh = dw, cx = CW >> 1, fy = SUB_Y + 2, ox = cx - (dw >> 1), oy = fy - dh;
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) { const sxp = (x / dw * fw) | 0, syp = (y / dh * 48) | 0, si = (syp * spr.W + sxp) * 4; if (spr.px[si + 3] < 128) continue; set(px, ox + x, oy + y, spr.px[si], spr.px[si + 1], spr.px[si + 2], 255); }
  for (let i = 0; i < px.length; i += 4) { const a = g[i + 3]; if (a) { const A = a / 255; px[i] = Math.round(g[i] * A + px[i] * (1 - A)); px[i + 1] = Math.round(g[i + 1] * A + px[i + 1] * (1 - A)); px[i + 2] = Math.round(g[i + 2] * A + px[i + 2] * (1 - A)); } }
  return px;
}
const tiles = ['aquatic', 'vivarium', 'desert'].map(tile);
const gap = 10, PW = CW * 3 + gap * 2, out = Buffer.alloc(PW * CH * 4);
for (let i = 0; i < PW * CH; i++) { out[i * 4] = 12; out[i * 4 + 1] = 18; out[i * 4 + 2] = 44; out[i * 4 + 3] = 255; }
tiles.forEach((t, i) => { const ox = i * (CW + gap); for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) { const s = (y * CW + x) * 4, d = (y * PW + (ox + x)) * 4; out[d] = t[s]; out[d + 1] = t[s + 1]; out[d + 2] = t[s + 2]; out[d + 3] = 255; } });
fs.writeFileSync('C:/Users/13wie/.claude/jobs/63c8e5e6/tmp/claw/contained.png', encodePNG(PW, CH, out));
console.log('preview contained.png');

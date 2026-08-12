'use strict';
// Composite Mosskit into each scene option (hero-style) and montage per category.
const fs = require('fs');
const path = require('path');
const { decodePNG, encodePNG, resize } = require('./img');
const ROOT = path.join(__dirname, '..');
const IN = path.join(ROOT, 'web', 'assets', '_scene_opts');
const PREV = path.join(ROOT, 'web', 'assets', '_preview');
const TMP = 'C:/Users/13wie/.claude/jobs/63c8e5e6/tmp/claw';

const TW = 320, TH = 192;
const spr = decodePNG(fs.readFileSync(path.join(ROOT, 'web', 'assets', 'mosskit.png')));
function set(px, W, x, y, r, g, b, a) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W) return; const i = (y * W + x) * 4; if (a < 255) { const A = 1 - a / 255; r = r * (a / 255) + px[i] * A; g = g * (a / 255) + px[i + 1] * A; b = b * (a / 255) + px[i + 2] * A; } px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255; }

function tile(slug) {
  const scene = decodePNG(fs.readFileSync(path.join(IN, slug + '.png')));
  // cover-fit bottom-anchored into TWxTH
  const rs = Math.max(TW / scene.W, TH / scene.H), rw = Math.round(scene.W * rs), rh = Math.round(scene.H * rs);
  const sc = resize(scene, rw, rh); const ox0 = Math.round((TW - rw) / 2), oy0 = TH - rh;
  const px = Buffer.alloc(TW * TH * 4);
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) { const sx = x - ox0, sy = y - oy0; const d = (y * TW + x) * 4; if (sx >= 0 && sy >= 0 && sx < rw && sy < rh) { const s = (sy * rw + sx) * 4; px[d] = sc.px[s]; px[d + 1] = sc.px[s + 1]; px[d + 2] = sc.px[s + 2]; px[d + 3] = 255; } else { px[d + 3] = 255; } }
  // Mosskit on the floor
  const fw = 48, s2 = 1.6 * 0.86, dw = Math.round(fw * s2), dh = dw, cx = TW >> 1, fy = Math.round(TH * 0.94), ox = cx - (dw >> 1), oy = fy - dh;
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) { const sxp = (x / dw * fw) | 0, syp = (y / dh * 48) | 0, si = (syp * spr.W + sxp) * 4; if (spr.px[si + 3] < 128) continue; set(px, TW, ox + x, oy + y, spr.px[si], spr.px[si + 1], spr.px[si + 2], 255); }
  return px;
}

function montage(slugs, name) {
  const cols = 3, rows = Math.ceil(slugs.length / cols), gap = 10;
  const PW = cols * TW + gap * (cols + 1), PH = rows * TH + gap * (rows + 1);
  const out = Buffer.alloc(PW * PH * 4); for (let i = 0; i < PW * PH; i++) { out[i * 4] = 16; out[i * 4 + 1] = 20; out[i * 4 + 2] = 40; out[i * 4 + 3] = 255; }
  slugs.forEach((sl, i) => { const t = tile(sl); fs.writeFileSync(path.join(PREV, 'sc_' + sl + '.png'), encodePNG(TW, TH, t)); const c = i % cols, r = (i / cols) | 0, ox = gap + c * (TW + gap), oy = gap + r * (TH + gap); for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) { const s = (y * TW + x) * 4, d = ((oy + y) * PW + (ox + x)) * 4; out[d] = t[s]; out[d + 1] = t[s + 1]; out[d + 2] = t[s + 2]; out[d + 3] = 255; } });
  fs.writeFileSync(TMP + '/' + name + '.png', encodePNG(PW, PH, out));
  console.log('wrote', name, PW + 'x' + PH);
}

fs.mkdirSync(PREV, { recursive: true });
montage(['cafe_1', 'cafe_2', 'cafe_3', 'cafe_4', 'cafe_5'], 'cafe_panel');
montage(['lab_1', 'lab_2', 'lab_3', 'lab_4', 'lab_5'], 'lab_panel');

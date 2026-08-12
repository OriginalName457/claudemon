'use strict';
// Device-chassis concepts — a handheld gadget that FRAMES the game (Tamagotchi /
// DIY Raspberry Pi handheld vibe). Vertical, a screen area + physical buttons.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'web', 'assets', '_devices');
const BASE = 'https://api.pixellab.ai/v2';
const key = fs.readFileSync(path.join(ROOT, '.pixellab-key'), 'utf8').trim();
const H = { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
const NEG = 'no hands, no people, no text paragraphs, blurry, no photo';
const DEVICES = [
  { slug: 'd1_tama', desc: 'a cute vertical handheld virtual pet toy, glossy off-white rounded plastic shell, a square game screen in the upper half, three round colored buttons below the screen, tiny speaker holes, a small power LED, soft friendly tamagotchi style, front view, detailed pixel art, plain light background' },
  { slug: 'd2_pi', desc: 'a handmade vertical handheld game gadget built from a raspberry pi, cream 3D printed case, a bright square LCD screen in the upper middle, small tactile push buttons in a row, four tiny screws in the corners, a red power LED, a little printed label, DIY maker aesthetic, front view, detailed pixel art, plain light background' },
  { slug: 'd3_gameboy', desc: 'a chunky retro handheld game console, cream and warm orange plastic, a screen with a dark bezel in the top half, a black d-pad on the left and two round orange buttons on the right, a diagonal speaker grille, 1980s vibe, front view, detailed pixel art, plain light background' },
  { slug: 'd4_pihat', desc: 'a raspberry pi HAT circuit board gadget standing vertically, green printed circuit board, a small bright color screen near the top, three little round buttons down one side, gold GPIO header pins along the edge, tiny black chips and colorful resistors and capacitors, on a clean white desk, front view, detailed pixel art' },
  { slug: 'd5_wood', desc: 'a cozy handmade vertical handheld pet device, warm light wood case with brass corner brackets and little brass buttons, a glowing screen framed in wood, a small round brass speaker grille, warm steampunk maker charm, front view, detailed pixel art, plain light background' },
  { slug: 'd6_modern', desc: 'a sleek modern vertical handheld device, clean matte white rounded body, a large rounded rectangular screen, two soft orange pill buttons at the bottom, minimalist, subtle corner screws, a thin status LED, front view, detailed pixel art, plain light background' },
];
async function pixflux(desc) {
  const r = await fetch(BASE + '/create-image-pixflux', { method: 'POST', headers: H, body: JSON.stringify({ description: desc, negative_description: NEG, image_size: { width: 168, height: 232 }, no_background: false, text_guidance_scale: 7.5 }) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 160)}`);
  const b = j.image && j.image.base64; if (!b) throw new Error('no image');
  return Buffer.from(b.includes(',') ? b.split(',')[1] : b, 'base64');
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const dv of DEVICES) { try { process.stderr.write(`[${dv.slug}] `); fs.writeFileSync(path.join(OUT, dv.slug + '.png'), await pixflux(dv.desc)); console.error('ok'); } catch (e) { console.error('ERR', e.message); } }
  console.log('done');
})();

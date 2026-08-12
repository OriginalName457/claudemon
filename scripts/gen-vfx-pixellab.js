'use strict';
// Generate PixelLab versions of the attack VFX (pixflux, static) so we can compare
// their look against the procedural set. -> scratchpad/vfx-pixellab/<id>.png
const fs = require('fs');
const path = require('path');
const { decodePNG, encodePNG, floodKeyEdges } = require('./img');
const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || 'C:/Users/13wie/AppData/Local/Temp/claude/C--Users-13wie/63c8e5e6-8b4b-4c4e-8986-d2f0d612788a/scratchpad/vfx-pixellab';
const only = process.argv.slice(3);
const BASE = 'https://api.pixellab.ai/v2';
const key = fs.readFileSync(path.join(ROOT, '.pixellab-key'), 'utf8').trim();
const H = { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };

const STYLE = ', pixel art game visual effect, bold vibrant glowing colors, clean chunky pixels, dynamic motion, centered';
const NEG = 'no character, no creature, no animal, no background, no ground, no text, no words, no border, no frame, not realistic, no blur, no photo';

const VFX = [
  { id: 'slash',  desc: 'three sharp diagonal claw slash marks, a white and red energy swipe' },
  { id: 'bite',   desc: 'a set of sharp white fangs biting down, a chomp effect' },
  { id: 'bash',   desc: 'a bright impact burst star, a yellow and white POW hit flash with a shockwave' },
  { id: 'orb',    desc: 'a glowing round blue energy orb projectile with a light trail' },
  { id: 'spike',  desc: 'a sharp glowing energy shard projectile streaking sideways' },
  { id: 'shock',  desc: 'a jagged bright blue electric lightning bolt' },
  { id: 'poison', desc: 'a bubbling green toxic poison cloud with drips and bubbles' },
  { id: 'ember',  desc: 'a burst of orange and yellow fire flames with rising embers' },
  { id: 'splash', desc: 'a splash of blue water droplets spraying outward' },
  { id: 'dodge',  desc: 'white speed dash motion lines, an afterimage streak effect' },
  { id: 'guard',  desc: 'a glowing cyan hexagonal shield barrier bubble' },
  { id: 'heal',   desc: 'rising green and gold healing sparkles and plus symbols' },
];

async function pixflux(desc) {
  const r = await fetch(BASE + '/create-image-pixflux', {
    method: 'POST', headers: H,
    body: JSON.stringify({ description: desc + STYLE, negative_description: NEG, image_size: { width: 64, height: 64 }, no_background: true, text_guidance_scale: 8 }),
  });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 160)}`);
  const b = j.image && j.image.base64; if (!b) throw new Error('no image');
  return Buffer.from(b.includes(',') ? b.split(',')[1] : b, 'base64');
}
function clean(buf) { const im = decodePNG(buf); floodKeyEdges(im, 40); return encodePNG(im.W, im.H, im.px); }

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const v of VFX) {
    if (only.length && !only.includes(v.id)) continue;
    try { process.stderr.write(`[${v.id}] `); fs.writeFileSync(path.join(OUT, v.id + '.png'), clean(await pixflux(v.desc))); console.error('ok'); }
    catch (e) { console.error('ERR', e.message); }
  }
  fs.writeFileSync(path.join(OUT, 'vfx.json'), JSON.stringify(VFX.map(v => v.id), null, 2));
  try { const bal = await (await fetch(BASE + '/balance', { headers: H })).json(); console.log('left:', bal.subscription.generations); } catch {}
})();

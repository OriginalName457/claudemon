'use strict';
// Thornmaw redesign round 2: a bigger TREE creature (not a little potted sprout),
// same clean friendly Gen-1 scheme, cleaned edges. -> scratchpad/redesign2/
const fs = require('fs');
const path = require('path');
const { decodePNG, encodePNG, floodKeyEdges } = require('./img');
const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || 'C:/Users/13wie/AppData/Local/Temp/claude/C--Users-13wie/63c8e5e6-8b4b-4c4e-8986-d2f0d612788a/scratchpad/redesign2';
const BASE = 'https://api.pixellab.ai/v2';
const key = fs.readFileSync(path.join(ROOT, '.pixellab-key'), 'utf8').trim();
const H = { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };

const STYLE = ', a single cute creature, clean minimalist Gen 1 Pokemon starter style, flat solid colors, bold clean rounded dark outline, big cute shiny eyes, a little cheeky, crisp clean pixel edges, centered, side view';
const NEG = 'no background, no shadow, no drop shadow, no ground shadow, no reflection, no text, no words, no border, no frame, no humans, no hands, no weapons, no UI, no blur, not realistic, no gore, no extra pixels, no pot, no flowerpot';

const VARIANTS = [
  { slug: 'thornmaw-A', label: 'Thornmaw · walking tree', desc: 'a cute chunky little tree creature, a stout brown trunk body with a big toothy hollow mouth and soft white fangs, a round leafy green canopy on top, two little root feet, big cute eyes, cheeky' },
  { slug: 'thornmaw-B', label: 'Thornmaw · gnarled bark face', desc: 'a cute sturdy tree monster, gnarled bark body with a friendly grinning bark face, a bushy round green treetop, two knothole eyes, little branch arms, chunky root feet' },
  { slug: 'thornmaw-C', label: 'Thornmaw · fanged canopy', desc: 'a cute round tree creature, a plump wide green leafy canopy over a short thick trunk, a wide toothy mouth split across the trunk with soft fangs, big shiny eyes, tiny root toes' },
  { slug: 'thornmaw-D', label: 'Thornmaw · ancient sprout-tree', desc: 'a cute tall young tree creature, slim brown trunk with a curling vine on each side like arms, a big leafy crown with a couple of red berries, an open toothy smile in the trunk, big cute eyes' },
];

async function pixflux(desc) {
  const r = await fetch(BASE + '/create-image-pixflux', { method: 'POST', headers: H,
    body: JSON.stringify({ description: desc + STYLE, negative_description: NEG, image_size: { width: 64, height: 64 }, no_background: true, text_guidance_scale: 8 }) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 160)}`);
  const b = j.image && j.image.base64; if (!b) throw new Error('no image');
  return Buffer.from(b.includes(',') ? b.split(',')[1] : b, 'base64');
}
function clean(buf) { const im = decodePNG(buf); floodKeyEdges(im, 44); return encodePNG(im.W, im.H, im.px); }

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const v of VARIANTS) {
    try { process.stderr.write(`[${v.slug}] `); fs.writeFileSync(path.join(OUT, v.slug + '.png'), clean(await pixflux(v.desc))); console.error('ok'); }
    catch (e) { console.error('ERR', e.message); }
  }
  fs.writeFileSync(path.join(OUT, 'variants.json'), JSON.stringify(VARIANTS, null, 2));
  try { const bal = await (await fetch(BASE + '/balance', { headers: H })).json(); console.log('left:', bal.subscription.generations); } catch {}
})();

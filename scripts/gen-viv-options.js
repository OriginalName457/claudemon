'use strict';
// Generate 6 VIVARIUM background options (full biome scenes) to choose the
// standard vibe. Each is a nice environment a little creature would live in,
// with a flat ground floor at the bottom to stand on.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'web', 'assets', '_viv_opts');
const BASE = 'https://api.pixellab.ai/v2';
const key = fs.readFileSync(path.join(ROOT, '.pixellab-key'), 'utf8').trim();
const H = { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };

const NEG = 'no animals, no creatures, no people, no glass, no aquarium, no frame, no border, no text, no words, no UI';
const SUF = ', terrarium biome scene filling the whole frame, a flat mossy ground at the bottom to stand on, cozy inviting and cute, soft depth, detailed pixel art';
const OPTS = [
  { slug: 'o1_forest',   desc: 'a lush green forest floor with tall trees, ferns and moss-covered rocks, soft dappled sunlight' },
  { slug: 'o2_grotto',   desc: 'a fern grotto with a small calm pond and smooth wet stones, humid soft green light and gentle mist' },
  { slug: 'o3_meadow',   desc: 'a sunny grassy meadow clearing with tiny wildflowers and soft rolling hills, warm bright daylight' },
  { slug: 'o4_jungle',   desc: 'a tropical jungle with big broad leaves, hanging vines and deep lush greens, warm humid light' },
  { slug: 'o5_mossden',  desc: 'a cozy mossy stone den, rounded moss-covered boulders and a soft cool cave light' },
  { slug: 'o6_mushroom', desc: 'an enchanted woodland floor with glowing mushrooms, moss and ferns, soft magical dusk light' },
];

async function pixflux(desc) {
  const r = await fetch(BASE + '/create-image-pixflux', {
    method: 'POST', headers: H,
    body: JSON.stringify({ description: desc + SUF, negative_description: NEG, image_size: { width: 200, height: 160 }, no_background: false, text_guidance_scale: 8 }),
  });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 160)}`);
  const b = j.image && j.image.base64; if (!b) throw new Error('no image');
  return Buffer.from(b.includes(',') ? b.split(',')[1] : b, 'base64');
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const only = process.argv[2];
  for (const o of OPTS) {
    if (only && o.slug !== only) continue;
    try { process.stderr.write(`[${o.slug}] `); fs.writeFileSync(path.join(OUT, o.slug + '.png'), await pixflux(o.desc)); console.error('ok'); }
    catch (e) { console.error('ERR', e.message); }
  }
  console.log('done');
})();

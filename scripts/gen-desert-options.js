'use strict';
// Generate 6 DESERT background options (full biome scenes) in the same cozy,
// detailed vibe as the vivarium set. Always includes a sand floor to stand on.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'web', 'assets', '_desert_opts');
const BASE = 'https://api.pixellab.ai/v2';
const key = fs.readFileSync(path.join(ROOT, '.pixellab-key'), 'utf8').trim();
const H = { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };

const NEG = 'no animals, no creatures, no people, no glass, no aquarium, no frame, no border, no text, no words, no UI';
const SUF = ', desert biome scene filling the whole frame, a flat warm sand floor across the bottom to stand on, cozy inviting and cute, soft depth, detailed pixel art';
const OPTS = [
  { slug: 'o1_dunes',   desc: 'warm golden sand dunes with a single small round cactus and tiny pebbles, soft blue sky, gentle sun' },
  { slug: 'o2_oasis',   desc: 'a small desert oasis with a calm blue water pool, a palm tree and a patch of green grass on warm sand' },
  { slug: 'o3_canyon',  desc: 'a red rock canyon with tall mesa walls and layered stone, warm sand floor, a couple of small cacti' },
  { slug: 'o4_garden',  desc: 'a cute cactus garden with several small round cacti, succulents and flowering blooms on sandy ground' },
  { slug: 'o5_night',   desc: 'a calm night desert under a deep starry purple sky, a glowing crescent moon, a saguaro cactus silhouette on cool sand' },
  { slug: 'o6_sunset',  desc: 'a warm desert at golden-hour sunset, orange and pink sky, rocky boulders and a small cactus on glowing sand' },
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

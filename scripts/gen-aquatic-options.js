'use strict';
// Generate 6 AQUATIC/OCEAN background options in the same cozy detailed vibe.
// EVERY one has a clear sand floor across the bottom for the creature to stand on.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'web', 'assets', '_aqua_opts');
const BASE = 'https://api.pixellab.ai/v2';
const key = fs.readFileSync(path.join(ROOT, '.pixellab-key'), 'utf8').trim();
const H = { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };

const NEG = 'no fish, no animals, no creatures, no people, no glass, no aquarium tank, no frame, no border, no text, no words, no UI';
const SUF = ', underwater ocean biome scene filling the whole frame, a clean pale sand floor across the bottom to stand on, soft god-ray light beams from above, cozy inviting and cute, soft depth, detailed pixel art';
const OPTS = [
  { slug: 'o1_reef',    desc: 'a colorful coral reef with pink and orange corals and green sea plants rising from the sand, calm clear blue water' },
  { slug: 'o2_kelp',    desc: 'a tall green kelp forest swaying above the sandy sea floor, calm deep-blue water' },
  { slug: 'o3_lagoon',  desc: 'a bright tropical turquoise lagoon, clean pale sand floor, a few small aquatic plants and pebbles, sunlit shallows' },
  { slug: 'o4_deep',    desc: 'a calm deep-blue ocean with a few smooth rocks and small plants on the sandy floor, drifting bubbles' },
  { slug: 'o5_glow',    desc: 'a magical bioluminescent underwater scene, softly glowing blue and teal corals and plants on dark sand, gentle glow' },
  { slug: 'o6_sunny',   desc: 'a warm shallow reef with golden sunlight streaming through clear blue water, coral and green plants on bright sand' },
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

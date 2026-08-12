'use strict';
// Options for the Lounge (coffee-shop vibes) and Lab (more fun/playful).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'web', 'assets', '_scene_opts');
const BASE = 'https://api.pixellab.ai/v2';
const key = fs.readFileSync(path.join(ROOT, '.pixellab-key'), 'utf8').trim();
const H = { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
const NEG = 'no characters, no creatures, no animals, no people, no text, no words, no UI, no frame, no border';
const SUF = ', a clear empty floor across the foreground to stand on, cozy and cute, detailed pixel art';
const OPTS = [
  // coffee-shop options for the lounge
  { slug: 'cafe_1', desc: 'a cozy pixel art coffee shop interior, a wooden counter with a shiny espresso machine, a chalkboard menu, warm hanging pendant lights, small round tables and plants' + SUF },
  { slug: 'cafe_2', desc: 'a bright modern pixel art cafe, clean minimalist counter, big sunny windows, pastel mint and cream tones, potted plants, cute pastries in a glass case' + SUF },
  { slug: 'cafe_3', desc: 'a cozy pixel art book cafe, tall warm wooden bookshelves, soft lamps, comfy armchairs, a small coffee counter, brown and amber tones' + SUF },
  { slug: 'cafe_4', desc: 'a lush pixel art plant-filled cafe, hanging vines and many potted plants, a rustic wooden coffee bar, warm greenhouse daylight' + SUF },
  { slug: 'cafe_5', desc: 'a retro pixel art coffee diner bar, checkerboard floor, a glowing neon coffee sign, bar stools, a chrome espresso machine, cozy nostalgic warm light' + SUF },
  // more-fun lab options
  { slug: 'lab_1', desc: 'a colorful whimsical pixel art mad-science laboratory, bubbling beakers of pink green and purple potion, coiled glass tubes, a sparking tesla coil, bright and playful' + SUF },
  { slug: 'lab_2', desc: 'a fun pixel art inventor workshop, quirky gadgets and gizmos, spinning gears, a friendly little robot arm, colorful blueprints on the wall, warm and playful' + SUF },
  { slug: 'lab_3', desc: 'a fun pixel art neon laboratory, glowing arcade screens, colorful buttons and levers, bubbling colorful liquid tubes, vibrant magenta and cyan lights' + SUF },
  { slug: 'lab_4', desc: 'a cozy pixel art alchemy lab, shelves full of colorful glowing potion bottles, a bubbling cauldron, floating magical sparkles, warm whimsical candlelight' + SUF },
  { slug: 'lab_5', desc: 'a fun pixel art space-station laboratory, a big round window with planets and stars, colorful holographic screens, floating gadgets, playful bright sci-fi' + SUF },
];
async function pixflux(desc) {
  const r = await fetch(BASE + '/create-image-pixflux', { method: 'POST', headers: H, body: JSON.stringify({ description: desc, negative_description: NEG, image_size: { width: 240, height: 144 }, no_background: false, text_guidance_scale: 8 }) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 160)}`);
  const b = j.image && j.image.base64; if (!b) throw new Error('no image');
  return Buffer.from(b.includes(',') ? b.split(',')[1] : b, 'base64');
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const only = process.argv[2];
  for (const o of OPTS) { if (only && !o.slug.startsWith(only)) continue; try { process.stderr.write(`[${o.slug}] `); fs.writeFileSync(path.join(OUT, o.slug + '.png'), await pixflux(o.desc)); console.error('ok'); } catch (e) { console.error('ERR', e.message); } }
  console.log('done');
})();

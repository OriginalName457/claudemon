'use strict';
// Generate SMALL tank props (no background) via PixelLab pixflux. These are
// tiny foliage/rocks we place into a clean, clearly-defined clear glass tank —
// so it reads as a small contained desk biome, not a huge landscape.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'web', 'assets', '_props');
const BASE = 'https://api.pixellab.ai/v2';
const key = fs.readFileSync(path.join(ROOT, '.pixellab-key'), 'utf8').trim();
const H = { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };

const NEG = 'no tank, no aquarium, no glass, no container, no pot, no ground line, no floor, no text, no words, no border';
const PROPS = [
  { slug: 'aqua_plant',    desc: 'a small clump of green aquatic seaweed, a few thin tall blades, cute simple pixel art, single object centered' },
  { slug: 'aqua_coral',    desc: 'a small pink and coral branch, a couple of rounded arms, cute simple pixel art, single object centered' },
  { slug: 'viv_fern',      desc: 'a small leafy green fern, a few soft fronds, cute simple pixel art, single object centered' },
  { slug: 'viv_rock',      desc: 'a small round grey boulder with a patch of green moss on top, cute simple pixel art, single object centered' },
  { slug: 'desert_cactus', desc: 'a small round green barrel cactus with tiny pale spikes and one flower, cute simple pixel art, single object centered' },
  { slug: 'desert_rock',   desc: 'a small warm tan sandstone rock, cute simple pixel art, single object centered' },
];

async function pixflux(desc) {
  const r = await fetch(BASE + '/create-image-pixflux', {
    method: 'POST', headers: H,
    body: JSON.stringify({ description: desc, negative_description: NEG, image_size: { width: 96, height: 96 }, no_background: true, text_guidance_scale: 9 }),
  });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 180)}`);
  const b = j.image && j.image.base64; if (!b) throw new Error('no image');
  return Buffer.from(b.includes(',') ? b.split(',')[1] : b, 'base64');
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const only = process.argv[2];
  for (const p of PROPS) {
    if (only && p.slug !== only) continue;
    try { process.stderr.write(`[${p.slug}] `); fs.writeFileSync(path.join(OUT, p.slug + '.png'), await pixflux(p.desc)); console.error('ok'); }
    catch (e) { console.error('ERR', e.message); }
  }
  console.log('done');
})();

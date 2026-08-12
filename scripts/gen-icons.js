'use strict';
// Generate small pixel-art icons for the action buttons (feed/water/pet/play/rest).

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'web', 'assets', '_icons');
const BASE = 'https://api.pixellab.ai/v2';
const key = fs.readFileSync(path.join(ROOT, '.pixellab-key'), 'utf8').trim();
const H = { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };

const NEG = 'no background, no frame, no border, no text, no words, no letters, single object';
const ICONS = [
  { slug: 'feed',  desc: 'a cute bowl filled with brown food kibble, simple bold pixel art icon, centered' },
  { slug: 'water', desc: 'a single bright blue water droplet, simple bold pixel art icon, centered' },
  { slug: 'pet',   desc: 'a soft pink heart with a tiny white sparkle, simple bold pixel art icon, centered' },
  { slug: 'play',  desc: 'a colorful red and white bouncy ball, simple bold pixel art icon, centered' },
  { slug: 'rest',  desc: 'a pale yellow crescent moon with a small star, simple bold pixel art icon, centered' },
];

async function pixflux(desc) {
  const r = await fetch(BASE + '/create-image-pixflux', {
    method: 'POST', headers: H,
    body: JSON.stringify({ description: desc, negative_description: NEG, image_size: { width: 48, height: 48 }, no_background: true, text_guidance_scale: 9 }),
  });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 160)}`);
  const b = j.image && j.image.base64; if (!b) throw new Error('no image');
  return Buffer.from(b.includes(',') ? b.split(',')[1] : b, 'base64');
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const ic of ICONS) {
    try { process.stderr.write(`[${ic.slug}] `); fs.writeFileSync(path.join(OUT, ic.slug + '.png'), await pixflux(ic.desc)); console.error('ok'); }
    catch (e) { console.error('ERR', e.message); }
  }
  console.log('done');
})();

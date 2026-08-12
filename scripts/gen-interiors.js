'use strict';
// Generate rich BIOME INTERIOR scenes via PixelLab pixflux (its strength).
// NO tank / NO glass / NO frame — just the interior scene filling the frame.
// We composite these into our consistent 512x480 vessel + add our own clear
// glass overlay + wood base. That sidesteps PixelLab's tank-shape drift.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'web', 'assets', '_interiors');
const BASE = 'https://api.pixellab.ai/v2';
const key = fs.readFileSync(path.join(ROOT, '.pixellab-key'), 'utf8').trim();
const H = { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };

const NEG = 'no fish, no animals, no creatures, no glass, no aquarium tank, no frame, no border, no text, no words';
const SCENES = [
  { slug: 'aquatic', desc: 'underwater aquarium scene filling the whole frame, clean pale sand bottom with a few small pebbles, two small green aquatic plants swaying, calm light-blue water with soft god-ray light beams from above, cozy and cute, minimal detailed pixel art' },
  { slug: 'vivarium', desc: 'terrarium interior scene filling the whole frame, dark brown soil floor, one small leafy green plant and a mossy grey rock, humid soft green air, gentle light from above, cozy and cute, minimal detailed pixel art' },
  { slug: 'desert', desc: 'desert terrarium interior filling the whole frame, warm tan sand with gentle dunes and tiny pebbles, one small round green cactus, dry sunny warm air, soft light from above, cozy and cute, minimal detailed pixel art' },
];

async function pixflux(desc) {
  const r = await fetch(BASE + '/create-image-pixflux', {
    method: 'POST', headers: H,
    body: JSON.stringify({ description: desc, negative_description: NEG, image_size: { width: 200, height: 160 }, no_background: false, text_guidance_scale: 8 }),
  });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 200)}`);
  const b = j.image && j.image.base64; if (!b) throw new Error('no image: ' + JSON.stringify(j).slice(0, 150));
  return Buffer.from(b.includes(',') ? b.split(',')[1] : b, 'base64');
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const only = process.argv[2]; // optional single slug to re-roll
  for (const s of SCENES) {
    if (only && s.slug !== only) continue;
    try {
      process.stderr.write(`[${s.slug}] pixflux... `);
      const png = await pixflux(s.desc);
      fs.writeFileSync(path.join(OUT, s.slug + '.png'), png);
      console.error('ok');
    } catch (e) { console.error('ERROR', e.message); }
  }
  console.log('done');
})();

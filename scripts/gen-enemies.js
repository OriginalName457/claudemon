'use strict';
// Generate ENEMY creatures for the roguelite in the ORIGINAL friendly-creature scheme:
// clean minimalist Gen-1 look, flat solid colors, bold clean outline, big cute eyes,
// explicitly NO shadow. Auto-cleans stray border/shadow pixels after generation.
//   node scripts/gen-enemies.js            (all)
//   node scripts/gen-enemies.js thornmaw   (one)

const fs = require('fs');
const path = require('path');
const { decodePNG, encodePNG, floodKeyEdges } = require('./img');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'web', 'assets', '_enemies');
const BASE = 'https://api.pixellab.ai/v2';
const key = fs.readFileSync(path.join(ROOT, '.pixellab-key'), 'utf8').trim();
const H = { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };

const STYLE = ', a single small cute creature, clean minimalist Gen 1 Pokemon starter style, flat solid colors, bold clean rounded dark outline, big cute shiny eyes, a little cheeky, crisp clean pixel edges, centered, side view';
const NEG = 'no background, no shadow, no drop shadow, no ground shadow, no reflection, no text, no words, no border, no frame, no humans, no hands, no weapons, no UI, no blur, not realistic, no gore, no extra pixels';

const ENEMIES = [
  // aquatic
  { slug: 'brinemaw', biome: 'aquatic', desc: 'a cute round baby anglerfish, soft teal body, a tiny glowing bulb lure bobbing over its head on a little stalk, big eyes, a small cheeky fanged grin' },
  { slug: 'spineurchin', biome: 'aquatic', desc: 'a cute round sea urchin, soft purple body fully covered in short rounded spikes, one big shiny cute eye, cheeky' },
  // vivarium
  { slug: 'thornmaw', biome: 'vivarium', desc: 'a cute little venus flytrap creature, a small green pot base, a big open mouth with soft white fangs and a pink inside, two little leaf arms, cheeky grin' },
  // desert
  { slug: 'huskcrawler', biome: 'desert', desc: 'a cute round little beetle, glossy warm-brown domed shell, big shiny eyes, six tiny stubby legs, a little grumpy' },
  { slug: 'dustwraith', biome: 'desert', desc: 'a cute little sand ghost, soft round tan body with a wispy wavy bottom, two big cute dark eyes, floating, shy' },
];

async function pixflux(desc) {
  const r = await fetch(BASE + '/create-image-pixflux', {
    method: 'POST', headers: H,
    body: JSON.stringify({ description: desc + STYLE, negative_description: NEG, image_size: { width: 64, height: 64 }, no_background: true, text_guidance_scale: 8 }),
  });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 160)}`);
  const b = j.image && j.image.base64; if (!b) throw new Error('no image in response');
  return Buffer.from(b.includes(',') ? b.split(',')[1] : b, 'base64');
}

// clean edges: flood-remove any stray background/shadow pixels from the border inward
function clean(pngBuf) { const im = decodePNG(pngBuf); floodKeyEdges(im, 44); return encodePNG(im.W, im.H, im.px); }

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const only = process.argv[2];
  for (const e of ENEMIES) {
    if (only && e.slug !== only) continue;
    try {
      process.stderr.write(`[${e.slug} · ${e.biome}] `);
      fs.writeFileSync(path.join(OUT, e.slug + '.png'), clean(await pixflux(e.desc)));
      console.error('ok (cleaned)');
    } catch (err) { console.error('ERR', err.message); }
  }
  try { const bal = await (await fetch(BASE + '/balance', { headers: H })).json(); console.log('generations left:', bal.subscription.generations); } catch {}
})();

'use strict';
// New REGULAR enemies ("mobs") matched to the 48px roster structure (Gloop/Cactuskid),
// NOT the big-eyed 64px boss look. Cel-shaded chunky chibi, cute-but-cranky.
// Output -> scratchpad/mobs/ (non-destructive, for review).
const fs = require('fs');
const path = require('path');
const { decodePNG, encodePNG, floodKeyEdges } = require('./img');
const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || 'C:/Users/13wie/AppData/Local/Temp/claude/C--Users-13wie/63c8e5e6-8b4b-4c4e-8986-d2f0d612788a/scratchpad/mobs2';
const BASE = 'https://api.pixellab.ai/v2';
const key = fs.readFileSync(path.join(ROOT, '.pixellab-key'), 'utf8').trim();
const H = { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };

// CUTE like the roster (Gloop/Cactuskid are enemies but adorable). No cranky/evil language.
const STYLE = ', a cute chunky chibi creature, clean pixel art, rounded soft body, big round friendly sparkly eyes, soft rosy cheeks, a gentle happy little smile, thick soft dark-brown outline, gentle cel shading with two or three tones per color, warm muted natural palette, wholesome and adorable, side view, centered';
const NEG = 'no background, no shadow, no drop shadow, no ground shadow, no reflection, no text, no words, no border, no frame, no angry face, no scary, no evil, no menacing, no sharp fangs, no frown, no humans, no hands, no weapons, no UI, no blur, not realistic, no gore, no extra pixels';

const MOBS = [
  { slug: 'puffergrudge', biome: 'aquatic',  desc: 'a cute round pufferfish, soft olive-tan body dotted with small blunt rounded bumps, a tiny happy smile, big round sparkly eyes, two little side fins' },
  { slug: 'chompclam',    biome: 'aquatic',  desc: 'a cute little clam creature, a rounded blue-grey ridged shell open in a friendly smile, two big round sparkly eyes peeking over the rim, a tiny pale foot' },
  { slug: 'gnarlnut',     biome: 'vivarium', desc: 'a cute little acorn creature, a glossy warm-brown nut body with a soft textured cap on top, a tiny happy smile, big round sparkly eyes, two little stubby legs' },
  { slug: 'thorngrub',    biome: 'vivarium', desc: 'a cute chubby caterpillar, a soft green segmented body with a few tiny rounded nubs along its back, big round sparkly eyes, a little smile, tiny legs' },
  { slug: 'grumblestone', biome: 'desert',   desc: 'a cute round pebble creature, a rounded warm-grey stone body with a couple of soft cracks, big round sparkly eyes, a tiny smile, two little stubby stone feet' },
  { slug: 'emberling',    biome: 'desert',   desc: 'a cute little ember creature, a rounded soft-charcoal body with warm-orange glowing spots, big round sparkly eyes, a tiny happy smile, tiny stubby arms' },
  // redesigns of the two big-eye ones, brought into the roster style:
  { slug: 'brinemaw',     biome: 'aquatic',  desc: 'a cute little anglerfish, a round teal body, a small round glowing lure on a short stalk over its head, a tiny happy smile, big round sparkly eyes, two little side fins' },
  { slug: 'spineurchin',  biome: 'aquatic',  desc: 'a cute round sea urchin, a soft deep-purple round body covered in short rounded soft spikes, two big round sparkly eyes, a tiny smile, tiny stubby feet' },
];

async function pixflux(desc) {
  const r = await fetch(BASE + '/create-image-pixflux', { method: 'POST', headers: H,
    body: JSON.stringify({ description: desc + STYLE, negative_description: NEG, image_size: { width: 48, height: 48 }, no_background: true, text_guidance_scale: 8 }) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 160)}`);
  const b = j.image && j.image.base64; if (!b) throw new Error('no image');
  return Buffer.from(b.includes(',') ? b.split(',')[1] : b, 'base64');
}
function clean(buf) { const im = decodePNG(buf); floodKeyEdges(im, 44); return encodePNG(im.W, im.H, im.px); }

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const only = process.argv[3];
  for (const m of MOBS) {
    if (only && m.slug !== only) continue;
    try { process.stderr.write(`[${m.slug} · ${m.biome}] `); fs.writeFileSync(path.join(OUT, m.slug + '.png'), clean(await pixflux(m.desc))); console.error('ok'); }
    catch (e) { console.error('ERR', e.message); }
  }
  fs.writeFileSync(path.join(OUT, 'mobs.json'), JSON.stringify(MOBS, null, 2));
  try { const bal = await (await fetch(BASE + '/balance', { headers: H })).json(); console.log('left:', bal.subscription.generations); } catch {}
})();

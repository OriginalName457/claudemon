'use strict';
// Style-matched mob generation via PixelLab /create-image-bitforge, using a REAL
// Claudemon sprite (frame 0) as the style_image so new enemies inherit the exact
// roster linework/shading. Concepts have distinct silhouettes + limbs (not blobs).
//   node scripts/gen-mobs-styled.js <anchorId> <outDir> [slug ...]
const fs = require('fs');
const path = require('path');
const { decodePNG, encodePNG, floodKeyEdges } = require('./img');
const species = require('../src/species');

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'web', 'assets');
const BASE = 'https://api.pixellab.ai/v2';
const key = fs.readFileSync(path.join(ROOT, '.pixellab-key'), 'utf8').trim();
const H = { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };

const anchorId = process.argv[2] || 'fernling';
const OUT = process.argv[3] || 'C:/Users/13wie/AppData/Local/Temp/claude/C--Users-13wie/63c8e5e6-8b4b-4c4e-8986-d2f0d612788a/scratchpad/mobs3';
const only = process.argv.slice(4);

const STYLE = ', cute chibi creature, distinct clear silhouette, expressive, side view, centered, wholesome and adorable, gentle happy expression';
const NEG = 'no background, no shadow, no drop shadow, no reflection, no text, no words, no border, no angry face, no scary, no evil, no menacing, no humans, no hands, no weapons, no UI, no blur, not realistic, no gore, no extra pixels';

// distinct silhouettes + real structure, no roster-animal overlaps (crab/octopus/snail/butterfly/lizard/puppy/scorpion)
const MOBS = [
  { slug: 'gulpeel',    biome: 'aquatic',  desc: 'a cute pale-blue ribbon eel with a long curvy S-shaped body and a small round sucker mouth, two little side frills, big sparkly eyes' },
  { slug: 'barbfin',    biome: 'aquatic',  desc: 'a cute little lionfish with fanned striped orange-and-cream spiny fins spread out around it, a small round body, big sparkly eyes' },
  { slug: 'capshroom',  biome: 'vivarium', desc: 'a cute mushroom sprite, a round red-and-white spotted cap over a small cream stalk body, two little leaf arms and two stubby legs, big sparkly eyes' },
  { slug: 'mantleaf',   biome: 'vivarium', desc: 'a cute little leaf mantis, a slender green body shaped like a leaf, two folded praying arms, two antennae, standing on two legs, big sparkly eyes' },
  { slug: 'dustjerbo',  biome: 'desert',   desc: 'a cute desert jerboa, a small sandy-tan rodent with big round hind legs, tiny front paws, huge ears, and a long tufted tail, big sparkly eyes' },
  { slug: 'scarabroll', biome: 'desert',   desc: 'a cute little scarab beetle with a glossy teal-green domed shell and six little legs, pushing a small round sand ball, big sparkly eyes' },
];

function frame0DataURI(id) {
  const sp = species.get(id);
  const im = decodePNG(fs.readFileSync(path.join(ASSETS, sp.sprite.sheet)));
  const fw = sp.sprite.frameW || im.H;
  const out = Buffer.alloc(fw * im.H * 4);
  for (let y = 0; y < im.H; y++) for (let x = 0; x < fw; x++) { const s = (y * im.W + x) * 4, d = (y * fw + x) * 4; for (let k = 0; k < 4; k++) out[d + k] = im.px[s + k]; }
  return { b64: encodePNG(fw, im.H, out).toString('base64'), w: fw, h: im.H };
}

async function bitforge(desc, style) {
  const r = await fetch(BASE + '/create-image-bitforge', {
    method: 'POST', headers: H,
    body: JSON.stringify({
      description: desc + STYLE,
      negative_description: NEG,
      image_size: { width: 48, height: 48 },
      style_image: { type: 'base64', base64: style.b64 },
      no_background: true,
    }),
  });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 200)}`);
  const b = j.image && j.image.base64; if (!b) throw new Error('no image: ' + t.slice(0, 160));
  return Buffer.from(b.includes(',') ? b.split(',')[1] : b, 'base64');
}
function clean(buf) { const im = decodePNG(buf); floodKeyEdges(im, 44); return encodePNG(im.W, im.H, im.px); }

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const style = frame0DataURI(anchorId);
  process.stderr.write(`anchor=${anchorId} (${style.w}x${style.h})\n`);
  for (const m of MOBS) {
    if (only.length && !only.includes(m.slug)) continue;
    try { process.stderr.write(`[${m.slug} · ${m.biome}] `); fs.writeFileSync(path.join(OUT, m.slug + '.png'), clean(await bitforge(m.desc, style))); console.error('ok'); }
    catch (e) { console.error('ERR', e.message); }
  }
  fs.writeFileSync(path.join(OUT, 'mobs.json'), JSON.stringify(MOBS.map(({ slug, biome }) => ({ slug, biome })), null, 2));
  try { const bal = await (await fetch(BASE + '/balance', { headers: H })).json(); console.log('left:', bal.subscription.generations); } catch {}
})();

'use strict';
// Style-matched mobs via PixelLab /generate-with-style-v2, using SEVERAL roster
// Claudemon (different palettes) as style refs so new enemies inherit the roster
// linework/shading WITHOUT bleeding one creature's colors. Distinct structured concepts.
//   node scripts/gen-mobs-v2.js <outDir> [slug ...]
const fs = require('fs');
const path = require('path');
const { decodePNG, encodePNG, floodKeyEdges } = require('./img');
const species = require('../src/species');

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'web', 'assets');
const BASE = 'https://api.pixellab.ai/v2';
const key = fs.readFileSync(path.join(ROOT, '.pixellab-key'), 'utf8').trim();
const H = { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const OUT = process.argv[2] || 'C:/Users/13wie/AppData/Local/Temp/claude/C--Users-13wie/63c8e5e6-8b4b-4c4e-8986-d2f0d612788a/scratchpad/mobs4';
const only = process.argv.slice(3);

const STYLE_ANCHORS = ['clawde', 'dunepup', 'mosskit']; // Clawde-led: front-facing mascot charm
const STYLE_DESC = 'in the exact style of the reference creatures: very thick dark navy outline, big round expressive eyes with a bright white shine, bold flat cel-shaded colors in two or three clear tones, chunky sturdy mascot proportions, clean crisp chunky pixels, warm muted palette, rosy cheeks, wholesome and adorable';

const STYLE = ', cute chibi creature, front three-quarter view facing toward the viewer, big round shiny eyes, chunky sturdy body, distinct clear silhouette, adorable, gentle happy expression, centered';
const NEG = 'no background, no shadow, no reflection, no text, no border, no angry face, no scary, no evil, no menacing, no humans, no hands, no weapons, no UI, no blur, not realistic, no gore';

const MOBS = [
  { slug: 'gulpeel',    biome: 'aquatic',  desc: 'a cute pale-blue ribbon eel with a long curvy S-shaped body and a small round mouth, two little side frills' },
  { slug: 'barbfin',    biome: 'aquatic',  desc: 'a cute little lionfish, small round cream body with fanned striped orange spiny fins spread around it' },
  { slug: 'capshroom',  biome: 'vivarium', desc: 'a cute chibi mushroom creature standing upright, a round red cap with soft white spots sitting on a plump rounded cream body, a happy little face on the body, two tiny stubby arms and two little feet' },
  { slug: 'mantleaf',   biome: 'vivarium', desc: 'a cute little leaf mantis, a slender green leaf-shaped body, two folded praying arms, two antennae, standing on two legs' },
  { slug: 'dustjerbo',  biome: 'desert',   desc: 'a cute desert jerboa, small sandy-tan rodent with big round hind legs, tiny front paws, huge ears, a long tufted tail' },
  { slug: 'scarabroll', biome: 'desert',   desc: 'a cute chibi beetle standing upright, a round glossy emerald-green domed shell, a small friendly face at the front, two little antennae, six tiny stubby legs' },
  // redesigns of the big-eye ones, brought into the roster style:
  { slug: 'brinemaw',    biome: 'aquatic',  desc: 'a cute little anglerfish, a round teal body, a glowing round lure on a short stalk over its head, a cute little shark grin with a single row of tiny white triangle teeth, big round shiny eyes, rosy cheeks, two little fins' },
  { slug: 'spineurchin', biome: 'aquatic',  desc: 'a cute round sea urchin, a soft deep-purple round body covered in short rounded spikes, two little stubby feet' },
];

function styleRef(id) {
  const sp = species.get(id);
  const im = decodePNG(fs.readFileSync(path.join(ASSETS, sp.sprite.sheet)));
  const fw = sp.sprite.frameW || im.H;
  const out = Buffer.alloc(fw * im.H * 4);
  for (let y = 0; y < im.H; y++) for (let x = 0; x < fw; x++) { const s = (y * im.W + x) * 4, d = (y * fw + x) * 4; for (let k = 0; k < 4; k++) out[d + k] = im.px[s + k]; }
  return { image: { type: 'base64', base64: encodePNG(fw, im.H, out).toString('base64') }, width: fw, height: im.H };
}

function extractImages(obj, acc = []) {
  if (!obj || typeof obj !== 'object') return acc;
  if (typeof obj.base64 === 'string') { acc.push(obj.base64); return acc; }
  if (Array.isArray(obj)) { obj.forEach((v) => extractImages(v, acc)); return acc; }
  for (const v of Object.values(obj)) { if (typeof v === 'string' && v.length > 500) acc.push(v); else if (v && typeof v === 'object') extractImages(v, acc); }
  return acc;
}

async function gen(desc, styleImages) {
  const r = await fetch(BASE + '/generate-with-style-v2', {
    method: 'POST', headers: H,
    body: JSON.stringify({ description: desc + STYLE, style_description: STYLE_DESC, image_size: { width: 48, height: 48 }, style_images: styleImages, no_background: true }),
  });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 200)}`);
  const jobId = j.background_job_id; if (!jobId) throw new Error('no job id: ' + t.slice(0, 160));
  for (let i = 0; i < 120; i++) {
    const s = await (await fetch(BASE + '/background-jobs/' + jobId, { headers: H })).json();
    if (s.status === 'completed') { const imgs = extractImages(s.last_response); if (!imgs.length) throw new Error('no image in result'); return Buffer.from(imgs[0].replace(/^.*,/, ''), 'base64'); }
    if (s.status === 'failed') throw new Error('job failed: ' + JSON.stringify(s).slice(0, 160));
    await sleep(2500);
  }
  throw new Error('timed out');
}
function clean(buf) { const im = decodePNG(buf); floodKeyEdges(im, 44); return encodePNG(im.W, im.H, im.px); }

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const refs = STYLE_ANCHORS.map(styleRef);
  process.stderr.write(`style anchors: ${STYLE_ANCHORS.join(', ')}\n`);
  for (const m of MOBS) {
    if (only.length && !only.includes(m.slug)) continue;
    try { process.stderr.write(`[${m.slug} · ${m.biome}] `); fs.writeFileSync(path.join(OUT, m.slug + '.png'), clean(await gen(m.desc, refs))); console.error('ok'); }
    catch (e) { console.error('ERR', e.message); }
  }
  fs.writeFileSync(path.join(OUT, 'mobs.json'), JSON.stringify(MOBS.map(({ slug, biome }) => ({ slug, biome })), null, 2));
  try { const bal = await (await fetch(BASE + '/balance', { headers: H })).json(); console.log('left:', bal.subscription.generations); } catch {}
})();

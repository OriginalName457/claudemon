'use strict';
// Fresh batch of new allies + enemies via generate-with-style-v2, style-matched off
// several roster Claudemon (diverse palettes). Distinct silhouettes, cute. -> review folder.
//   node scripts/gen-batch-v2.js <outDir> [slug ...]
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

const OUT = process.argv[2] || 'C:/Users/13wie/AppData/Local/Temp/claude/C--Users-13wie/63c8e5e6-8b4b-4c4e-8986-d2f0d612788a/scratchpad/batch1';
const only = process.argv.slice(3);

const STYLE_ANCHORS = ['clawde', 'dunepup', 'mosskit']; // Clawde-led: front-facing mascot charm
const STYLE_DESC = 'in the exact style of the reference creatures: very thick dark navy outline, big round expressive eyes with a bright white shine, bold flat cel-shaded colors in two or three clear tones, chunky sturdy mascot proportions, clean crisp chunky pixels, warm muted palette, rosy cheeks, wholesome and adorable';
const STYLE = ', cute chibi creature, front three-quarter view facing toward the viewer, big round shiny eyes, chunky sturdy body, distinct clear silhouette, adorable, gentle happy expression, centered';

const CREATURES = [
  // NEW ALLIES (friendly Claudemon)
  { slug: 'seabreeze', faction: 'friendly', biome: 'aquatic',  desc: 'a cute little seahorse with a curled tail, a tiny snout, a small dorsal fin, a soft teal-and-yellow body' },
  { slug: 'axoloom',   faction: 'friendly', biome: 'aquatic',  desc: 'a cute pale-pink axolotl with feathery frilled gills on each side of its head, a wide happy smile, little legs' },
  { slug: 'pricklepal', faction: 'friendly', biome: 'vivarium', desc: 'a cute round hedgehog with soft brown spines on its back, a little cream face, tiny paws and nose' },
  { slug: 'fennette',  faction: 'friendly', biome: 'desert',   desc: 'a cute fennec fox with huge round ears, soft cream-and-tan fur, a fluffy tail, big eyes' },
  // NEW ENEMIES (cute-but-mischief, not scary)
  { slug: 'snapfin',   faction: 'hostile',  biome: 'aquatic',  desc: 'a cute chubby piranha with a round teal body, a wide friendly grin showing tiny rounded teeth, big sparkly eyes, little fins' },
  { slug: 'buzzknight', faction: 'hostile', biome: 'vivarium', desc: 'a cute round bumblebee, a fuzzy yellow-and-black striped body, tiny translucent wings, a little stinger, big sparkly eyes' },
  { slug: 'coilkin',   faction: 'hostile',  biome: 'desert',   desc: 'a cute little rattlesnake coiled into a soft spiral, tan body with a gentle pattern, a little rattle on its tail, big sparkly eyes' },
  { slug: 'webbit',    faction: 'hostile',  biome: 'vivarium', desc: 'a cute tiny spider with a round fuzzy purple body, eight little rounded legs, big sparkly eyes, a shy smile' },
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
  const jobId = j.background_job_id; if (!jobId) throw new Error('no job id');
  for (let i = 0; i < 120; i++) {
    const s = await (await fetch(BASE + '/background-jobs/' + jobId, { headers: H })).json();
    if (s.status === 'completed') { const imgs = extractImages(s.last_response); if (!imgs.length) throw new Error('no image'); return Buffer.from(imgs[0].replace(/^.*,/, ''), 'base64'); }
    if (s.status === 'failed') throw new Error('job failed');
    await sleep(2500);
  }
  throw new Error('timed out');
}
function clean(buf) { const im = decodePNG(buf); floodKeyEdges(im, 44); return encodePNG(im.W, im.H, im.px); }

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const refs = STYLE_ANCHORS.map(styleRef);
  for (const c of CREATURES) {
    if (only.length && !only.includes(c.slug)) continue;
    let ok = false;
    for (let attempt = 0; attempt < 2 && !ok; attempt++) {
      try { process.stderr.write(`[${c.slug} · ${c.faction} · ${c.biome}] `); fs.writeFileSync(path.join(OUT, c.slug + '.png'), clean(await gen(c.desc, refs))); console.error('ok'); ok = true; }
      catch (e) { console.error('ERR', e.message); await sleep(2000); }
    }
  }
  fs.writeFileSync(path.join(OUT, 'batch.json'), JSON.stringify(CREATURES.map(({ slug, faction, biome }) => ({ slug, faction, biome })), null, 2));
  try { const bal = await (await fetch(BASE + '/balance', { headers: H })).json(); console.log('left:', bal.subscription.generations); } catch {}
})();

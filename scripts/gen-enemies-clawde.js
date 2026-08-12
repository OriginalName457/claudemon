'use strict';
// A fresh-from-scratch enemy set designed to look like it shipped alongside the
// original Clawde: same art DNA (front-facing mascot, big shiny eyes, thick navy
// outline, bold flat cel-shade, chunky 48px pixels). Clawde-led style anchors.
//   node scripts/gen-enemies-clawde.js <outDir> [slug ...]
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

const OUT = process.argv[2] || 'C:/Users/13wie/AppData/Local/Temp/claude/C--Users-13wie/63c8e5e6-8b4b-4c4e-8986-d2f0d612788a/scratchpad/enemies-clawde';
const only = process.argv.slice(3);

const STYLE_ANCHORS = ['clawde', 'dunepup', 'mosskit']; // Clawde-led
const STYLE_DESC = 'in the exact style of the reference creatures: very thick dark navy outline, big round expressive eyes with a bright white shine, bold flat cel-shaded colors in two or three clear tones, chunky sturdy mascot proportions, clean crisp chunky pixels, warm muted palette, rosy cheeks, wholesome and adorable';
const STYLE = ', cute chibi monster, front three-quarter view facing toward the viewer, big round shiny eyes, chunky sturdy body, distinct clear silhouette, adorable but a little mischievous, gentle expression, centered';

// fresh concepts — Clawde's rogues gallery. Distinct silhouettes, cute-menace, front-facing.
const ENEMIES = [
  { slug: 'prickuff',   biome: 'aquatic',  desc: 'a puffed-up round pufferfish, a soft teal body dotted with short blunt spikes, big pouty eyes, two tiny fins, a little grumpy' },
  { slug: 'chompsprout', biome: 'vivarium', desc: 'a cute carnivorous pitcher-plant creature, a plump green jug-shaped body with a soft smiling lid-mouth showing tiny rounded white fangs and a pink inside, one curled leaf on each side like little arms, sitting on a small mossy mound, big shiny eyes' },
  { slug: 'slugworth',  biome: 'vivarium', desc: 'a fat cute garden slug, a soft mossy-green body, two little eyestalks with big round eyes, a small mischievous smile, a faint shell swirl on its back' },
  { slug: 'spikelet',   biome: 'desert',   desc: 'a chunky little horned lizard, a round sandy-tan body with a few small blunt horns on its head and back, stubby legs, big round eyes' },
  // 2 new to replace nipclaw + duster:
  { slug: 'bloopjelly', biome: 'aquatic',  desc: 'a cute round jellyfish, a soft translucent teal-blue dome bell, a few short frilly dangly tentacles underneath, big round shiny eyes, floating gently, a little smile' },
  { slug: 'grumblebeak', biome: 'desert',  desc: 'a cute little vulture chick, a round fluffy dark-grey body with a pale ruffled collar, a big soft hooked beak, two tiny folded wings, stubby feet, big round eyes, a grumpy-cute look' },
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
  for (const e of ENEMIES) {
    if (only.length && !only.includes(e.slug)) continue;
    let ok = false;
    for (let attempt = 0; attempt < 2 && !ok; attempt++) {
      try { process.stderr.write(`[${e.slug} · ${e.biome}] `); fs.writeFileSync(path.join(OUT, e.slug + '.png'), clean(await gen(e.desc, refs))); console.error('ok'); ok = true; }
      catch (err) { console.error('ERR', err.message); await sleep(2000); }
    }
  }
  fs.writeFileSync(path.join(OUT, 'enemies.json'), JSON.stringify(ENEMIES.map(({ slug, biome }) => ({ slug, biome, faction: 'hostile' })), null, 2));
  try { const bal = await (await fetch(BASE + '/balance', { headers: H })).json(); console.log('left:', bal.subscription.generations); } catch {}
})();

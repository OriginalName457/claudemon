'use strict';
// Generate REDESIGN variants for thornmaw + dustwraith in the friendly-creature scheme,
// several options each, cleaned, into scratchpad/redesign/ for a review panel.
//   node scripts/gen-redesign.js
const fs = require('fs');
const path = require('path');
const { decodePNG, encodePNG, floodKeyEdges } = require('./img');

const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || path.join(ROOT, '..', 'AppData', 'Local', 'Temp', 'claude', 'C--Users-13wie', '63c8e5e6-8b4b-4c4e-8986-d2f0d612788a', 'scratchpad', 'redesign');
const BASE = 'https://api.pixellab.ai/v2';
const key = fs.readFileSync(path.join(ROOT, '.pixellab-key'), 'utf8').trim();
const H = { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };

const STYLE = ', a single small cute creature, clean minimalist Gen 1 Pokemon starter style, flat solid colors, bold clean rounded dark outline, big cute shiny eyes, a little cheeky, crisp clean pixel edges, centered, side view';
const NEG = 'no background, no shadow, no drop shadow, no ground shadow, no reflection, no text, no words, no border, no frame, no humans, no hands, no weapons, no UI, no blur, not realistic, no gore, no extra pixels';

const VARIANTS = [
  // THORNMAW — cute carnivorous plant that reaches for company (vivarium)
  { slug: 'thornmaw-A', label: 'Thornmaw · potted flytrap', desc: 'a cute little venus flytrap creature in a small round green pot, a soft open mouth with tiny white fangs and a pink inside, two little leaf arms reaching out, cheeky grin' },
  { slug: 'thornmaw-B', label: 'Thornmaw · reaching sprout', desc: 'a cute little green sprout creature with a round bulb head and a toothy smiling mouth, a few curly little root-tendrils reaching out from the base, two leaf ears, big shiny eyes' },
  { slug: 'thornmaw-C', label: 'Thornmaw · pitcher bud', desc: 'a cute round pitcher plant creature, a plump green vase-shaped body, a soft lid opening like a smiling mouth, one big cute eye, a tiny pink tongue, little vine arms' },
  { slug: 'thornmaw-D', label: 'Thornmaw · fanged flower', desc: 'a cute little flower-bud monster, chubby green body, pink petals framing a soft round mouth with small white fangs, big innocent eyes, two stubby leaf feet' },
  // DUSTWRAITH — shy sand phantom (desert)
  { slug: 'dustwraith-A', label: 'Dustwraith · sand ghost', desc: 'a cute little sand ghost, soft round tan body with a wispy wavy bottom, two big cute dark eyes, tiny stubby arms, floating, shy' },
  { slug: 'dustwraith-B', label: 'Dustwraith · dust devil', desc: 'a cute tiny sand-tornado creature, a soft swirling tan funnel body tapering to a point, two big shiny eyes near the top, little swirl arms, cheeky' },
  { slug: 'dustwraith-C', label: 'Dustwraith · cloaked wisp', desc: 'a cute little floating phantom wrapped in a soft tan sandy cloak, a round hood shading two big glowing cute eyes, wispy tattered hem, shy' },
  { slug: 'dustwraith-D', label: 'Dustwraith · sleepy dune spirit', desc: 'a cute chubby sand spirit shaped like a soft rounded dune, warm tan body speckled with tiny sand grains, two sleepy half-closed cute eyes, a little wisp on top' },
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
function clean(pngBuf) { const im = decodePNG(pngBuf); floodKeyEdges(im, 44); return encodePNG(im.W, im.H, im.px); }

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const v of VARIANTS) {
    try {
      process.stderr.write(`[${v.slug}] `);
      fs.writeFileSync(path.join(OUT, v.slug + '.png'), clean(await pixflux(v.desc)));
      console.error('ok');
    } catch (err) { console.error('ERR', err.message); }
  }
  fs.writeFileSync(path.join(OUT, 'variants.json'), JSON.stringify(VARIANTS, null, 2));
  try { const bal = await (await fetch(BASE + '/balance', { headers: H })).json(); console.log('generations left:', bal.subscription.generations); } catch {}
})();

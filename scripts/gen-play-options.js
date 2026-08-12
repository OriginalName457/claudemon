'use strict';
// Fresh PLAY icon ideas — varied toys, not just balls.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'web', 'assets', '_icons', 'opts');
const BASE = 'https://api.pixellab.ai/v2';
const key = fs.readFileSync(path.join(ROOT, '.pixellab-key'), 'utf8').trim();
const H = { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
const NEG = 'no background, no frame, no border, no text, no words, no letters, single object';
const OPTS = [
  { slug: 'play_d', desc: 'a glossy bright red bouncing rubber ball with a white shine, simple bold cute pixel art icon, centered' },
  { slug: 'play_e', desc: 'a cute chew bone dog toy, simple bold cute pixel art icon, centered' },
  { slug: 'play_f', desc: 'a red frisbee flying disc seen at a slight angle, simple bold cute pixel art icon, centered' },
  { slug: 'play_g', desc: 'a colorful spinning top toy, simple bold cute pixel art icon, centered' },
  { slug: 'play_h', desc: 'a feather cat wand teaser toy with a bell, simple bold cute pixel art icon, centered' },
  { slug: 'play_i', desc: 'a small kite with a tail, simple bold cute pixel art icon, centered' },
];
async function pixflux(desc) {
  const r = await fetch(BASE + '/create-image-pixflux', { method: 'POST', headers: H, body: JSON.stringify({ description: desc, negative_description: NEG, image_size: { width: 48, height: 48 }, no_background: true, text_guidance_scale: 9 }) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 160)}`);
  const b = j.image && j.image.base64; if (!b) throw new Error('no image');
  return Buffer.from(b.includes(',') ? b.split(',')[1] : b, 'base64');
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const o of OPTS) { try { process.stderr.write(`[${o.slug}] `); fs.writeFileSync(path.join(OUT, o.slug + '.png'), await pixflux(o.desc)); console.error('ok'); } catch (e) { console.error('ERR', e.message); } }
  console.log('done');
})();

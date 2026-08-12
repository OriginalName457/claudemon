'use strict';
// Wider net for the PLAY icon — different concepts that read as fun/play.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'web', 'assets', '_icons', 'opts');
const BASE = 'https://api.pixellab.ai/v2';
const key = fs.readFileSync(path.join(ROOT, '.pixellab-key'), 'utf8').trim();
const H = { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
const NEG = 'no background, no frame, no border, no text, no words, no letters, single object';
const OPTS = [
  { slug: 'play_j', desc: 'a bunch of three colorful party balloons on strings, simple bold cute pixel art icon, centered' },
  { slug: 'play_k', desc: 'a colorful pinwheel toy on a stick, simple bold cute pixel art icon, centered' },
  { slug: 'play_l', desc: 'a party popper bursting with colorful confetti, simple bold cute pixel art icon, centered' },
  { slug: 'play_m', desc: 'a happy cheerful yellow star with a smile, simple bold cute pixel art icon, centered' },
  { slug: 'play_n', desc: 'a stack of colorful toy building blocks, simple bold cute pixel art icon, centered' },
  { slug: 'play_o', desc: 'a red ball with curved motion lines bouncing, simple bold cute pixel art icon, centered' },
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

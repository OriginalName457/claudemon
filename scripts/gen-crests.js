'use strict';
// Cute pixel-art clan CREST emblems (transparent) for Clawland clan symbols.
// -> web/assets/_crests/<id>.png
const fs = require('fs');
const path = require('path');
const { decodePNG, encodePNG, floodKeyEdges } = require('./img');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'web', 'assets', '_crests');
const BASE = 'https://api.pixellab.ai/v2';
const key = fs.readFileSync(path.join(ROOT, '.pixellab-key'), 'utf8').trim();
const H = { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };

const STYLE = ', a cute simple pixel-art heraldic emblem badge, bold clean dark outline, flat bright colors, centered, symmetrical, single icon';
const NEG = 'no background, no text, no words, no letters, no numbers, no border frame, not realistic, no blur, no drop shadow, no photo, no extra objects';

const CRESTS = [
  { id: 'shield', desc: 'a rounded knight shield emblem' },
  { id: 'paw', desc: 'a bold dark-brown animal paw print with four toe beans' },
  { id: 'leaf', desc: 'a green leaf sprig' },
  { id: 'flame', desc: 'a curling orange flame' },
  { id: 'wave', desc: 'a blue ocean wave curl' },
  { id: 'star', desc: 'a bright five-point star' },
  { id: 'crown', desc: 'a little golden crown' },
  { id: 'fang', desc: 'a pair of sharp fangs' },
  { id: 'mushroom', desc: 'a red spotted mushroom' },
  { id: 'sun', desc: 'a smiling sun with rays' },
  { id: 'moon', desc: 'a crescent moon' },
  { id: 'skull', desc: 'a cute little skull' },
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
  for (const c of CRESTS) {
    try { process.stderr.write(`[${c.id}] `); fs.writeFileSync(path.join(OUT, c.id + '.png'), clean(await pixflux(c.desc))); console.error('ok'); }
    catch (e) { console.error('ERR', e.message); }
  }
  fs.writeFileSync(path.join(OUT, 'crests.json'), JSON.stringify(CRESTS.map(c => c.id), null, 2));
  try { const bal = await (await fetch(BASE + '/balance', { headers: H })).json(); console.log('left:', bal.subscription.generations); } catch {}
})();

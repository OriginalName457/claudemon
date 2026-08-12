'use strict';
// Scene backgrounds for the Lab (sci-fi) and Lounge (cozy) pages. The owned
// creature is drawn/animated in-page on the floor in front of these.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'web', 'assets', '_rooms');
const BASE = 'https://api.pixellab.ai/v2';
const key = fs.readFileSync(path.join(ROOT, '.pixellab-key'), 'utf8').trim();
const H = { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
const NEG = 'no characters, no creatures, no animals, no people, no text, no words, no UI, no frame, no border';
const ROOMS = [
  { slug: 'lab', desc: 'a pixel art sci-fi laboratory interior, glowing holographic screens and monitors, beakers and vials of glowing teal liquid, high-tech consoles with blinking lights, cyan and blue neon glow, sleek dark metal walls, a clear empty floor across the foreground to stand on, cozy and cute, detailed pixel art' },
  { slug: 'lounge', desc: 'a pixel art cozy lounge room, a soft comfy couch, a warm patterned rug, a leafy potted plant, a glowing floor lamp, a small bookshelf, warm orange evening light, wooden floor, inviting and cute, a clear floor across the foreground to stand on, detailed pixel art' },
];
async function pixflux(desc) {
  const r = await fetch(BASE + '/create-image-pixflux', { method: 'POST', headers: H, body: JSON.stringify({ description: desc, negative_description: NEG, image_size: { width: 240, height: 144 }, no_background: false, text_guidance_scale: 8 }) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 160)}`);
  const b = j.image && j.image.base64; if (!b) throw new Error('no image');
  return Buffer.from(b.includes(',') ? b.split(',')[1] : b, 'base64');
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const rm of ROOMS) { try { process.stderr.write(`[${rm.slug}] `); fs.writeFileSync(path.join(OUT, rm.slug + '.png'), await pixflux(rm.desc)); console.error('ok'); } catch (e) { console.error('ERR', e.message); } }
  console.log('done');
})();

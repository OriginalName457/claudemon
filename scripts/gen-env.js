'use strict';
// Top-down MAP ENVIRONMENT art for the arena: terrain tiles + scatter props + food.
// -> scratchpad/env/<id>.png   Review in a panel before integrating.
//   node scripts/gen-env.js [outDir] [id ...]
const fs = require('fs');
const path = require('path');
const { decodePNG, encodePNG, floodKeyEdges } = require('./img');
const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || 'C:/Users/13wie/AppData/Local/Temp/claude/C--Users-13wie/63c8e5e6-8b4b-4c4e-8986-d2f0d612788a/scratchpad/env';
const only = process.argv.slice(3);
const BASE = 'https://api.pixellab.ai/v2';
const key = fs.readFileSync(path.join(ROOT, '.pixellab-key'), 'utf8').trim();
const H = { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };

const TOPDOWN = ', top-down overhead view, cute pixel art game asset, clean chunky pixels, bright cheerful colors, simple, flat lighting';
const TILE = ', a seamless tileable ground texture that fills the entire frame edge to edge, top-down overhead map ground';
const NEGP = 'no character, no creature, no animal, no monster, no eyes, no face, no text, no words, no border, no frame, not realistic, no blur, no drop shadow, no ground shadow';
const NEGT = 'no character, no creature, no animal, no text, no words, no border, no frame, not realistic, no blur, no objects, no props';

const ITEMS = [
  // terrain tiles (filled, meant to tile)
  { id: 'grass',   cat: 'terrain', tile: true,  desc: 'lush green grassland ground with a few tiny scattered blades and specks' },
  { id: 'sand',    cat: 'terrain', tile: true,  desc: 'warm tan desert sand ground with soft gentle ripples' },
  { id: 'water',   cat: 'terrain', tile: true,  desc: 'calm blue water surface with soft light ripples' },
  { id: 'dirt',    cat: 'terrain', tile: true,  desc: 'bare brown dirt and small pebble ground' },
  // scatter props (transparent)
  { id: 'grasstuft', cat: 'prop', desc: 'a small tuft of tall green grass blades' },
  { id: 'bush',      cat: 'prop', desc: 'a small round leafy green bush' },
  { id: 'flowers',   cat: 'prop', desc: 'a little cluster of small colorful wildflowers' },
  { id: 'rock',      cat: 'prop', desc: 'a smooth grey boulder rock' },
  { id: 'cactus',    cat: 'prop', desc: 'a cute small round green desert cactus' },
  { id: 'palm',      cat: 'prop', desc: 'a small tropical palm tree' },
  { id: 'reeds',     cat: 'prop', desc: 'a clump of tall green water reeds and cattails' },
  { id: 'lilypad',   cat: 'prop', desc: 'a round green lily pad with a small pink flower' },
  // food / items (transparent)
  { id: 'berries',   cat: 'food', desc: 'a small cluster of shiny red berries' },
  { id: 'apple',     cat: 'food', desc: 'a single shiny red apple with a green leaf' },
  { id: 'mushroom',  cat: 'food', desc: 'a cute small red-capped mushroom with white spots' },
  { id: 'melon',     cat: 'food', desc: 'a slice of juicy pink watermelon' },
];

async function pixflux(desc, tile) {
  const body = {
    description: desc + (tile ? TILE + TOPDOWN : TOPDOWN + ', centered, single object'),
    negative_description: tile ? NEGT : NEGP,
    image_size: { width: tile ? 64 : 48, height: tile ? 64 : 48 },
    no_background: !tile, text_guidance_scale: 8,
  };
  const r = await fetch(BASE + '/create-image-pixflux', { method: 'POST', headers: H, body: JSON.stringify(body) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 160)}`);
  const b = j.image && j.image.base64; if (!b) throw new Error('no image');
  return Buffer.from(b.includes(',') ? b.split(',')[1] : b, 'base64');
}
function cleanProp(buf) { const im = decodePNG(buf); floodKeyEdges(im, 44); return encodePNG(im.W, im.H, im.px); }

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const it of ITEMS) {
    if (only.length && !only.includes(it.id)) continue;
    try {
      process.stderr.write(`[${it.id} · ${it.cat}] `);
      let buf = await pixflux(it.desc, it.tile);
      if (!it.tile) buf = cleanProp(buf);
      fs.writeFileSync(path.join(OUT, it.id + '.png'), buf);
      console.error('ok');
    } catch (e) { console.error('ERR', e.message); }
  }
  fs.writeFileSync(path.join(OUT, 'env.json'), JSON.stringify(ITEMS.map(({ id, cat, tile }) => ({ id, cat, tile: !!tile })), null, 2));
  try { const bal = await (await fetch(BASE + '/balance', { headers: H })).json(); console.log('left:', bal.subscription.generations); } catch {}
})();

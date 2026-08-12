'use strict';
// Animate the PixelLab static VFX into looping sprite sheets via animate-with-text-v3.
//   node scripts/anim-vfx-pixellab.js <id...>
// in:  scratchpad/vfx-pixellab/<id>.png   out: scratchpad/vfx-pixellab-anim/<id>.png
const fs = require('fs');
const path = require('path');
const { decodePNG, encodePNG, hstrip, floodKeyEdges } = require('./img');
const ROOT = path.join(__dirname, '..');
const IN = 'C:/Users/13wie/AppData/Local/Temp/claude/C--Users-13wie/63c8e5e6-8b4b-4c4e-8986-d2f0d612788a/scratchpad/vfx-pixellab';
const OUT = 'C:/Users/13wie/AppData/Local/Temp/claude/C--Users-13wie/63c8e5e6-8b4b-4c4e-8986-d2f0d612788a/scratchpad/vfx-pixellab-anim';
const BASE = 'https://api.pixellab.ai/v2';
const key = fs.readFileSync(path.join(ROOT, '.pixellab-key'), 'utf8').trim();
const H = { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ACTION = {
  slash: 'a quick sharp slashing swipe', bite: 'jaws chomping open then snapping shut',
  bash: 'a bright impact explosion bursting outward', orb: 'a glowing energy orb pulsing and swirling',
  spike: 'a pointed crystal shard streaking quickly to the right with a motion trail', shock: 'electricity crackling and flickering',
  poison: 'a toxic cloud bubbling and swirling', ember: 'flames flickering and burning upward',
  splash: 'water splashing and spraying outward', dodge: 'fast motion streaks dashing sideways',
  guard: 'a shield barrier shimmering and pulsing', heal: 'healing sparkles twinkling and rising',
};

async function animate(spritePng, action) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(BASE + '/animate-with-text-v3', {
        method: 'POST', headers: H,
        body: JSON.stringify({ first_frame: { type: 'base64', base64: spritePng.toString('base64') }, action }),
      });
      const t = await r.text();
      if (!r.ok || t[0] === '<') { await sleep(4000); continue; }
      const j = JSON.parse(t);
      for (let i = 0; i < 100; i++) {
        const s = await (await fetch(BASE + '/background-jobs/' + j.background_job_id, { headers: H })).json();
        if (s.status === 'completed') {
          let fr = (s.last_response && s.last_response.images) || [];
          if (!Array.isArray(fr)) fr = Object.values(fr);
          return fr.map((x) => Buffer.from((typeof x === 'string' ? x : (x.base64 || x.image)).replace(/^.*,/, ''), 'base64'));
        }
        if (s.status === 'failed') break;
        await sleep(3000);
      }
    } catch (e) { await sleep(4000); }
  }
  return null;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const ids = process.argv.slice(2);
  for (const id of ids) {
    const src = path.join(IN, id + '.png');
    if (!fs.existsSync(src)) { console.error(`[${id}] no source — skip`); continue; }
    process.stderr.write(`[${id}] `);
    const frames = await animate(fs.readFileSync(src), ACTION[id] || 'a flickering effect');
    if (!frames || !frames.length) { console.error('FAILED'); continue; }
    const decoded = frames.map((b) => decodePNG(b));
    const strip = hstrip(decoded);
    floodKeyEdges(strip, +(process.env.FLOOD_TOL || 38));
    fs.writeFileSync(path.join(OUT, id + '.png'), encodePNG(strip.W, strip.H, strip.px));
    console.error(`ok — ${decoded.length}f @ ${decoded[0].W}px`);
  }
  try { const bal = await (await fetch(BASE + '/balance', { headers: H })).json(); console.log('left:', bal.subscription.generations); } catch {}
})();

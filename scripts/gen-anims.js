#!/usr/bin/env node
'use strict';
// Generate creature animations via animate-with-text-v3, the proven pipeline.
// Saves strips into web/assets/_anim/ (non-destructive; nothing clobbered until approved).
//   node scripts/gen-anims.js idle <id...>      -> _anim/<id>-idle.png
//   node scripts/gen-anims.js walk <id...>      -> _anim/<id>-walk-right.png + mirrored -walk-left.png
// Source = frame 0 of the species' current sheet (single-frame sheets used as-is).

const fs = require('fs');
const path = require('path');
const { decodePNG, encodePNG, hstrip, floodKeyEdges } = require('./img');
const species = require('../src/species');

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'web', 'assets');
const ANIM = path.join(ASSETS, '_anim');
const BASE = 'https://api.pixellab.ai/v2';
const key = fs.readFileSync(path.join(ROOT, '.pixellab-key'), 'utf8').trim();
const H = { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// crop a single frame out of a horizontal strip
function frame0(im, fw) {
  fw = fw || im.H;
  const out = Buffer.alloc(fw * im.H * 4);
  for (let y = 0; y < im.H; y++) for (let x = 0; x < fw; x++) {
    const s = (y * im.W + x) * 4, d = (y * fw + x) * 4;
    out[d] = im.px[s]; out[d + 1] = im.px[s + 1]; out[d + 2] = im.px[s + 2]; out[d + 3] = im.px[s + 3];
  }
  return { W: fw, H: im.H, px: out };
}
// horizontal mirror of a whole strip, per-frame (so a walk strip flips each frame in place)
function mirrorStrip(im, fw) {
  const n = Math.round(im.W / fw);
  const out = Buffer.alloc(im.W * im.H * 4);
  for (let f = 0; f < n; f++) for (let y = 0; y < im.H; y++) for (let x = 0; x < fw; x++) {
    const s = (y * im.W + (f * fw + x)) * 4;
    const d = (y * im.W + (f * fw + (fw - 1 - x))) * 4;
    out[d] = im.px[s]; out[d + 1] = im.px[s + 1]; out[d + 2] = im.px[s + 2]; out[d + 3] = im.px[s + 3];
  }
  return { W: im.W, H: im.H, px: out };
}

function sourceFrame(id) {
  const sp = species.get(id);
  const sheet = sp && sp.sprite && sp.sprite.sheet;
  if (!sheet) return null;
  const p = path.join(ASSETS, sheet);
  if (!fs.existsSync(p)) return null;
  const im = decodePNG(fs.readFileSync(p));
  const fw = (sp.sprite.frameW) || im.H;
  return { im: frame0(im, fw), fw };
}

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

async function run(action, id) {
  const src = sourceFrame(id);
  if (!src) { console.log(`[${id}] no source sprite — skip`); return false; }
  const png = encodePNG(src.im.W, src.im.H, src.im.px);
  process.stderr.write(`[${id} ${action}] `);
  const frames = await animate(png, action === 'walk' ? 'walk' : 'idle');
  if (!frames || !frames.length) { console.error('FAILED'); return false; }
  const decoded = frames.map((b) => decodePNG(b));
  const strip = hstrip(decoded);
  floodKeyEdges(strip, +(process.env.FLOOD_TOL || 40)); // FLOOD_TOL lower = gentler (keeps pale parts like Chirp's head)
  const fw = decoded[0].W;
  fs.mkdirSync(ANIM, { recursive: true });
  if (action === 'idle') {
    fs.writeFileSync(path.join(ANIM, `${id}-idle.png`), encodePNG(strip.W, strip.H, strip.px));
    console.error(`ok — ${decoded.length}f @ ${fw}px -> _anim/${id}-idle.png`);
  } else {
    fs.writeFileSync(path.join(ANIM, `${id}-walk-right.png`), encodePNG(strip.W, strip.H, strip.px));
    const mir = mirrorStrip(strip, fw);
    fs.writeFileSync(path.join(ANIM, `${id}-walk-left.png`), encodePNG(mir.W, mir.H, mir.px));
    console.error(`ok — ${decoded.length}f @ ${fw}px -> _anim/${id}-walk-right.png (+mirrored left)`);
  }
  return true;
}

(async () => {
  const [action, ...ids] = process.argv.slice(2);
  if (!['idle', 'walk'].includes(action) || !ids.length) {
    console.error('usage: node scripts/gen-anims.js <idle|walk> <id...>'); process.exit(1);
  }
  for (const id of ids) await run(action, id);
  try { const bal = await (await fetch(BASE + '/balance', { headers: H })).json(); console.log('BALANCE:', bal.subscription.generations); } catch {}
})();

#!/usr/bin/env node
'use strict';
// Generate REAL emotion animations with PixelLab. For each (creature, emotion) it
// takes the creature's own first idle frame, runs animate-with-text-v3 with an
// emotion-specific motion prompt, cleans the gray background, and saves a frame
// strip to web/assets/<id>_<emotion>.png — same 48px, ready to play like the idle.
//
// Usage: node scripts/build-emotes.js clawde:happy dunepup:excited sting:proud

const fs = require('fs');
const path = require('path');
const { decodePNG, encodePNG, hstrip, floodKeyEdges } = require('./img');
const { emote } = require('../src/emotes');

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'web', 'assets');
const BASE = 'https://api.pixellab.ai/v2';
const key = fs.readFileSync(path.join(ROOT, '.pixellab-key'), 'utf8').trim();
const H = { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// MINIMALISTIC motion — small, subtle, in-place movements that keep the creature
// clean and on-model. No big jumps / spins / shaking (that read as chaotic). The
// personality lives in the sprite + the emote line; the animation just breathes.
const ACTIONS = {
  happy:   'a subtle happy idle, breathing gently and bobbing very slightly in place with a content look, minimal motion, stays centered and on-model',
  excited: 'a light eager idle, a small springy bob in place, subtle and quick but gentle, stays centered and on-model',
  proud:   'standing a little taller, a calm proud settle, very small movement, chin up, stays centered and on-model',
  love:    'a soft warm idle, gently swaying a tiny bit side to side, affectionate and calm, minimal motion, stays centered and on-model',
  sleepy:  'a slow drowsy idle, breathing softly and swaying barely, eyes heavy, very minimal motion, stays centered and on-model',
  curious: 'a small curious idle, a slight gentle head tilt, subtle and calm, stays centered and on-model',
};
function actionFor(id, emotion) { return ACTIONS[emotion] || ACTIONS.happy; }

function firstFrame(strip, fw) {
  const { W, H: h, px } = strip; const out = Buffer.alloc(fw * h * 4);
  for (let y = 0; y < h; y++) { const srow = (y * W) * 4; px.copy(out, (y * fw) * 4, srow, srow + fw * 4); }
  return { W: fw, H: h, px: out };
}

async function animate(spritePng, action) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(BASE + '/animate-with-text-v3', { method: 'POST', headers: H, body: JSON.stringify({ first_frame: { type: 'base64', base64: spritePng.toString('base64') }, action }) });
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
    } catch { await sleep(4000); }
  }
  return null;
}

(async () => {
  const pairs = process.argv.slice(2).map((s) => s.split(':'));
  if (!pairs.length) { console.error('usage: node scripts/build-emotes.js clawde:happy dunepup:excited ...'); process.exit(1); }
  for (const [id, emotion] of pairs) {
    const idle = path.join(ASSETS, id + '.png');
    if (!fs.existsSync(idle)) { console.log(`[${id}] no idle sprite — skipped`); continue; }
    const action = actionFor(id, emotion);
    const strip = decodePNG(fs.readFileSync(idle));
    const fw = strip.H; // square frames (48)
    const seed = encodePNG(fw, strip.H, firstFrame(strip, fw).px);
    console.log(`[${id}:${emotion}] animating "${action}"...`);
    const frames = await animate(seed, action);
    if (!frames || !frames.length) { console.log(`[${id}:${emotion}] FAILED`); continue; }
    const decoded = frames.map((b) => decodePNG(b));
    const out = hstrip(decoded);
    floodKeyEdges(out, 40);
    fs.writeFileSync(path.join(ASSETS, `${id}_${emotion}.png`), encodePNG(out.W, out.H, out.px));
    console.log(`[${id}:${emotion}] DONE — ${decoded.length} frames -> web/assets/${id}_${emotion}.png`);
  }
  try { const bal = await (await fetch(BASE + '/balance', { headers: H })).json(); console.log('BALANCE:', bal.subscription.generations); } catch {}
})();

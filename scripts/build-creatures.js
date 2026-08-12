#!/usr/bin/env node
'use strict';
// Animate creature sprites to full Clawde-quality: take each species' static
// sprite, run animate-with-text-v3 (idle), clean the gray background
// (floodKeyEdges — v3 always adds one), build a horizontal strip, and save to
// web/assets/<id>.png. Retries once on transient gateway errors.
//
// Usage: node scripts/build-creatures.js mosskit glowbug ... (ids)

const fs = require('fs');
const path = require('path');
const { decodePNG, encodePNG, hstrip, floodKeyEdges } = require('./img');

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'web', 'assets');
const BASE = 'https://api.pixellab.ai/v2';
const key = fs.readFileSync(path.join(ROOT, '.pixellab-key'), 'utf8').trim();
const H = { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function staticSource(id) {
  // assets first (curated art, e.g. the good slime), then raw concepts
  for (const p of [path.join(ASSETS, id + '.png'), path.join(ASSETS, '_concepts', id + '.png')]) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function animate(spritePng, action) {
  for (let attempt = 0; attempt < 2; attempt++) {
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
          return fr.map(x => Buffer.from((typeof x === 'string' ? x : (x.base64 || x.image)).replace(/^.*,/, ''), 'base64'));
        }
        if (s.status === 'failed') break;
        await sleep(3000);
      }
    } catch (e) { await sleep(4000); }
  }
  return null;
}

(async () => {
  const ids = process.argv.slice(2);
  if (!ids.length) { console.error('usage: node scripts/build-creatures.js <id>...'); process.exit(1); }
  for (const id of ids) {
    const src = staticSource(id);
    if (!src) { console.log(`[${id}] NO STATIC SPRITE — skipped`); continue; }
    console.log(`[${id}] animating from ${path.relative(ROOT, src)}...`);
    const frames = await animate(fs.readFileSync(src), 'idle');
    if (!frames) { console.log(`[${id}] ANIMATION FAILED`); continue; }
    const decoded = frames.map(b => decodePNG(b));
    const strip = hstrip(decoded);
    floodKeyEdges(strip, 40); // v3 puts everything on a flat gray square
    fs.writeFileSync(path.join(ASSETS, id + '.png'), encodePNG(strip.W, strip.H, strip.px));
    console.log(`[${id}] DONE — ${decoded.length} frames @ ${decoded[0].W}px -> web/assets/${id}.png`);
  }
  const bal = await (await fetch(BASE + '/balance', { headers: H })).json();
  console.log('BALANCE:', bal.subscription.generations);
})();

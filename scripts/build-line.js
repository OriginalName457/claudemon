#!/usr/bin/env node
'use strict';
// Batch-build the full Claudemon line in ONE consistent detailed+animated style:
//   bitforge(description, style_image=Clawde anchor) -> detailed 128px sprite
//   animate-with-text-v3(first_frame=sprite, action)  -> ~9 detailed frames
//   -> horizontal sprite sheet -> web/assets/<slug>_anim.png -> manifest
// Style anchor = the approved bitforge Clawde, so every form matches it.

const fs = require('fs');
const path = require('path');
const { decodePNG, encodePNG, resize, hstrip } = require('./img');

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'web', 'assets');
const BASE = 'https://api.pixellab.ai/v2';
const key = fs.readFileSync(path.join(ROOT, '.pixellab-key'), 'utf8').trim();
const H = { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Anchor style image (approved detailed Clawde), 128x128 raw base64.
const anchor = resize(decodePNG(fs.readFileSync(path.join(ASSETS, '_pixellab', 'clawde_bitforge', 'clawde.png'))), 128, 128);
const STYLE = encodePNG(128, 128, anchor.px).toString('base64');

const FORMS = [
  { slug: 'egg',        scale: 0.6,  action: 'idle bounce', desc: 'a cute monster egg, round teal shell with warm orange speckles and tiny cracks, two tiny eyes peeking out, adorable' },
  { slug: 'blip',       scale: 0.7,  action: 'idle',        desc: 'a tiny round baby monster, squishy teal blob body, warm orange belly, two huge sparkly expressive eyes, two little horn nubs, super cute' },
  { slug: 'prismshell', scale: 0.92, action: 'walk',        desc: 'a crystal-armored crab monster, glowing cyan gemstone shell over a teal body, warm orange belly, small horns, elegant and noble, cute but cool' },
  { slug: 'rustclaw',   scale: 0.92, action: 'walk',        desc: 'a rugged battle-scarred crab monster, rusty iron shell, one big oversized chipped claw, teal limbs, tough and scrappy, glowing angry eyes, horns' },
  { slug: 'aurelian',   scale: 1.0,  action: 'walk',        desc: 'a majestic golden crab-king monster, small crown, ornate radiant golden armor over a teal body, big noble eyes, elegant horns, regal' },
  { slug: 'voidmaw',    scale: 1.0,  action: 'walk',        desc: 'a menacing abyssal crab monster, deep purple shell, glowing neon-green cracks and eyes, sharp claws and horns, wispy dark energy, cool and scary' },
];

async function api(p, body) {
  const r = await fetch(BASE + p, { method: 'POST', headers: H, body: JSON.stringify(body) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  if (!r.ok) throw new Error(`HTTP ${r.status} ${p}: ${t.slice(0, 200)}`);
  return j;
}
async function balance() { const r = await fetch(BASE + '/balance', { headers: H }); return (await r.json()).subscription.generations; }

async function bitforge(desc) {
  const j = await api('/create-image-bitforge', {
    description: desc, image_size: { width: 128, height: 128 },
    style_image: { type: 'base64', base64: STYLE }, no_background: true,
  });
  const b = j.image.base64; return Buffer.from(b.includes(',') ? b.split(',')[1] : b, 'base64');
}

async function animate(spritePng, action) {
  const j = await api('/animate-with-text-v3', { first_frame: { type: 'base64', base64: spritePng.toString('base64') }, action });
  if (!j.background_job_id) throw new Error('no job id: ' + JSON.stringify(j).slice(0, 150));
  for (let i = 0; i < 100; i++) {
    const s = await (await fetch(BASE + '/background-jobs/' + j.background_job_id, { headers: H })).json();
    if (s.status === 'completed') {
      let frames = (s.last_response && s.last_response.images) || [];
      if (!Array.isArray(frames)) frames = Object.values(frames);
      return frames.map(fr => {
        const bb = typeof fr === 'string' ? fr : (fr.base64 || fr.image);
        return Buffer.from(bb.includes(',') ? bb.split(',')[1] : bb, 'base64');
      });
    }
    if (s.status === 'failed') throw new Error('animate failed');
    await sleep(3000);
  }
  throw new Error('animate timed out');
}

function updateManifest(slug, frameCount, scale) {
  const mp = path.join(ASSETS, 'manifest.json');
  const m = JSON.parse(fs.readFileSync(mp, 'utf8'));
  m.forms[slug] = {
    sheet: `${slug}_anim.png`, frameW: 128, frameH: 128, fps: 8, scale, smooth: true,
    anims: { idle: { row: 0, frames: frameCount }, walk: { row: 0, frames: frameCount } },
  };
  fs.writeFileSync(mp, JSON.stringify(m, null, 2));
}

(async () => {
  console.log('start balance:', await balance(), 'gens');
  for (const f of FORMS) {
    try {
      console.log(`\n[${f.slug}] bitforge...`);
      const sprite = await bitforge(f.desc);
      fs.mkdirSync(path.join(ASSETS, '_pixellab', f.slug + '_bitforge'), { recursive: true });
      fs.writeFileSync(path.join(ASSETS, '_pixellab', f.slug + '_bitforge', 'sprite.png'), sprite);
      console.log(`[${f.slug}] animate (${f.action})...`);
      const frameBufs = await animate(sprite, f.action);
      const frames = frameBufs.map(b => decodePNG(b));
      const strip = hstrip(frames);
      fs.writeFileSync(path.join(ASSETS, `${f.slug}_anim.png`), encodePNG(strip.W, strip.H, strip.px));
      updateManifest(f.slug, frames.length, f.scale);
      console.log(`[${f.slug}] DONE — ${frames.length} frames -> ${f.slug}_anim.png | balance ${await balance()}`);
    } catch (e) {
      console.error(`[${f.slug}] ERROR:`, e.message);
    }
  }
  console.log('\nBATCH COMPLETE. final balance:', await balance(), 'gens');
})();

#!/usr/bin/env node
'use strict';
// Split a horizontal sprite strip into individual 48px frames for easy manual
// editing, and join them back. Preserves transparency (RGBA PNG).
//
//   node scripts/frames.js split web/assets/dunepup.png web/assets/_edit/dunepup
//   ...edit the fNN.png files in your editor (keep them 48x48, transparent bg)...
//   node scripts/frames.js join web/assets/_edit/dunepup web/assets/dunepup.png

const fs = require('fs');
const path = require('path');
const { decodePNG, encodePNG } = require('./img');

const FW = 48;

function crop(src, fx, fw, fh) {
  const out = Buffer.alloc(fw * fh * 4);
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
    const s = (y * src.W + (fx + x)) * 4, d = (y * fw + x) * 4;
    out[d] = src.px[s]; out[d + 1] = src.px[s + 1]; out[d + 2] = src.px[s + 2]; out[d + 3] = src.px[s + 3];
  }
  return { W: fw, H: fh, px: out };
}

function split(file, outdir) {
  const s = decodePNG(fs.readFileSync(file));
  const n = Math.round(s.W / FW);
  fs.mkdirSync(outdir, { recursive: true });
  for (let f = 0; f < n; f++) {
    const fr = crop(s, f * FW, FW, s.H);
    fs.writeFileSync(path.join(outdir, `f${String(f).padStart(2, '0')}.png`), encodePNG(fr.W, fr.H, fr.px));
  }
  console.log(`split ${file} -> ${n} frames in ${outdir}`);
}

function join(indir, outfile) {
  const files = fs.readdirSync(indir).filter(f => /^f\d+\.png$/.test(f)).sort();
  if (!files.length) throw new Error('no fNN.png frames in ' + indir);
  const frames = files.map(f => decodePNG(fs.readFileSync(path.join(indir, f))));
  const H = frames[0].H, FWi = frames[0].W;
  const W = FWi * frames.length;
  const px = Buffer.alloc(W * H * 4);
  frames.forEach((fr, i) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < FWi; x++) {
      const s = (y * fr.W + x) * 4, d = (y * W + (i * FWi + x)) * 4;
      px[d] = fr.px[s]; px[d + 1] = fr.px[s + 1]; px[d + 2] = fr.px[s + 2]; px[d + 3] = fr.px[s + 3];
    }
  });
  fs.writeFileSync(outfile, encodePNG(W, H, px));
  console.log(`joined ${files.length} frames -> ${outfile}`);
}

const [cmd, a, b] = process.argv.slice(2);
if (cmd === 'split') split(a, b);
else if (cmd === 'join') join(a, b);
else console.error('usage: frames.js split <strip.png> <outdir>  |  join <indir> <strip.png>');

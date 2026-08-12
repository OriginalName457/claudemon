#!/usr/bin/env node
'use strict';
// Removes stray "ground shadow" blobs from creature sprite sheets: small
// opaque islands that sit near the feet, disconnected from the main body.
// Works per 48px frame; keeps the largest connected component, and erases any
// other component that is small AND sits in the lower part of the frame.
//
// Usage: node scripts/declutter.js web/assets/cactuskid.png ...

const fs = require('fs');
const { decodePNG, encodePNG } = require('./img');

const FW = 48;

function components(px, W, fx, fw, fh) {
  const seen = new Int32Array(fw * fh).fill(-1);
  const comps = [];
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
    const li = y * fw + x;
    if (seen[li] !== -1) continue;
    const gi = (y * W + (fx + x)) * 4;
    if (px[gi + 3] < 128) { seen[li] = -2; continue; } // transparent
    // BFS
    const id = comps.length; const cells = []; let sumY = 0;
    const stack = [[x, y]]; seen[li] = id;
    while (stack.length) {
      const [cx, cy] = stack.pop(); cells.push([cx, cy]); sumY += cy;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= fw || ny >= fh) continue;
        const nl = ny * fw + nx; if (seen[nl] !== -1) continue;
        const ngi = (ny * W + (fx + nx)) * 4;
        if (px[ngi + 3] < 128) { seen[nl] = -2; continue; }
        seen[nl] = id; stack.push([nx, ny]);
      }
    }
    comps.push({ id, cells, size: cells.length, cy: sumY / cells.length });
  }
  return comps;
}

function declutter(file) {
  const s = decodePNG(fs.readFileSync(file));
  const frames = Math.round(s.W / FW);
  let removed = 0;
  for (let f = 0; f < frames; f++) {
    const comps = components(s.px, s.W, f * FW, FW, s.H);
    if (comps.length < 2) continue;
    const largest = comps.reduce((a, b) => b.size > a.size ? b : a);
    for (const c of comps) {
      if (c === largest) continue;
      // erase small islands sitting in the lower 55% of the frame (shadows)
      if (c.size <= largest.size * 0.3 && c.cy > s.H * 0.45) {
        for (const [x, y] of c.cells) s.px[(y * s.W + (f * FW + x)) * 4 + 3] = 0;
        removed += c.size;
      }
    }
  }
  fs.writeFileSync(file, encodePNG(s.W, s.H, s.px));
  return removed;
}

const files = process.argv.slice(2);
if (!files.length) { console.error('usage: node scripts/declutter.js <png>...'); process.exit(1); }
for (const f of files) {
  try { console.log(`${f}: removed ${declutter(f)} stray shadow px`); }
  catch (e) { console.error(f, 'ERROR', e.message); }
}

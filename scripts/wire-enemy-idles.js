'use strict';
// Wire idle animations into species: copy web/assets/_anim/<id>-idle.png over each
// species' sprite.sheet, and patch that entry's `frames` in src/species.js to match.
// Walk cycles stay in _anim/<id>-walk-{right,left}.png by convention (like the roster).
//   node scripts/wire-enemy-idles.js <id...>
const fs = require('fs');
const path = require('path');
const { decodePNG } = require('./img');
const species = require('../src/species');

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'web', 'assets');
const ANIM = path.join(ASSETS, '_anim');
const SPFILE = path.join(ROOT, 'src', 'species.js');

const ids = process.argv.slice(2);
if (!ids.length) { console.error('usage: node scripts/wire-enemy-idles.js <id...>'); process.exit(1); }

let src = fs.readFileSync(SPFILE, 'utf8');

for (const id of ids) {
  const sp = species.get(id);
  if (!sp) { console.log(`[${id}] not a species — skip`); continue; }
  const idle = path.join(ANIM, `${id}-idle.png`);
  if (!fs.existsSync(idle)) { console.log(`[${id}] no idle anim — skip`); continue; }
  const im = decodePNG(fs.readFileSync(idle));
  const fh = im.H, frames = Math.max(1, Math.round(im.W / fh));
  // copy idle strip over the species' current sheet path
  const dest = path.join(ASSETS, sp.sprite.sheet);
  fs.copyFileSync(idle, dest);
  // patch this entry's block: set frames: N and frameW/frameH: fh
  const key = `\n  ${id}: {`;
  const start = src.indexOf(key);
  if (start < 0) { console.log(`[${id}] entry not found in source — copied art but frames NOT patched`); continue; }
  const end = src.indexOf('\n  },', start);
  let block = src.slice(start, end);
  block = block
    .replace(/frames:\s*\d+/, `frames: ${frames}`)
    .replace(/frameW:\s*\d+/, `frameW: ${fh}`)
    .replace(/frameH:\s*\d+/, `frameH: ${fh}`);
  src = src.slice(0, start) + block + src.slice(end);
  console.log(`[${id}] wired — ${frames}f @ ${fh}px -> ${sp.sprite.sheet}`);
}

fs.writeFileSync(SPFILE, src);
console.log('species.js updated.');

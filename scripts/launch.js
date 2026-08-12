#!/usr/bin/env node
'use strict';
// The Claudemon launch flow — transform your terminal into the handheld.
// Boots a standalone server if none is running, opens the chromeless window,
// and on the FIRST launch offers to drop a shortcut on your desktop.

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { launch } = require('../src/launcher');
const { createShortcut } = require('./shortcut');

const PORT = Number(process.env.CLAUDEMON_PORT || 4573);
const MARKER = path.join(__dirname, '..', 'state', '.launched');

function askShortcut() {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) return resolve(false);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('  🖥️  Add a Claudemon shortcut to your desktop? [Y/n] ', (a) => { rl.close(); resolve(!/^\s*n/i.test(a)); });
  });
}

(async () => {
  console.log('\n  🎮  Launching Claudemon — transforming your terminal into the handheld…');
  try { await launch(PORT); } catch (e) { console.error('  launch failed:', e.message); process.exit(1); }
  console.log(`  ✓  your handheld is open (localhost:${PORT}). your crew is standing by. 🦀\n`);

  if (!fs.existsSync(MARKER)) {
    try { fs.mkdirSync(path.dirname(MARKER), { recursive: true }); fs.writeFileSync(MARKER, new Date().toISOString()); } catch {}
    if (await askShortcut()) {
      try { const where = await createShortcut(); console.log(`  ✓  shortcut added — open Claudemon any time from:\n     ${where}\n`); }
      catch (e) { console.log('  (couldn’t add the shortcut: ' + e.message + ')\n'); }
    } else if (process.stdin.isTTY) {
      console.log('  no worries — add one later with `npm run shortcut`.\n');
    } else {
      console.log('  tip: `npm run shortcut` drops a desktop icon.\n');
    }
  }
  process.exit(0);
})();

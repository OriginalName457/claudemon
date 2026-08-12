#!/usr/bin/env node
'use strict';
// Add (or remove) a desktop shortcut / icon that launches Claudemon — so people
// can open their handheld from the desktop, not just the terminal.
// Cross-platform: Windows (.lnk via WScript, launched hidden), macOS (.command),
// Linux (.desktop).  Usage: node scripts/shortcut.js [--remove]

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LAUNCH = path.join(ROOT, 'scripts', 'launch.js');
const VBS = path.join(ROOT, 'Claudemon.vbs');
const NAME = 'Claudemon';

function desktop() {
  const d = path.join(os.homedir(), 'Desktop');
  try { if (fs.existsSync(d)) return d; } catch {}
  return os.homedir();
}
function ps(cmd) {
  return new Promise((resolve, reject) => {
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], { windowsHide: true });
    let err = ''; p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err.trim() || ('powershell exit ' + code)))));
  });
}

async function createShortcut() {
  const dt = desktop();
  if (process.platform === 'win32') {
    // a tiny hidden launcher so there's no console flash
    const vbs = 'Set s = CreateObject("WScript.Shell")\r\n' +
      's.CurrentDirectory = "' + ROOT.replace(/"/g, '""') + '"\r\n' +
      's.Run "cmd /c node ""scripts\\launch.js""", 0, False\r\n';
    fs.writeFileSync(VBS, vbs);
    const lnk = path.join(dt, NAME + '.lnk');
    await ps([
      '$W = New-Object -ComObject WScript.Shell',
      "$S = $W.CreateShortcut('" + lnk.replace(/'/g, "''") + "')",
      "$S.TargetPath = 'wscript.exe'",
      '$S.Arguments = \'"' + VBS.replace(/'/g, "''") + '"\'',
      "$S.WorkingDirectory = '" + ROOT.replace(/'/g, "''") + "'",
      "$S.Description = 'Claudemon — your pixel-pet crew'",
      '$S.Save()',
    ].join('; '));
    return lnk;
  }
  if (process.platform === 'darwin') {
    const cmd = path.join(dt, NAME + '.command');
    fs.writeFileSync(cmd, `#!/bin/bash\ncd "${ROOT}"\nnode "${LAUNCH}"\n`);
    fs.chmodSync(cmd, 0o755);
    return cmd;
  }
  const desk = path.join(dt, NAME + '.desktop');
  fs.writeFileSync(desk, `[Desktop Entry]\nType=Application\nName=Claudemon\nComment=Your pixel-pet crew\nExec=node "${LAUNCH}"\nPath=${ROOT}\nTerminal=false\nCategories=Development;\n`);
  try { fs.chmodSync(desk, 0o755); } catch {}
  return desk;
}

function removeShortcut() {
  const dt = desktop();
  const targets = [path.join(dt, NAME + '.lnk'), path.join(dt, NAME + '.command'), path.join(dt, NAME + '.desktop'), VBS];
  let removed = [];
  for (const t of targets) { try { if (fs.existsSync(t)) { fs.unlinkSync(t); removed.push(t); } } catch {} }
  return removed;
}

module.exports = { createShortcut, removeShortcut };

if (require.main === module) {
  (async () => {
    if (process.argv.includes('--remove')) {
      const r = removeShortcut();
      console.log(r.length ? '✓ removed:\n  ' + r.join('\n  ') : 'nothing to remove');
    } else {
      try { const w = await createShortcut(); console.log('✓ Claudemon shortcut added:\n  ' + w); }
      catch (e) { console.error('could not add shortcut:', e.message); process.exit(1); }
    }
  })();
}

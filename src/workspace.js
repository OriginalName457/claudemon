'use strict';
// The crew's WORKSPACE — one tidy home on disk where your Claudemon build finished
// products, each task in its own named project folder, so you can find, use, and
// show them. Default: ~/Claudemon/workspace (override persisted in state).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const state = require('./state');

const DEFAULT_ROOT = path.join(os.homedir(), 'Claudemon', 'workspace');

function root() {
  let r = DEFAULT_ROOT;
  try { const w = state.read().workspaceRoot; if (w && typeof w === 'string') r = w; } catch {}
  try { fs.mkdirSync(r, { recursive: true }); } catch {}
  return r;
}

function setRoot(dir) {
  if (!dir || typeof dir !== 'string') throw new Error('need a folder path');
  const abs = path.resolve(dir);
  fs.mkdirSync(abs, { recursive: true });
  state.mutate((s) => { s.workspaceRoot = abs; });
  return abs;
}

const slug = (name) => String(name || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'project';

// How many files a project folder holds (recursive, capped so huge trees stay fast).
function countFiles(dir, cap = 500) {
  let n = 0;
  const walk = (d) => {
    if (n >= cap) return;
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (n >= cap) return;
      if (e.name === '.git' || e.name === 'node_modules') continue;
      if (e.isDirectory()) walk(path.join(d, e.name));
      else n++;
    }
  };
  walk(dir);
  return n;
}

// List every project folder in the workspace, newest first.
function list() {
  const r = root();
  let ents = [];
  try { ents = fs.readdirSync(r, { withFileTypes: true }); } catch { return []; }
  return ents.filter((e) => e.isDirectory()).map((e) => {
    const p = path.join(r, e.name);
    let updated = 0; try { updated = fs.statSync(p).mtimeMs; } catch {}
    return { name: e.name, path: p, files: countFiles(p), updated };
  }).sort((a, b) => b.updated - a.updated);
}

// Make a fresh, clearly-named project folder (with a starter README so it's never
// empty) and hand back its path — where a crew task can build.
function newProject(name) {
  const r = root();
  let base = slug(name), dir = path.join(r, base), i = 2;
  while (fs.existsSync(dir)) { dir = path.join(r, `${base}-${i++}`); }
  fs.mkdirSync(dir, { recursive: true });
  const title = String(name || base).trim() || base;
  try { fs.writeFileSync(path.join(dir, 'README.md'), `# ${title}\n\nA Claudemon crew project.\n`); } catch {}
  return { name: path.basename(dir), path: dir };
}

// Reveal a folder in the OS file manager — but ONLY inside the workspace.
function reveal(target) {
  const r = root();
  const abs = path.resolve(target || r);
  if (abs !== r && !abs.startsWith(r + path.sep)) throw new Error('outside the workspace');
  try {
    if (process.platform === 'win32') spawn('explorer', [abs], { detached: true, stdio: 'ignore' }).unref();
    else if (process.platform === 'darwin') spawn('open', [abs], { detached: true, stdio: 'ignore' }).unref();
    else spawn('xdg-open', [abs], { detached: true, stdio: 'ignore' }).unref();
  } catch { /* best effort */ }
  return abs;
}

module.exports = { root, setRoot, list, newProject, reveal, DEFAULT_ROOT };

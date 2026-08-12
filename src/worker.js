#!/usr/bin/env node
'use strict';
// CLAUDEMON WORKER (CLI). Usually you don't need this — just launch the app on another
// computer on the same network and it auto-appears. This is the manual fallback:
//   node src/worker.js --hub http://<hub-ip>:4573 --token <token> [--name "Laptop"] [--dir <folder>]

const os = require('os');
const { spawnSync } = require('child_process');
const { startWorker } = require('./workerclient');
const { claudeBin } = require('./lounge');

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const HUB = opt('hub', process.env.CLAUDEMON_HUB || 'http://127.0.0.1:4573');
const TOKEN = opt('token', process.env.CLAUDEMON_TOKEN || '');
const NAME = opt('name', os.hostname());
const DIR = opt('dir', '');
const log = (...a) => console.error('[worker]', ...a);

// preflight: this machine must have Node 24+ and the claude CLI (logged in)
if (parseInt(process.versions.node, 10) < 24) log(`⚠ Node ${process.versions.node} — Claudemon needs Node 24+.`);
const bin = claudeBin();
let claudeOk = bin !== 'claude';
if (!claudeOk) { try { claudeOk = spawnSync('claude', ['--version'], { shell: true, timeout: 8000 }).status === 0; } catch {} }
if (!claudeOk) log('⚠ the `claude` CLI was not found here. Run  npm install  (then `claude login`).');
else log(`claude CLI: ${bin === 'claude' ? 'on PATH' : bin} ✓`);

log(`starting… hub=${HUB} name="${NAME}"`);
startWorker({ hub: HUB, token: TOKEN, name: NAME, dir: DIR, log });
process.on('uncaughtException', (e) => log('uncaught (kept alive):', e && e.message));

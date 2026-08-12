'use strict';
// Launches the Claudemon desktop window: a chromeless Chromium "app window"
// (Edge or Chrome in --app mode) so it looks like its own little application,
// not a browser tab. Also can boot a standalone server if none is running.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PROFILE_DIR = path.join(__dirname, '..', 'state', 'window-profile');

// Candidate Chromium browsers, in preference order.
function findBrowser() {
  const envRoots = [process.env['PROGRAMFILES'], process.env['PROGRAMFILES(X86)'], process.env['LOCALAPPDATA']].filter(Boolean);
  const rel = [
    ['Google', 'Chrome', 'Application', 'chrome.exe'],
    ['Microsoft', 'Edge', 'Application', 'msedge.exe'],
    ['BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'],
  ];
  for (const r of rel) {
    for (const root of envRoots) {
      const p = path.join(root, ...r);
      try { if (fs.existsSync(p)) return p; } catch {}
    }
  }
  return null;
}

// Is the tank server already responding on this port?
function serverUp(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/state', timeout: 700 }, (res) => {
      res.resume(); resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

// Start a detached standalone server if none is running, then wait for it.
async function ensureServer(port) {
  if (await serverUp(port)) return true;
  const child = spawn(process.execPath, [path.join(__dirname, 'standalone.js')], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, CLAUDEMON_PORT: String(port) },
  });
  child.unref();
  // poll for up to ~5s
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 200));
    if (await serverUp(port)) return true;
  }
  return false;
}

// Size the window to snugly hug the handheld at the user's SAVED layout
// (web/assets/layout.json). Wider so the biome screen is full-width, and only
// as tall as the tuned case needs — the "shorter, fatter" fit the user dialed in.
function windowSize() {
  let deviceH = 553, scale = 1.3;
  try {
    const L = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'web', 'assets', 'layout.json'), 'utf8'));
    if (L.deviceH) deviceH = L.deviceH;
    if (L.scale) scale = L.scale;
  } catch {}
  const w = Math.max(668, Math.round(480 * scale) + 46);   // enough width for the full 480px-wide device
  const h = Math.round(deviceH * scale) + 56;              // case height + page padding + title bar
  return `${w},${h}`;
}

// Open the chromeless app window.
function openWindow(port) {
  return new Promise((resolve, reject) => {
    const url = `http://localhost:${port}/`;
    const browser = findBrowser();
    const args = [
      `--app=${url}`,
      `--user-data-dir=${PROFILE_DIR}`,
      `--window-size=${windowSize()}`,
      '--window-position=200,40',
      '--no-first-run',
      '--no-default-browser-check',
    ];
    try {
      if (browser) {
        const c = spawn(browser, args, { detached: true, stdio: 'ignore' });
        c.on('error', reject);
        c.unref();
      } else if (process.platform === 'win32') {
        // No Chromium found — fall back to opening in the default browser.
        spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
      } else if (process.platform === 'darwin') {
        spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
      } else {
        spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
      }
      resolve(true);
    } catch (e) { reject(e); }
  });
}

// Full launch: ensure server, then open the window.
async function launch(port) {
  await ensureServer(port);
  await openWindow(port);
}

module.exports = { openWindow, ensureServer, launch, findBrowser, serverUp };

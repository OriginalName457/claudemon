#!/usr/bin/env node
'use strict';
// Minimal PixelLab API client for Claudemon. Reads the token from
// ../.pixellab-key (never printed). Usage:
//   node scripts/pixellab.js balance
//   node scripts/pixellab.js character <slug> "<description>" [WxH] [view]
//   node scripts/pixellab.js job <job_id>
//   node scripts/pixellab.js animate <slug> <character_id> <action>
// Character/animation results are saved under ../web/assets/_pixellab/.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'web', 'assets', '_pixellab');
const BASE = process.env.PIXELLAB_BASE || 'https://api.pixellab.ai/v2';

function key() {
  const k = fs.readFileSync(path.join(ROOT, '.pixellab-key'), 'utf8').trim();
  if (!k) throw new Error('.pixellab-key is empty');
  return k;
}

async function api(method, p, body) {
  const res = await fetch(BASE + p, {
    method,
    headers: { 'Authorization': 'Bearer ' + key(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) { const e = new Error(`HTTP ${res.status} ${p}: ${text.slice(0, 400)}`); e.status = res.status; e.body = json; throw e; }
  return json;
}

function saveB64(file, b64) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const data = b64.includes(',') ? b64.split(',')[1] : b64;
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  return file;
}

async function cmdBalance() {
  const b = await api('GET', '/balance');
  console.log(JSON.stringify(b, null, 2));
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function pollJob(jobId, label = 'job') {
  for (let i = 0; i < 60; i++) {
    const r = await api('GET', `/background-jobs/${jobId}`);
    const st = r.status || (r.last_response ? 'completed' : 'processing');
    if (st === 'completed' || st === 'success' || st === 'done') return r;
    if (st === 'failed' || st === 'error') throw new Error(`${label} failed: ${JSON.stringify(r).slice(0, 300)}`);
    process.stderr.write(`  ${label} ${st}... (${i})\r`);
    await sleep(2500);
  }
  throw new Error(`${label} timed out`);
}

// Recursively find base64 image strings keyed by direction/frame in a response.
function extractImages(obj, acc = {}) {
  if (!obj || typeof obj !== 'object') return acc;
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && v.length > 200 && /^[A-Za-z0-9+/=,:]+$/.test(v.slice(0, 40))) acc[k] = v;
    else if (v && typeof v === 'object') {
      if (typeof v.base64 === 'string') acc[k] = v.base64;
      else if (typeof v.image === 'string') acc[k] = v.image;
      else extractImages(v, acc);
    }
  }
  return acc;
}

async function cmdCharacter(slug, description, size = '64x64', view = 'side') {
  const [w, h] = size.split('x').map(Number);
  const body = { description, image_size: { width: w, height: h }, view };
  console.log(`creating character "${slug}" (${w}x${h}, view=${view})...`);
  const r = await api('POST', '/create-character-with-4-directions', body);
  const dir = path.join(OUT, slug);
  fs.mkdirSync(dir, { recursive: true });
  let result = r;
  if (r.background_job_id) {
    console.log('  async job', r.background_job_id, '- polling...');
    result = await pollJob(r.background_job_id, slug);
  }
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ character_id: r.character_id, job: r.background_job_id }, null, 2));
  const imgs = extractImages(result.last_response || result.images || result);
  const saved = [];
  for (const [k, b64] of Object.entries(imgs)) saved.push(saveB64(path.join(dir, `${k}.png`), b64));
  if (saved.length) console.log('saved:', saved.map(s => path.relative(ROOT, s)).join(', '));
  else console.log('NO IMAGES found. response keys:', Object.keys(result).join(','), '\n', JSON.stringify(result).slice(0, 600));
}

async function cmdJob(id) {
  const r = await api('GET', `/background-jobs/${id}`);
  console.log('status:', r.status);
  console.log(JSON.stringify(r, null, 2).slice(0, 1200));
}

(async () => {
  const [cmd, ...args] = process.argv.slice(2);
  try {
    if (cmd === 'balance') await cmdBalance();
    else if (cmd === 'character') await cmdCharacter(args[0], args[1], args[2], args[3]);
    else if (cmd === 'job') await cmdJob(args[0]);
    else console.log('commands: balance | character <slug> "<desc>" [WxH] [view] | job <id>');
  } catch (e) {
    console.error('ERROR', e.status || '', e.message);
    process.exit(1);
  }
})();

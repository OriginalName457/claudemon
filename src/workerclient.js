'use strict';
// The worker CLIENT: connects OUT to a hub, receives jobs, runs a real `claude` locally,
// and streams events back. Used both by the standalone worker process (src/worker.js) and
// by the app itself when another computer "adopts" it over the LAN (no copy-paste).

const os = require('os');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { URL } = require('url');

// Start a worker loop against a hub. Returns a handle with .stop(). Safe to call many
// times (each is an independent connection). `log` defaults to console.error.
function startWorker({ hub, token, name, dir, log } = {}) {
  log = log || ((...a) => console.error('[worker]', ...a));
  const HUB = String(hub || '').replace(/\/+$/, '');
  const u = new URL(HUB);
  const PORT = Number(u.port || (u.protocol === 'https:' ? 443 : 80));
  const NAME = name || os.hostname();
  const WORKDIR = path.resolve(dir || path.join(os.homedir(), 'claudemon-work'));
  try { fs.mkdirSync(WORKDIR, { recursive: true }); } catch {}

  process.env.CLAUDEMON_HOME = process.env.CLAUDEMON_HOME || path.join(os.homedir(), '.claudemon');
  const agent = require('./agent');
  const species = require('./species');
  agent.setBridge(PORT, token);   // hand-offs reach the hub (best effort)

  const jobs = new Map();   // hub jobId -> local session id
  let NODE = null, alive = true, hb = null;

  function api(method, pth, body) {
    return new Promise((resolve) => {
      const data = body ? JSON.stringify(body) : null;
      const req = http.request({ host: u.hostname, port: PORT, path: pth, method, headers: Object.assign({ 'Content-Type': 'application/json', 'X-Lab-Token': token }, data ? { 'Content-Length': Buffer.byteLength(data) } : {}) },
        (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); } }); });
      req.on('error', () => resolve({ error: 'unreachable' })); if (data) req.write(data); req.end();
    });
  }
  function runJob(job) {
    if (!species.get(job.creatureId)) return;
    const cwd = (job.cwd && fs.existsSync(job.cwd)) ? job.cwd : WORKDIR;
    const s = agent.spawnSession({ creatureId: job.creatureId, cwd, mode: job.mode || 'auto', task: job.task, fresh: true });
    jobs.set(job.jobId, s.id);
    for (const ev of s.events) api('POST', '/api/node/event', { node: NODE, jobId: job.jobId, event: ev });
    s.listeners.add((ev) => { api('POST', '/api/node/event', { node: NODE, jobId: job.jobId, event: ev }); });
    log(`running ${job.creatureId} in ${cwd}`);
  }
  function stopJob(jobId) { const sid = jobs.get(jobId); if (sid) { try { agent.stop(sid); } catch {} } }

  function openStream() {
    if (!alive) return;
    const req = http.request({ host: u.hostname, port: PORT, path: `/api/node/stream?node=${NODE}&token=${encodeURIComponent(token)}`, method: 'GET' }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return setTimeout(connect, 3000); }   // stale/forgot → re-register
      res.setEncoding('utf8'); let buf = '';
      res.on('data', (ch) => { buf += ch; let nl; while ((nl = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, nl); buf = buf.slice(nl + 1); if (!line.startsWith('data:')) continue; let m; try { m = JSON.parse(line.slice(5).trim()); } catch { continue; } if (m.stop) stopJob(m.stop); else if (m.jobId) runJob(m); } });
      res.on('end', () => { if (alive) setTimeout(openStream, 3000); });
    });
    req.on('error', () => { if (alive) setTimeout(openStream, 3000); });
    req.end();
  }
  async function connect() {
    if (!alive) return;
    const reg = await api('POST', '/api/node/register', { name: NAME, platform: process.platform });
    if (!reg || !reg.nodeId) { log(`can't reach hub at ${HUB} — retrying`); return setTimeout(connect, 5000); }
    NODE = reg.nodeId;
    log(`joined ${HUB} as "${NAME}" [${NODE}] — working in ${WORKDIR}`);
    openStream();
    clearInterval(hb); hb = setInterval(() => api('POST', '/api/node/heartbeat', { node: NODE }), 10000);
  }
  connect();
  return { stop() { alive = false; clearInterval(hb); }, get node() { return NODE; }, hub: HUB };
}

module.exports = { startWorker };

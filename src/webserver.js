'use strict';
// The Claudemon tank web server, as a reusable module.
// Used by both the MCP server (src/server.js) and the standalone desktop
// app (src/standalone.js).

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const state = require('./state');
const lounge = require('./lounge');
const lab = require('./lab');
const shop = require('./shop');
const species = require('./species');
const agent = require('./agent');
const worktree = require('./worktree');
const workspace = require('./workspace');
const projects = require('./projects');
const boxes = require('./boxes');
const mcpreg = require('./mcpreg');
const nodes = require('./nodes');
const discovery = require('./discovery');
const achievements = require('./achievements');
const { startWorker } = require('./workerclient');
const voice = require('./voice');
const { pickFolder } = require('./pickfolder');

// Same-origin token for sensitive endpoints (lab). Pages served by this
// server can read it; cross-origin pages can't (no CORS), and the custom
// header requirement makes drive-by localhost POSTs fail preflight.
const LAB_TOKEN = crypto.randomBytes(16).toString('hex');
let SERVER_PORT = 4573, BOUND_HOST = '127.0.0.1';

// The LAN address + one-liner another computer runs to join as a node.
function lanIP() {
  try { const ifs = os.networkInterfaces(); for (const name of Object.keys(ifs)) for (const i of ifs[name]) if (i.family === 'IPv4' && !i.internal) return i.address; } catch {}
  return '127.0.0.1';
}
// A stable identity for THIS computer (so peers don't see it as a new machine each launch).
const INSTANCE = (() => {
  try {
    const f = path.join(state.HOME, 'instance.json');
    let o; try { o = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { o = { id: crypto.randomBytes(5).toString('hex') }; try { fs.mkdirSync(state.HOME, { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); } catch {} }
    o.name = o.name || os.hostname(); return o;
  } catch { return { id: crypto.randomBytes(5).toString('hex'), name: os.hostname() }; }
})();

// Workers WE started (because another computer adopted us). Keyed by hub URL, so we
// don't connect to the same hub twice.
const adoptedTo = new Map();
function adopt(hub, token, name) {
  hub = String(hub || '').replace(/\/+$/, '');
  if (!hub || adoptedTo.has(hub)) return false;
  try { adoptedTo.set(hub, startWorker({ hub, token: token || '', name: INSTANCE.name })); return true; } catch { return false; }
}
// server-to-server POST (avoids browser cross-origin when reaching a peer)
function postTo(host, port, pth, body) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body || {});
    const req = http.request({ host, port, path: pth, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }, timeout: 6000 },
      (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); } }); });
    req.on('error', () => resolve({ error: 'unreachable' })); req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout' }); });
    req.write(data); req.end();
  });
}

function beamInfo() {
  const ip = lanIP();
  const cmd = `node src/worker.js --hub http://${ip}:${SERVER_PORT} --token ${LAB_TOKEN} --name "My Computer"`;
  return {
    ip, port: SERVER_PORT, token: LAB_TOKEN, open: BOUND_HOST === '0.0.0.0', cmd,
    steps: [
      'Get Claudemon onto that computer (copy this folder, or clone the repo).',
      'In that folder run  npm install  — it installs everything the worker needs, including the claude CLI.',
      'Sign it in once:  claude login',
      'Join your tank:',
    ],
  };
}

const WEB_DIR = path.join(__dirname, '..', 'web');
const PATHS_FILE = path.join(WEB_DIR, 'assets', 'paths.json');
const LAYOUT_FILE = path.join(WEB_DIR, 'assets', 'layout.json');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2' };

function serveStatic(res, file) {
  const full = path.join(WEB_DIR, file);
  if (!full.startsWith(WEB_DIR)) { res.writeHead(403); return res.end('nope'); }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    const ext = path.extname(full);
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
    // never cache HTML so it always references the current asset versions
    if (ext === '.html') headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    res.writeHead(200, headers);
    res.end(data);
  });
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

// Start the tank server. Returns the http.Server (or null if the port is busy,
// meaning another Claudemon instance is already serving it).
function startTank(port, log = () => {}) {
  agent.setBridge(port, LAB_TOKEN);   // so the Manual-mode permission bridge can reach us
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (url.pathname === '/api/state') {
      const snap = state.snapshot();
      snap.tank = { ...snap.tank, ...shop.tierDims(snap.tank.tier) };
      return json(res, 200, snap);
    }
    if (url.pathname === '/api/species') return json(res, 200, { species: species.all().map((sp) => Object.assign({}, sp, { kit: species.kit(sp.id), emotes: require('./emotes').EMOTES[sp.id] || null })), rarity: species.RARITY, eggs: species.EGGS });
    if (url.pathname === '/api/start' && req.method === 'POST') {
      if (req.headers['x-lab-token'] !== LAB_TOKEN) return json(res, 403, { error: 'bad token' });
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        let biome = '';
        try { biome = JSON.parse(body || '{}').biome; } catch {}
        try { state.chooseStarter(biome); return json(res, 200, state.snapshot()); }
        catch (e) { return json(res, 400, { error: String(e.message || e) }); }
      });
      return;
    }
    // start over: wipe the save so the egg intro shows again (settings → new game)
    if (url.pathname === '/api/reset' && req.method === 'POST') {
      if (req.headers['x-lab-token'] !== LAB_TOKEN) return json(res, 403, { error: 'bad token' });
      try { fs.unlinkSync(state.FILE); } catch {}
      return json(res, 200, { ok: true });
    }
    if (url.pathname === '/api/shop') return json(res, 200, shop.catalog());
    if (url.pathname === '/api/shop/switch' && req.method === 'POST') {
      if (req.headers['x-lab-token'] !== LAB_TOKEN) return json(res, 403, { error: 'bad token' });
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        let biome = '';
        try { biome = JSON.parse(body || '{}').biome; } catch {}
        try { return json(res, 200, shop.switchBiome(biome)); }
        catch (e) { return json(res, 400, { error: String(e.message || e) }); }
      });
      return;
    }
    if (url.pathname === '/api/shop/buy' && req.method === 'POST') {
      if (req.headers['x-lab-token'] !== LAB_TOKEN) return json(res, 403, { error: 'bad token' });
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        let item = '';
        try { item = JSON.parse(body || '{}').item; } catch {}
        try { return json(res, 200, shop.buy(item)); }
        catch (e) { return json(res, 400, { error: String(e.message || e) }); }
      });
      return;
    }
    // ---- tanks & main creature ----
    if (url.pathname === '/api/tanks') return json(res, 200, state.tanksView());
    if (url.pathname === '/api/main' && req.method === 'POST') {
      if (req.headers['x-lab-token'] !== LAB_TOKEN) return json(res, 403, { error: 'bad token' });
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        let id = '';
        try { id = JSON.parse(body || '{}').id; } catch {}
        try { state.setMain(id); return json(res, 200, state.snapshot()); }
        catch (e) { return json(res, 400, { error: String(e.message || e) }); }
      });
      return;
    }
    if (url.pathname === '/api/tank' && req.method === 'POST') {
      if (req.headers['x-lab-token'] !== LAB_TOKEN) return json(res, 403, { error: 'bad token' });
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        let biome = '', ids = [];
        try { const b = JSON.parse(body || '{}'); biome = b.biome; ids = b.ids || []; } catch {}
        try { state.setTankOccupants(biome, ids); return json(res, 200, state.tanksView()); }
        catch (e) { return json(res, 400, { error: String(e.message || e) }); }
      });
      return;
    }
    // your Main (or a chosen creature) greeting you — continuity if you have history
    if (url.pathname === '/api/greeting') {
      const snap = state.snapshot();
      let id = url.searchParams.get('id');
      if (!id || !species.get(id)) id = snap.main;
      const sp = species.get(id) || {};
      let continuity = false; try { continuity = !!state.greetingFor(id); } catch {}
      return json(res, 200, { id, name: sp.name || snap.name, emoji: sp.emoji || snap.emoji, text: state.welcomeLine(id), continuity });
    }
    // ---- PROJECTS: the folders the crew has worked in (active / archived) ----
    if (url.pathname === '/api/projects') return json(res, 200, { projects: projects.list() });
    if (url.pathname === '/api/projects/status' && req.method === 'POST') {
      if (req.headers['x-lab-token'] !== LAB_TOKEN) return json(res, 403, { error: 'bad token' });
      let body = ''; req.on('data', (d) => (body += d));
      req.on('end', () => { let b = {}; try { b = JSON.parse(body || '{}'); } catch {} if (b.path) projects.setStatus(b.path, b.status); return json(res, 200, { ok: true }); });
      return;
    }
    // add an existing folder to the projects list (so past work shows up)
    if (url.pathname === '/api/projects/add' && req.method === 'POST') {
      if (req.headers['x-lab-token'] !== LAB_TOKEN) return json(res, 403, { error: 'bad token' });
      let body = ''; req.on('data', (d) => (body += d));
      req.on('end', () => { let b = {}; try { b = JSON.parse(body || '{}'); } catch {} if (!b.path || !fs.existsSync(b.path)) return json(res, 400, { error: 'folder not found' }); projects.note(b.path, {}); return json(res, 200, { ok: true }); });
      return;
    }
    if (url.pathname === '/api/projects/forget' && req.method === 'POST') {
      if (req.headers['x-lab-token'] !== LAB_TOKEN) return json(res, 403, { error: 'bad token' });
      let body = ''; req.on('data', (d) => (body += d));
      req.on('end', () => { let b = {}; try { b = JSON.parse(body || '{}'); } catch {} if (b.path) projects.forget(b.path); return json(res, 200, { ok: true }); });
      return;
    }
    // read a saved session transcript (the readable .md log) by session id
    if (url.pathname === '/api/log') {
      const id = url.searchParams.get('id');
      if (!id) return json(res, 400, { error: 'no id' });
      const dir = path.join(state.HOME, 'logs');
      let file = null; try { file = fs.readdirSync(dir).find((f) => f.endsWith(id + '.md')); } catch {}
      let text = ''; if (file) { try { text = fs.readFileSync(path.join(dir, file), 'utf8'); } catch {} }
      return json(res, 200, { text });
    }
    // ---- THE WORKSPACE: the crew's tidy home for finished products ----
    if (url.pathname === '/api/workspace') return json(res, 200, { root: workspace.root(), projects: workspace.list() });
    if (url.pathname === '/api/workspace/new' && req.method === 'POST') {
      if (req.headers['x-lab-token'] !== LAB_TOKEN) return json(res, 403, { error: 'bad token' });
      let body = ''; req.on('data', (d) => (body += d));
      req.on('end', () => { let b = {}; try { b = JSON.parse(body || '{}'); } catch {} try { return json(res, 200, workspace.newProject(b.name)); } catch (e) { return json(res, 400, { error: e.message }); } });
      return;
    }
    if (url.pathname === '/api/workspace/reveal' && req.method === 'POST') {
      if (req.headers['x-lab-token'] !== LAB_TOKEN) return json(res, 403, { error: 'bad token' });
      let body = ''; req.on('data', (d) => (body += d));
      req.on('end', () => { let b = {}; try { b = JSON.parse(body || '{}'); } catch {} try { return json(res, 200, { path: workspace.reveal(b.path) }); } catch (e) { return json(res, 400, { error: e.message }); } });
      return;
    }
    if (url.pathname === '/api/workspace/root' && req.method === 'POST') {
      if (req.headers['x-lab-token'] !== LAB_TOKEN) return json(res, 403, { error: 'bad token' });
      let body = ''; req.on('data', (d) => (body += d));
      req.on('end', () => { let b = {}; try { b = JSON.parse(body || '{}'); } catch {} try { return json(res, 200, { root: workspace.setRoot(b.path) }); } catch (e) { return json(res, 400, { error: e.message }); } });
      return;
    }
    // ---- THE AGENT ENGINE: crew members are real Claude Code sessions ----
    if (url.pathname === '/api/crew') return json(res, 200, { crew: agent.crew() });
    // LOCAL voice: is on-device transcription available, and via which engine?
    if (url.pathname === '/api/voice/status') return json(res, 200, { available: voice.engine() !== 'none', engine: voice.engine() });
    // receive a WAV of the system mic and transcribe it on-device (no cloud)
    if (url.pathname === '/api/voice/transcribe' && req.method === 'POST') {
      if (req.headers['x-lab-token'] !== LAB_TOKEN) return json(res, 403, { error: 'bad token' });
      const chunks = [];
      req.on('data', (d) => chunks.push(d));
      req.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (!buf.length) return json(res, 400, { error: 'no audio' });
        const tmp = path.join(os.tmpdir(), `cm-voice-${Date.now()}.wav`);
        let text = '';
        try { fs.writeFileSync(tmp, buf); text = voice.transcribe(tmp) || ''; } catch {}
        try { fs.unlinkSync(tmp); } catch {}
        return json(res, 200, { text });
      });
      return;
    }
    // open the OS's native folder picker → return the chosen path
    if (url.pathname === '/api/pickfolder' && req.method === 'POST') {
      if (req.headers['x-lab-token'] !== LAB_TOKEN) return json(res, 403, { error: 'bad token' });
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', async () => {
        let start = ''; try { start = JSON.parse(body || '{}').start || ''; } catch {}
        try { return json(res, 200, { path: (await pickFolder(start)) || null }); }
        catch { return json(res, 200, { path: null }); }
      });
      return;
    }
    // quick "does this folder exist?" check (for the typed-path fallback)
    if (url.pathname === '/api/exists') {
      const p = url.searchParams.get('path');
      let exists = false, dir = false;
      try { if (p && fs.existsSync(p)) { exists = true; dir = fs.statSync(p).isDirectory(); } } catch {}
      return json(res, 200, { exists, dir });
    }
    // in-app folder browser: list a directory's subfolders so the page can navigate
    // the filesystem itself (works even when a native OS dialog can't be shown)
    // ---- ACHIEVEMENTS / unlocks (the game layer) ----
    if (url.pathname === '/api/achievements' && req.method === 'GET') {
      return json(res, 200, achievements.list());
    }

    // ---- REMOTE NODES: other computers (auto-discovered on the LAN + connected workers) ----
    if (url.pathname === '/api/nodes' && req.method === 'GET') {
      return json(res, 200, { nodes: nodes.list(), peers: discovery.list(), beam: beamInfo() });
    }
    // ask a discovered peer to join us as a worker (no copy-paste: we hand it our address+token)
    if (url.pathname === '/api/nodes/connect' && req.method === 'POST') {
      if (req.headers['x-lab-token'] !== LAB_TOKEN) return json(res, 403, { error: 'bad token' });
      let body = ''; req.on('data', (d) => (body += d));
      req.on('end', async () => {
        let b = {}; try { b = JSON.parse(body || '{}'); } catch {}
        const peer = discovery.get(b.peerId);
        if (!peer) return json(res, 404, { error: 'that computer is not on the network anymore' });
        const myHub = `http://${discovery.lanIP()}:${SERVER_PORT}`;
        const r = await postTo(peer.ip, peer.port, '/api/adopt', { hub: myHub, token: LAB_TOKEN, name: INSTANCE.name });
        return json(res, 200, { ok: !r.error, peer: peer.name, error: r.error, unlocked: r.error ? [] : achievements.bump('computers') });
      });
      return;
    }
    // a peer tells us to run its agents (LAN trust: we auto-accept from the local network)
    if (url.pathname === '/api/adopt' && req.method === 'POST') {
      let body = ''; req.on('data', (d) => (body += d));
      req.on('end', () => { let b = {}; try { b = JSON.parse(body || '{}'); } catch {} const ok = adopt(b.hub, b.token, b.name); return json(res, 200, { ok, name: INSTANCE.name }); });
      return;
    }
    if (url.pathname === '/api/node/register' && req.method === 'POST') {
      if (req.headers['x-lab-token'] !== LAB_TOKEN) return json(res, 403, { error: 'bad token' });
      let body = ''; req.on('data', (d) => (body += d));
      req.on('end', () => { let b = {}; try { b = JSON.parse(body || '{}'); } catch {} return json(res, 200, { nodeId: nodes.register(b) }); });
      return;
    }
    if (url.pathname === '/api/node/heartbeat' && req.method === 'POST') {
      if (req.headers['x-lab-token'] !== LAB_TOKEN) return json(res, 403, { error: 'bad token' });
      let body = ''; req.on('data', (d) => (body += d));
      req.on('end', () => { let b = {}; try { b = JSON.parse(body || '{}'); } catch {} return json(res, 200, { ok: nodes.beat(b.node) }); });
      return;
    }
    if (url.pathname === '/api/node/event' && req.method === 'POST') {
      if (req.headers['x-lab-token'] !== LAB_TOKEN) return json(res, 403, { error: 'bad token' });
      let body = ''; req.on('data', (d) => (body += d));
      req.on('end', () => { let b = {}; try { b = JSON.parse(body || '{}'); } catch {} nodes.beat(b.node); agent.feedRemoteEvent(b.jobId, b.event); return json(res, 200, { ok: true }); });
      return;
    }
    // a node holds this open to receive jobs (SSE); token in the query (EventSource can't set headers)
    if (url.pathname === '/api/node/stream') {
      if (url.searchParams.get('token') !== LAB_TOKEN) return json(res, 403, { error: 'bad token' });
      const nodeId = url.searchParams.get('node');
      if (!nodes.get(nodeId)) return json(res, 404, { error: 'unknown node' });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.on('error', () => {});
      const listener = (job) => { if (res.writableEnded) return; try { res.write(`data: ${JSON.stringify(job)}\n\n`); } catch {} };
      nodes.attach(nodeId, listener);
      const ka = setInterval(() => { try { res.write(': keepalive\n\n'); } catch {} }, 15000);
      req.on('close', () => { clearInterval(ka); nodes.detach(nodeId, listener); });
      return;
    }

    // ---- MCP TOOLBELT: extra servers the user grants their crew ----
    if (url.pathname === '/api/mcp' && req.method === 'GET') {
      try { return json(res, 200, { servers: mcpreg.list() }); } catch (e) { return json(res, 500, { error: String(e && e.message || e) }); }
    }
    // the user's OWN Claude Code MCP servers (inherited by every agent, like Claude Code)
    if (url.pathname === '/api/mcp/personal' && req.method === 'GET') {
      mcpreg.personal().then((inherited) => json(res, 200, { inherited })).catch(() => json(res, 200, { inherited: [] }));
      return;
    }
    if (url.pathname === '/api/mcp' && req.method === 'POST') {
      if (req.headers['x-lab-token'] !== LAB_TOKEN) return json(res, 403, { error: 'bad token' });
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => { let b = {}; try { b = JSON.parse(body || '{}'); } catch {} try { const e = mcpreg.add(b); return json(res, 200, { server: e, servers: mcpreg.list(), unlocked: achievements.bump('tools') }); } catch (err) { return json(res, 400, { error: String(err && err.message || err) }); } });
      return;
    }
    // pop the OAuth login for an MCP server (adds it directly first if a url is given)
    if (url.pathname === '/api/mcp/login' && req.method === 'POST') {
      if (req.headers['x-lab-token'] !== LAB_TOKEN) return json(res, 403, { error: 'bad token' });
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        let b = {}; try { b = JSON.parse(body || '{}'); } catch {}
        mcpreg.connect({ name: b.name, url: b.url }).then((r) => json(res, 200, r)).catch((e) => json(res, 400, { error: String(e && e.message || e) }));
      });
      return;
    }
    if ((url.pathname === '/api/mcp/remove' || url.pathname === '/api/mcp/toggle') && req.method === 'POST') {
      if (req.headers['x-lab-token'] !== LAB_TOKEN) return json(res, 403, { error: 'bad token' });
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        let b = {}; try { b = JSON.parse(body || '{}'); } catch {}
        try { const servers = url.pathname.endsWith('remove') ? mcpreg.remove(b.id) : mcpreg.toggle(b.id, b.enabled); return json(res, 200, { servers }); }
        catch (err) { return json(res, 400, { error: String(err && err.message || err) }); }
      });
      return;
    }

    // ---- BOXES: your tanks (each up to 3 Claudemon = a ready team) ----
    if (url.pathname === '/api/boxes' && req.method === 'GET') {
      try { return json(res, 200, boxes.get()); } catch (e) { return json(res, 500, { error: String(e && e.message || e) }); }
    }
    if (url.pathname === '/api/boxes' && req.method === 'POST') {
      if (req.headers['x-lab-token'] !== LAB_TOKEN) return json(res, 403, { error: 'bad token' });
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        let b = {}; try { b = JSON.parse(body || '{}'); } catch {}
        try { return json(res, 200, boxes.save(b.boxes)); } catch (e) { return json(res, 500, { error: String(e && e.message || e) }); }
      });
      return;
    }

    // ---- PLAYING: pet is off adventuring in Clawland (heartbeat toggles it) ----
    if (url.pathname === '/api/playing' && req.method === 'GET') { return json(res, 200, { playing: state.isPlaying() }); }
    if (url.pathname === '/api/playing' && req.method === 'POST') {
      let body = ''; req.on('data', (d) => (body += d));
      req.on('end', () => { let b = {}; try { b = JSON.parse(body || '{}'); } catch {} try { state.setPlaying(!!b.on); return json(res, 200, { ok: true, playing: !!b.on }); } catch (e) { return json(res, 500, { error: String(e && e.message || e) }); } });
      return;
    }
    // pet-voice toggle — whether Claude voices the pet in-character
    if (url.pathname === '/api/speak' && req.method === 'GET') { return json(res, 200, { speak: state.isSpeak() }); }
    if (url.pathname === '/api/speak' && req.method === 'POST') {
      let body = ''; req.on('data', (d) => (body += d));
      req.on('end', () => { let b = {}; try { b = JSON.parse(body || '{}'); } catch {} try { state.setSpeak(!!b.on); return json(res, 200, { ok: true, speak: !!b.on }); } catch (e) { return json(res, 500, { error: String(e && e.message || e) }); } });
      return;
    }

    // Common places to jump to in the folder picker (only the ones that exist).
    if (url.pathname === '/api/places') {
      const home = os.homedir();
      const cand = [
        { name: 'Desktop', icon: '🖥', path: path.join(home, 'Desktop') },
        { name: 'Documents', icon: '📄', path: path.join(home, 'Documents') },
        { name: 'Downloads', icon: '⬇', path: path.join(home, 'Downloads') },
        { name: 'Home', icon: '🏠', path: home },
      ];
      const places = cand.filter((p) => { try { return fs.existsSync(p.path); } catch { return false; } });
      return json(res, 200, { places, home });
    }

    if (url.pathname === '/api/listdir') {
      const win = process.platform === 'win32';
      let p = url.searchParams.get('path') || '';
      if (win && (!p || p === 'drives')) {
        const drives = [];
        for (let c = 67; c <= 90; c++) { const d = String.fromCharCode(c) + ':\\'; try { if (fs.existsSync(d)) drives.push({ name: String.fromCharCode(c) + ':', path: d }); } catch {} }
        return json(res, 200, { path: 'This PC', parent: null, dirs: drives });
      }
      const dir = p || (win ? os.homedir() : '/');
      let dirs = [];
      try {
        dirs = fs.readdirSync(dir, { withFileTypes: true })
          .filter((e) => { try { return e.isDirectory(); } catch { return false; } })
          .map((e) => ({ name: e.name, path: path.join(dir, e.name) }))
          .filter((d) => !d.name.startsWith('.') && d.name !== 'node_modules')
          .sort((a, b) => a.name.localeCompare(b.name));
      } catch {}
      let parent = path.dirname(dir);
      if (parent === dir) parent = win ? 'drives' : null;   // at a root → up goes to the drive list
      return json(res, 200, { path: dir, parent, dirs });
    }
    // the Keeper: rank owned specialists for a task
    if (url.pathname === '/api/crew/recommend') {
      const snap = state.snapshot();
      const owned = [snap.starter, ...(snap.roster || [])].filter((id, i, a) => id && species.isFriendly(id) && a.indexOf(id) === i);
      return json(res, 200, { ranked: agent.recommend(url.searchParams.get('task') || '', owned) });
    }
    // pairing: Navigator plans → hands off → Driver executes
    if (url.pathname === '/api/agent/pair' && req.method === 'POST') {
      if (req.headers['x-lab-token'] !== LAB_TOKEN) return json(res, 403, { error: 'bad token' });
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        let b = {}; try { b = JSON.parse(body || '{}'); } catch {}
        const cwd = b.cwd && fs.existsSync(b.cwd) ? b.cwd : null;
        if (!cwd) return json(res, 400, { error: 'that folder does not exist' });
        if (agent.activePairs() >= agent.MAX_PAIRS) return json(res, 429, { error: `already running ${agent.MAX_PAIRS} pairs — let one finish first` });
        let nav = b.navigatorId, drv = b.driverId;
        if (!species.get(nav) || !species.get(drv)) {
          const snap = state.snapshot();
          const owned = [snap.starter, ...(snap.roster || [])].filter((id, i, a) => id && species.isFriendly(id) && a.indexOf(id) === i);
          if (owned.length < 2) return json(res, 400, { error: 'you need two Claudémon to pair — adopt a friend first' });
          const p = agent.pickPair(owned);
          nav = species.get(nav) ? nav : p.navigatorId;
          drv = species.get(drv) ? drv : p.driverId;
        }
        const s = agent.spawnPair({ navigatorId: nav, driverId: drv, cwd, mode: b.mode || 'plan', task: b.task, browser: b.browser === true });
        projects.note(cwd, { task: b.task, sessionId: s.id, kind: 'pair' });
        return json(res, 200, { id: s.id, kind: 'pair', navigatorId: nav, driverId: drv });
      });
      return;
    }
    // TEAM MODE: your Main huddles the crew and dispatches specialists to their parts
    if (url.pathname === '/api/agent/team' && req.method === 'POST') {
      if (req.headers['x-lab-token'] !== LAB_TOKEN) return json(res, 403, { error: 'bad token' });
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        let b = {}; try { b = JSON.parse(body || '{}'); } catch {}
        const cwd = b.cwd && fs.existsSync(b.cwd) ? b.cwd : null;
        if (!cwd) return json(res, 400, { error: 'that folder does not exist' });
        if (agent.activeTeams() >= 1) return json(res, 429, { error: 'a team is already assembled — let it finish first' });
        const snap = state.snapshot();
        const owned = [snap.starter, ...(snap.roster || [])].filter((id, i, a) => id && species.isFriendly(id) && a.indexOf(id) === i);
        if (owned.length < 2) return json(res, 400, { error: 'a team needs at least 2 Claudémon — adopt a friend so your main has a crew to lead' });
        // a preset can name the EXACT crew (memberIds); otherwise use the whole roster
        let members = owned;
        if (Array.isArray(b.memberIds) && b.memberIds.length >= 2) {
          const pick = b.memberIds.filter((id) => owned.includes(id));
          if (pick.length >= 2) members = pick;
        }
        // lead = the strongest planner in the crew (focus+wit), or the Main if it's in it
        let lead = members.includes(snap.main) ? snap.main
          : members.slice().sort((a, x) => { const A = species.get(a).stats, X = species.get(x).stats; return (X.focus + X.wit) - (A.focus + A.wit); })[0];
        const s = agent.spawnTeam({ leadId: lead, cwd, mode: b.mode || 'plan', goal: b.task, ownedIds: members });
        projects.note(cwd, { task: b.task, sessionId: s.id, kind: 'team' });
        const unlocked = achievements.bump('teams').concat(achievements.bump('tasks'));
        return json(res, 200, { id: s.id, kind: 'team', lead, unlocked });
      });
      return;
    }
    if (url.pathname === '/api/agent/spawn' && req.method === 'POST') {
      if (req.headers['x-lab-token'] !== LAB_TOKEN) return json(res, 403, { error: 'bad token' });
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        let b = {};
        try { b = JSON.parse(body || '{}'); } catch {}
        if (!species.get(b.creatureId)) return json(res, 400, { error: 'unknown creature' });
        // remote: run this creature on another computer (it works in ITS own folder), don't require the path here
        if (b.node) {
          if (!nodes.online(b.node)) return json(res, 400, { error: 'that computer is offline' });
          const s = agent.spawnRemote({ creatureId: b.creatureId, cwd: b.cwd || '', mode: b.mode || 'auto', task: b.task, nodeId: b.node });
          return json(res, 200, { id: s.id, creatureId: s.creatureId, mode: s.mode, status: s.status, remote: true, unlocked: achievements.bump('tasks') });
        }
        const cwd = b.cwd && fs.existsSync(b.cwd) ? b.cwd : null;
        if (!cwd) return json(res, 400, { error: 'that folder does not exist' });
        const s = agent.spawnSession({ creatureId: b.creatureId, cwd, mode: b.mode || 'plan', task: b.task, browser: b.browser === true });
        projects.note(cwd, { task: b.task, sessionId: s.id, kind: 'solo' });
        return json(res, 200, { id: s.id, creatureId: s.creatureId, mode: s.mode, status: s.status, unlocked: achievements.bump('tasks') });
      });
      return;
    }
    if (url.pathname === '/api/agent/stop' && req.method === 'POST') {
      if (req.headers['x-lab-token'] !== LAB_TOKEN) return json(res, 403, { error: 'bad token' });
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => { let id = ''; try { id = JSON.parse(body || '{}').id; } catch {} return json(res, 200, { stopped: agent.stop(id) }); });
      return;
    }
    // Cease ALL running Claudemon tasks and move them to standby.
    if (url.pathname === '/api/agent/stopall' && req.method === 'POST') {
      if (req.headers['x-lab-token'] !== LAB_TOKEN) return json(res, 403, { error: 'bad token' });
      return json(res, 200, { stopped: agent.stopAll() });
    }
    if (url.pathname === '/api/agent/log') {
      const s = agent.getSession(url.searchParams.get('id'));
      return s ? json(res, 200, { status: s.status, cost: s.cost, events: s.events }) : json(res, 404, { error: 'no session' });
    }
    // the isolated branches parallel pairs left behind, for review/merge/cleanup
    if (url.pathname === '/api/agent/worktrees') {
      const cwd = url.searchParams.get('cwd');
      if (!cwd || !fs.existsSync(cwd)) return json(res, 200, { worktrees: [] });
      try { return json(res, 200, { worktrees: worktree.listWorktrees(cwd) }); }
      catch { return json(res, 200, { worktrees: [] }); }
    }
    if (url.pathname === '/api/agent/worktree/remove' && req.method === 'POST') {
      if (req.headers['x-lab-token'] !== LAB_TOKEN) return json(res, 403, { error: 'bad token' });
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        let b = {}; try { b = JSON.parse(body || '{}'); } catch {}
        if (!b.cwd || !b.path) return json(res, 400, { error: 'need cwd + path' });
        return json(res, 200, { removed: worktree.removeWorktree(b.cwd, b.path) });
      });
      return;
    }
    // Manual mode: the permission bridge asks here and we BLOCK until the human taps
    if (url.pathname === '/api/agent/permission' && req.method === 'POST') {
      if (req.headers['x-lab-token'] !== LAB_TOKEN) return json(res, 403, { error: 'bad token' });
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', async () => {
        let b = {}; try { b = JSON.parse(body || '{}'); } catch {}
        try { return json(res, 200, await agent.requestPermission(b)); }
        catch { return json(res, 200, { behavior: 'deny', message: 'error' }); }
      });
      return;
    }
    // the human's answer from the game
    if (url.pathname === '/api/agent/permission/answer' && req.method === 'POST') {
      if (req.headers['x-lab-token'] !== LAB_TOKEN) return json(res, 403, { error: 'bad token' });
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        let b = {}; try { b = JSON.parse(body || '{}'); } catch {}
        return json(res, 200, { ok: agent.answerPermission(b.id, b.allow === true, b.message) });
      });
      return;
    }
    // HAND-OFF: a stuck pet asks for help; the bridge BLOCKS here until you reply
    if (url.pathname === '/api/agent/handoff' && req.method === 'POST') {
      if (req.headers['x-lab-token'] !== LAB_TOKEN) return json(res, 403, { error: 'bad token' });
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', async () => {
        let b = {}; try { b = JSON.parse(body || '{}'); } catch {}
        try { return json(res, 200, await agent.requestHelp(b)); }
        catch { return json(res, 200, { answer: '(error — carry on)' }); }
      });
      return;
    }
    if (url.pathname === '/api/agent/handoff/answer' && req.method === 'POST') {
      if (req.headers['x-lab-token'] !== LAB_TOKEN) return json(res, 403, { error: 'bad token' });
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        let b = {}; try { b = JSON.parse(body || '{}'); } catch {}
        return json(res, 200, { ok: agent.answerHelp(b.id, b.answer) });
      });
      return;
    }
    // live event stream (Server-Sent Events) — drives the pet's speech + status
    if (url.pathname === '/api/agent/stream') {
      const s = agent.getSession(url.searchParams.get('id'));
      if (!s) return json(res, 404, { error: 'no session' });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.on('error', () => {});   // a client that vanishes mid-write must NEVER crash the whole server
      // Only the top-level session's OWN terminal status closes the stream. In a team,
      // teammate/lead statuses are relayed WITH ev.creature set — those must not end it,
      // or the stream dies the moment the lead finishes planning (and the crew never runs).
      const isTerminal = (ev) => ev.t === 'status' && !ev.creature && ['done', 'failed', 'stopped'].includes(ev.status);
      const safeWrite = (ev) => { if (res.writableEnded || res.destroyed) return; try { res.write(`data: ${JSON.stringify(ev)}\n\n`); } catch {} };
      for (const ev of s.events) safeWrite(ev);   // replay what it already did
      if (s.status === 'done' || s.status === 'failed' || s.status === 'stopped') return res.end();
      let closed = false;
      const listener = (ev) => {
        if (closed) return;
        safeWrite(ev);
        if (isTerminal(ev)) { closed = true; s.listeners.delete(listener); try { res.end(); } catch {} }
      };
      s.listeners.add(listener);
      req.on('close', () => { closed = true; s.listeners.delete(listener); });
      return;
    }
    if (url.pathname === '/api/lab/token') return json(res, 200, { token: LAB_TOKEN });
    if (url.pathname === '/api/lab/list') return json(res, 200, { running: lab.running(), projects: lab.list(), points: state.snapshot().points, reward: lab.REWARD });
    if (url.pathname === '/api/lab/project') {
      const p = lab.get(url.searchParams.get('id'));
      return p ? json(res, 200, p) : json(res, 404, { error: 'not found' });
    }
    if (url.pathname === '/api/lab/start' && req.method === 'POST') {
      if (req.headers['x-lab-token'] !== LAB_TOKEN) return json(res, 403, { error: 'bad token' });
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        let title = '', prompt = '', researcher = '';
        try { const b = JSON.parse(body || '{}'); title = b.title; prompt = b.prompt; researcher = b.researcher; } catch {}
        try { return json(res, 200, lab.start(title, prompt, researcher)); }
        catch (e) { return json(res, 400, { error: String(e.message || e) }); }
      });
      return;
    }
    if (url.pathname === '/api/chat/history') return json(res, 200, { history: lounge.loadHistory(url.searchParams.get('with') || 'clawde') });
    if (url.pathname === '/api/chat' && req.method === 'POST') {
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', async () => {
        let message = '', withId = '';
        try { const b = JSON.parse(body || '{}'); message = b.message || ''; withId = b.with || ''; } catch {}
        try { const reply = await lounge.chat(message, withId); return json(res, 200, { reply }); }
        catch (e) { return json(res, 500, { error: String(e.message || e) }); }
      });
      return;
    }
    if (url.pathname === '/api/action' && req.method === 'POST') {
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        let action = 'pet';
        try { action = (JSON.parse(body || '{}').action) || 'pet'; } catch {}
        try { state.act(action); return json(res, 200, state.snapshot()); }
        catch (e) { return json(res, 400, { error: String(e.message || e) }); }
      });
      return;
    }
    // Per-biome creature walk paths (drawn in path-draw.html, followed by the tank)
    if (url.pathname === '/api/paths' && req.method !== 'POST') {
      let data = {}; try { data = JSON.parse(fs.readFileSync(PATHS_FILE, 'utf8')); } catch {}
      return json(res, 200, data);
    }
    if (url.pathname === '/api/paths' && req.method === 'POST') {
      if (req.headers['x-lab-token'] !== LAB_TOKEN) return json(res, 403, { error: 'bad token' });
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        try {
          const b = JSON.parse(body || '{}');
          const biome = String(b.biome || '');
          if (!biome) return json(res, 400, { error: 'no biome' });
          let data = {}; try { data = JSON.parse(fs.readFileSync(PATHS_FILE, 'utf8')); } catch {}
          if (b.points === null) delete data[biome];
          else data[biome] = { points: Array.isArray(b.points) ? b.points : [] };
          fs.writeFileSync(PATHS_FILE, JSON.stringify(data, null, 2));
          return json(res, 200, { ok: true, biome, count: (data[biome] && data[biome].points.length) || 0 });
        } catch (e) { return json(res, 400, { error: String(e.message || e) }); }
      });
      return;
    }
    // Editable device layout (button positions + Claudeboy size), set in ?edit mode
    if (url.pathname === '/api/layout' && req.method !== 'POST') {
      let data = {}; try { data = JSON.parse(fs.readFileSync(LAYOUT_FILE, 'utf8')); } catch {}
      return json(res, 200, data);
    }
    if (url.pathname === '/api/layout' && req.method === 'POST') {
      if (req.headers['x-lab-token'] !== LAB_TOKEN) return json(res, 403, { error: 'bad token' });
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        try {
          const b = JSON.parse(body || '{}');
          fs.writeFileSync(LAYOUT_FILE, JSON.stringify(b, null, 2));
          return json(res, 200, { ok: true });
        } catch (e) { return json(res, 400, { error: String(e.message || e) }); }
      });
      return;
    }
    if (url.pathname === '/' || url.pathname === '') return serveStatic(res, 'play.html');   // simplified crew/tank home
    return serveStatic(res, url.pathname.replace(/^\//, ''));
  });

  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') log(`tank port ${port} busy (already serving) — skipping web server`);
    else log('web server error:', e.message);
  });
  SERVER_PORT = port;
  // Bind to the network by default so your other computers can find + reach this one.
  // (Set CLAUDEMON_HOST=127.0.0.1 to keep it local-only.) Writes stay token-protected.
  BOUND_HOST = process.env.CLAUDEMON_HOST || '0.0.0.0';
  server.listen(port, BOUND_HOST, () => {
    log(`tank live at http://localhost:${port}${BOUND_HOST === '0.0.0.0' ? ' (on your network too)' : ''}`);
    try { discovery.start({ id: INSTANCE.id, name: INSTANCE.name, platform: process.platform, port }, log); } catch {}
  });
  return server;
}

module.exports = { startTank, WEB_DIR };

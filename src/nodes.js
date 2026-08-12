'use strict';
// REMOTE NODES — other computers running `node src/worker.js` that join this hub so a
// Claudemon can run its agent THERE instead of here. Each connected node holds an open
// SSE "job channel" we push work onto; it streams the agent's events back via
// /api/node/event. In-memory registry (nodes come and go). The local machine is always
// available implicitly (nodeId null = run here).

const crypto = require('crypto');
const nodes = new Map();   // nodeId -> { id, name, platform, at, listeners:Set }

function register({ name, platform } = {}) {
  const id = 'n' + crypto.randomBytes(4).toString('hex');
  nodes.set(id, { id, name: String(name || 'a computer').slice(0, 40), platform: String(platform || '?').slice(0, 24), at: Date.now(), listeners: new Set() });
  return id;
}
function get(id) { return nodes.get(id); }
function beat(id) { const n = nodes.get(id); if (n) n.at = Date.now(); return !!n; }
function isOnline(n) { return !!(n && Date.now() - n.at < 25000 && n.listeners.size > 0); }
function online(id) { return isOnline(nodes.get(id)); }
function list() { return [...nodes.values()].map((n) => ({ id: n.id, name: n.name, platform: n.platform, online: isOnline(n) })); }
function attach(id, fn) { const n = nodes.get(id); if (!n) return false; n.listeners.add(fn); n.at = Date.now(); return true; }
function detach(id, fn) { const n = nodes.get(id); if (n) n.listeners.delete(fn); }
function send(id, job) { const n = nodes.get(id); if (!isOnline(n)) return false; for (const fn of [...n.listeners]) { try { fn(job); } catch {} } return true; }

module.exports = { register, get, beat, list, attach, detach, send, online };

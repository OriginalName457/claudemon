'use strict';
// LAN auto-discovery. Every Claudemon on the same network announces itself over UDP
// broadcast and listens for the others, so your computers find each other automatically
// (no copy-pasting a hub address or token). Zero dependency (Node's dgram).
//
// Presence packet: { cm:1, id, name, platform, ip, port }. We keep peers seen recently.

const dgram = require('dgram');
const os = require('os');

const PORT = 45735;                 // Claudemon discovery port
const BEACON_MS = 3000;
const STALE_MS = 12000;

function lanIP() {
  try { const ifs = os.networkInterfaces(); for (const n of Object.keys(ifs)) for (const i of ifs[n]) if (i.family === 'IPv4' && !i.internal) return i.address; } catch {}
  return '127.0.0.1';
}

const peers = new Map();   // id -> { id, name, platform, ip, port, at }
let sock = null, self = null, timer = null;

function start(info, log = () => {}) {
  if (sock) return;
  self = { cm: 1, id: info.id, name: info.name, platform: info.platform, ip: lanIP(), port: info.port };
  sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  sock.on('error', () => {});
  sock.on('message', (msg, rinfo) => {
    try { const p = JSON.parse(msg.toString()); if (p && p.cm && p.id && p.id !== self.id) peers.set(p.id, { id: p.id, name: p.name || 'a computer', platform: p.platform || '?', ip: p.ip || rinfo.address, port: p.port, at: Date.now() }); } catch {}
  });
  sock.bind(PORT, () => {
    try { sock.setBroadcast(true); } catch {}
    beacon();
    timer = setInterval(beacon, BEACON_MS);
    log('discovery on (LAN) as', self.name, self.ip + ':' + self.port);
  });
}
function beacon() {
  if (!sock || !self) return;
  self.ip = lanIP();
  const buf = Buffer.from(JSON.stringify(self));
  try { sock.send(buf, 0, buf.length, PORT, '255.255.255.255'); } catch {}
}
function list() { const now = Date.now(); return [...peers.values()].filter((p) => now - p.at < STALE_MS).map(({ at, ...p }) => p); }
function get(id) { return peers.get(id); }

module.exports = { start, list, get, lanIP };

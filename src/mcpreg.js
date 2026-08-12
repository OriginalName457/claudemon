'use strict';
// THE CREW'S TOOLBELT — extra MCP servers the user grants to their Claudemon.
//
// Each headless agent already inherits Claude Code's built-in tools, but the
// claude.ai-hosted MCP servers (Higgsfield, Google, …) use interactive OAuth that
// a `-p` agent can't complete, so their tools never load. This registry lets the
// user add MCP servers in a HEADLESS-usable form (a stdio command, or a remote
// http/sse URL + auth header/token). Enabled entries are bundled into every agent's
// --mcp-config AND announced in its system prompt so it knows what it has + when to
// use it. Persisted in state.mcp.

const { spawn } = require('child_process');
const state = require('./state');
let claudeBin; try { ({ claudeBin } = require('./lounge')); } catch { claudeBin = () => 'claude'; }

// a valid server key → becomes the tool prefix mcp__<name>__<tool>
function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'tool'; }

function list() { try { return (state.read().mcp || []).slice(); } catch { return []; } }

// Normalize a raw add request into a stored entry.
function normalize(raw = {}) {
  const kind = ['http', 'sse', 'stdio'].includes(raw.kind) ? raw.kind : (raw.url ? 'http' : 'stdio');
  const e = {
    id: 'm' + Math.abs(hash(JSON.stringify([raw.name, raw.command, raw.url, Date.now && '']) )).toString(36).slice(0, 8),
    name: slug(raw.name || raw.command || raw.url),
    note: String(raw.note || '').slice(0, 200),
    kind,
    enabled: raw.enabled !== false,
  };
  if (kind === 'stdio') { e.command = String(raw.command || '').trim(); e.args = Array.isArray(raw.args) ? raw.args.map(String) : (raw.args ? String(raw.args).split(/\s+/).filter(Boolean) : []); e.env = obj(raw.env); }
  else { e.url = String(raw.url || '').trim(); e.headers = obj(raw.headers); }
  return e;
}
function obj(v) { if (!v || typeof v !== 'object') return {}; const o = {}; for (const k of Object.keys(v)) if (v[k] != null && v[k] !== '') o[String(k)] = String(v[k]); return o; }
function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; } return h; }

function add(raw) {
  const e = normalize(raw);
  if (e.kind === 'stdio' && !e.command) throw new Error('a stdio server needs a command');
  if (e.kind !== 'stdio' && !/^https?:\/\//.test(e.url)) throw new Error('a remote server needs an http(s) url');
  state.mutate((s) => { s.mcp = (s.mcp || []).filter((x) => x.name !== e.name); s.mcp.push(e); });   // name is unique
  return e;
}
function remove(id) { state.mutate((s) => { s.mcp = (s.mcp || []).filter((x) => x.id !== id); }); return list(); }
function toggle(id, on) { state.mutate((s) => { const e = (s.mcp || []).find((x) => x.id === id); if (e) e.enabled = on !== false; }); return list(); }

// The Claude-Code mcp-config fragment for one entry.
function toServerConfig(e) {
  if (e.kind === 'http' || e.kind === 'sse') { const c = { type: e.kind, url: e.url }; if (e.headers && Object.keys(e.headers).length) c.headers = e.headers; return c; }
  const c = { command: e.command, args: e.args || [] }; if (e.env && Object.keys(e.env).length) c.env = e.env; return c;
}

// { name: serverConfig } for every ENABLED server — merged into each agent's --mcp-config.
function bundle() { const out = {}; for (const e of list()) { if (e.enabled === false || !e.name) continue; out[e.name] = toServerConfig(e); } return out; }

// A short system-prompt section so the agent KNOWS what it has and reaches for it.
function promptSection() {
  const on = list().filter((e) => e.enabled !== false);
  if (!on.length) return '';
  const lines = on.map((e) => `- ${e.name}${e.note ? ' — ' + e.note : ''} (tools: mcp__${e.name}__…)`).join('\n');
  return [
    `EXTRA TOOLS (MCP) the human has granted you — USE THEM when the task calls for it, don't reinvent what a tool already does:`,
    lines,
    `If the human asks for something none of your tools cover, say so plainly and offer to add an MCP server for it (you can WebSearch to find one).`,
  ].join('\n');
}

// The human's OWN Claude Code MCP servers (inherited by every agent automatically).
// Read via `claude mcp list` so the app can SHOW that the crew uses your personal MCP,
// just like Claude Code. Cached ~60s (the health check is slow). Async, never blocks.
let _personal = { at: 0, list: [] };
function personal() {
  if (Date.now() - _personal.at < 60000 && _personal.list.length) return Promise.resolve(_personal.list);
  return new Promise((resolve) => {
    let out = '';
    let done = false;
    const finish = () => { if (done) return; done = true; const parsed = parsePersonal(out); if (parsed.length) _personal = { at: Date.now(), list: parsed }; resolve(_personal.list); };
    try {
      const bin = claudeBin();
      const p = spawn(bin, ['mcp', 'list'], { shell: bin === 'claude' });
      p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (out += d));
      p.on('close', finish); p.on('error', finish);
      setTimeout(() => { try { p.kill(); } catch {} finish(); }, 18000);
    } catch { finish(); }
  });
}
function parsePersonal(out) {
  const list = [];
  for (const ln of String(out || '').split('\n')) {
    // format: "<name>: <url-or-cmd> - <status>"
    const m = ln.match(/^\s*(.+?):\s+(.+?)\s+-\s+(.+?)\s*$/);
    if (!m) continue;
    const status = /connect/i.test(m[3]) ? 'connected' : (/auth/i.test(m[3]) ? 'needs-auth' : (/fail|error/i.test(m[3]) ? 'error' : m[3].trim()));
    list.push({ name: m[1].trim(), where: m[2].trim(), status });
  }
  return list;
}

// Run a `claude mcp …` subcommand, capturing output. Resolves { code, out }.
function claudeMcp(args) {
  return new Promise((resolve) => {
    let out = '';
    try {
      const bin = claudeBin();
      const p = spawn(bin, ['mcp', ...args], { shell: bin === 'claude' });
      p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (out += d));
      p.on('close', (code) => resolve({ code, out })); p.on('error', (e) => resolve({ code: 1, out: String(e && e.message || e) }));
      setTimeout(() => { try { p.kill(); } catch {} resolve({ code: 0, out }); }, 15000);
    } catch (e) { resolve({ code: 1, out: String(e && e.message || e) }); }
  });
}

// Add an MCP server FOR THE WHOLE CREW (user scope, so every agent inherits it — like
// Claude Code) and hand back the one-time sign-in command. `claude mcp login` needs a
// real interactive terminal (it refuses over a pipe), so no server or headless agent
// can complete OAuth — only the human can, once, in a terminal. We make that as small
// as possible: one click adds it, then they run one command.
async function connect({ name, url }) {
  const nm = String(name || '').trim();
  if (!nm && !url) throw new Error('need a server name or url');
  let target = nm, added = false;
  if (url) {
    target = slug(nm || url);
    const r = await claudeMcp(['add', '-s', 'user', '--transport', 'http', target, String(url).trim()]);
    added = r.code === 0 || /added/i.test(r.out);
  }
  _personal = { at: 0, list: [] };   // status will change once they sign in
  const q = /\s/.test(target) ? `"${target}"` : target;
  return { target, added, needsLogin: true, loginCmd: `claude mcp login ${q}` };
}

module.exports = { list, add, remove, toggle, bundle, promptSection, personal, connect, slug };

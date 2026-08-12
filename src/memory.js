'use strict';
// PER-CREATURE MEMORY — each Claudemon gets its own private, on-disk SQLite store
// (state/memories/<id>.db) so it can keep context + relevant memories that survive
// context compaction. It's queried lazily: the agent SEARCHES by keyword and gets
// back only the handful of matching memories it needs, never the whole database.
//
// Zero dependencies: uses Node's built-in node:sqlite (Node 22.5+). Falls back to a
// small JSON file if node:sqlite isn't available, so it degrades gracefully.

const fs = require('fs');
const path = require('path');
const state = require('./state');

const DIR = path.join(state.HOME, 'memories');

let SQL = null;
try { SQL = require('node:sqlite'); } catch { SQL = null; }

const dbs = new Map();   // creatureId → open handle (sqlite DatabaseSync | {json})

function fileFor(id, ext) { return path.join(DIR, `${String(id).replace(/[^a-z0-9_-]/gi, '')}.${ext}`); }

function open(id) {
  if (dbs.has(id)) return dbs.get(id);
  try { fs.mkdirSync(DIR, { recursive: true }); } catch {}
  let handle = null;
  if (SQL) {
    try {
      const db = new SQL.DatabaseSync(fileFor(id, 'db'));
      db.exec('PRAGMA journal_mode = WAL');
      db.exec('CREATE TABLE IF NOT EXISTS memories (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, kind TEXT, content TEXT, tags TEXT)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_ts ON memories(ts)');
      handle = { type: 'sqlite', db };
    } catch { handle = null; }
  }
  if (!handle) {   // JSON fallback
    let rows = [];
    try { rows = JSON.parse(fs.readFileSync(fileFor(id, 'json'), 'utf8')); } catch {}
    handle = { type: 'json', rows, id };
  }
  dbs.set(id, handle);
  return handle;
}
function saveJson(h, id) { try { fs.writeFileSync(fileFor(id, 'json'), JSON.stringify(h.rows)); } catch {} }

// Save a memory. kind: fact | preference | project | decision | note.
function remember(id, { content, tags = '', kind = 'note' } = {}) {
  content = String(content || '').trim();
  if (!content) return null;
  const h = open(id); const ts = Date.now();
  if (h.type === 'sqlite') {
    try { const r = h.db.prepare('INSERT INTO memories (ts, kind, content, tags) VALUES (?, ?, ?, ?)').run(ts, kind, content, String(tags || '')); return { id: Number(r.lastInsertRowid), ts }; } catch { return null; }
  }
  const row = { id: (h.rows.length ? h.rows[h.rows.length - 1].id + 1 : 1), ts, kind, content, tags: String(tags || '') };
  h.rows.push(row); saveJson(h, id); return { id: row.id, ts };
}

// Keyword search — returns only the top matches, ranked by relevance then recency.
function search(id, query, limit = 6) {
  const kws = String(query || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3).slice(0, 8);
  if (!kws.length) return recent(id, limit);
  const h = open(id);
  let rows = [];
  if (h.type === 'sqlite') {
    const where = kws.map(() => '(lower(content) LIKE ? OR lower(tags) LIKE ?)').join(' OR ');
    const params = kws.flatMap((w) => [`%${w}%`, `%${w}%`]);
    try { rows = h.db.prepare(`SELECT id, ts, kind, content, tags FROM memories WHERE ${where} ORDER BY ts DESC LIMIT 60`).all(...params); } catch { rows = []; }
  } else {
    rows = h.rows.filter((r) => { const hay = (r.content + ' ' + (r.tags || '')).toLowerCase(); return kws.some((w) => hay.includes(w)); });
  }
  const scored = rows.map((r) => { const hay = (r.content + ' ' + (r.tags || '')).toLowerCase(); return Object.assign({}, r, { score: kws.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0) }); });
  scored.sort((a, b) => b.score - a.score || b.ts - a.ts);
  return scored.slice(0, limit).map(({ score, ...r }) => r);
}

function recent(id, limit = 6) {
  const h = open(id);
  if (h.type === 'sqlite') { try { return h.db.prepare('SELECT id, ts, kind, content, tags FROM memories ORDER BY ts DESC LIMIT ?').all(limit); } catch { return []; } }
  return h.rows.slice(-limit).reverse();
}

function count(id) {
  const h = open(id);
  if (h.type === 'sqlite') { try { return h.db.prepare('SELECT COUNT(*) n FROM memories').get().n; } catch { return 0; } }
  return h.rows.length;
}

function engine() { return SQL ? 'sqlite' : 'json'; }

module.exports = { remember, search, recent, count, engine, DIR };

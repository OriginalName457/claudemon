'use strict';
// PROJECTS — a running list of the folders your crew has actually worked in, so you
// can see what's active, get back to one, or archive the finished ones. Recorded
// whenever a task is dispatched to a folder; persisted in state.projects (keyed by path).

const fs = require('fs');
const path = require('path');
const state = require('./state');

// Upsert a project when work is sent to a folder.
function note(p, info = {}) {
  if (!p) return;
  state.mutate((s) => {
    s.projects = s.projects || {};
    const now = Date.now();
    const cur = s.projects[p] || { path: p, name: (path.basename(String(p).replace(/[\\/]+$/, '')) || p), firstAt: now, sessions: [], status: 'active' };
    cur.lastAt = now;
    const task = info.task ? String(info.task).replace(/\s+/g, ' ').trim().slice(0, 180) : '';
    if (task) cur.lastTask = task;
    if (info.kind) cur.lastKind = info.kind;
    if (info.sessionId) { cur.sessions = cur.sessions || []; if (!cur.sessions.includes(info.sessionId)) cur.sessions.push(info.sessionId); if (cur.sessions.length > 40) cur.sessions.shift(); }
    // the real history: one entry per task sent to this project (newest kept, capped)
    if (task || info.sessionId) {
      cur.history = cur.history || [];
      cur.history.push({ at: now, task, kind: info.kind || 'solo', sessionId: info.sessionId || null });
      if (cur.history.length > 60) cur.history.shift();
    }
    if (cur.status === 'archived' && info.task) cur.status = 'active';   // new work un-archives it
    s.projects[p] = cur;
  });
}

function countFiles(dir) { let n = 0; try { for (const e of fs.readdirSync(dir)) { try { if (fs.statSync(path.join(dir, e)).isFile()) n++; } catch {} } } catch {} return n; }

function list() {
  let ps = {};
  try { ps = state.read().projects || {}; } catch {}
  return Object.values(ps)
    .map((p) => Object.assign({}, p, { files: countFiles(p.path), exists: (() => { try { return fs.existsSync(p.path); } catch { return false; } })() }))
    .sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
}

function setStatus(p, status) { state.mutate((s) => { s.projects = s.projects || {}; if (s.projects[p]) s.projects[p].status = (status === 'archived' ? 'archived' : 'active'); }); }
function forget(p) { state.mutate((s) => { if (s.projects) delete s.projects[p]; }); }

module.exports = { note, list, setStatus, forget };

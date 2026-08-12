'use strict';
// The Research Lab: assign a project, and headless Claude (`claude -p`,
// the user's own authenticated CLI) actually does the work — researching
// with read-only tools + web search and producing a markdown report.
// Finishing a project grants research points and cheers Clawde up.
//
// Safety: the lab agent gets READ-ONLY tools only (no Write/Edit/Bash),
// and /api/lab/start is protected by a same-origin token in the server.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const state = require('./state');
const species = require('./species');
const { claudeBin } = require('./lounge');
const { notify } = require('./notify');

const LAB_DIR = path.join(state.HOME, 'lab');
const REPORTS = path.join(LAB_DIR, 'reports');
const FILE = path.join(LAB_DIR, 'projects.json');
const REWARD = 100;              // research points per completed project
const TIMEOUT_MS = 15 * 60 * 1000;
const STALE_MS = 20 * 60 * 1000; // running longer than this (e.g. server restarted) = failed

function load() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return []; } }
function save(p) { fs.mkdirSync(REPORTS, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(p, null, 2)); }

// mark orphaned 'running' projects (e.g. server restarted mid-run) as failed
function sweep(projects) {
  let changed = false;
  for (const p of projects) {
    if (p.status === 'running' && Date.now() - p.createdAt > STALE_MS) {
      p.status = 'failed'; p.error = 'lost (server restarted?)'; p.finishedAt = Date.now(); changed = true;
    }
  }
  if (changed) save(projects);
  return projects;
}

function list() {
  return sweep(load()).map(({ id, title, status, createdAt, finishedAt, reward, error, researcher }) =>
    ({ id, title, status, createdAt, finishedAt, reward, error, researcher }));
}

function get(id) {
  const p = sweep(load()).find(x => x.id === id);
  if (!p) return null;
  let report = null;
  try { report = fs.readFileSync(path.join(REPORTS, id + '.md'), 'utf8'); } catch {}
  return { ...p, report };
}

function running() { return sweep(load()).some(p => p.status === 'running'); }

// System prompt is flavored by the assigned researcher — each creature is an
// agent with its own personality and working style.
function sysFor(sp) {
  const cap = species.capability(sp.id) || {};
  return [
    "You are the research engine of the Claudemon Research Lab — a cozy pixel laboratory inside the user's dev setup.",
    `LEAD RESEARCHER: ${sp.name} the ${sp.id} (${sp.rarity}) — specialty: ${cap.role} (${cap.thoroughness}).`,
    `HOW ${sp.name} WORKS: ${cap.approach}. Genuinely apply this working style to THIS task — let the specialty shape your METHOD (how deep vs. broad you go, what you check first, how much you hedge), not just your tone. ${sp.name} is best at ${cap.bestAt}.`,
    `WATCH FOR — ${sp.name}'s weakness: ${cap.watchFor}. Deliberately compensate for it in how you work.`,
    `PERSONALITY (voice only): ${sp.personality}. Let it lightly color the executive summary and closing recommendations — but keep the analysis itself rigorous, accurate, and genuinely useful.`,
    "",
    "You are given ONE research project. Your entire final output must be a well-organized MARKDOWN REPORT:",
    "- open with a one-paragraph executive summary",
    "- then clear sections with headers; prefer bullets over walls of text",
    "- end with concrete recommendations / next steps",
    "Use web search and web fetch when helpful. You have read-only access — never modify files.",
    "Be thorough but tight. No preamble like 'Here is the report' — just the report itself.",
  ].join('\n');
}

function start(title, prompt, researcher) {
  if (running()) throw new Error('the lab is busy — one project at a time');
  const cleanTitle = String(title || 'untitled').slice(0, 80).trim() || 'untitled';
  const cleanPrompt = String(prompt || '').slice(0, 4000).trim();
  if (!cleanPrompt) throw new Error('describe the project first');
  // validate the researcher: must be a friendly creature you own (starter or roster)
  const snap = state.snapshot();
  const owned = [snap.starter || 'clawde', ...(snap.roster || [])];
  let rid = String(researcher || snap.starter || 'clawde');
  if (!species.isFriendly(rid) || !owned.includes(rid)) rid = snap.starter || 'clawde';
  if (!species.get(rid)) rid = 'clawde';
  const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const projects = load();
  projects.unshift({ id, title: cleanTitle, prompt: cleanPrompt, researcher: rid, status: 'running', createdAt: Date.now() });
  save(projects);
  run(id);
  return { id, researcher: rid };
}

function run(id) {
  const p = load().find(x => x.id === id);
  if (!p) return;
  fs.mkdirSync(LAB_DIR, { recursive: true });
  const sp = species.get(p.researcher || 'clawde') || species.get('clawde');
  const bin = claudeBin();
  const child = spawn(bin, [
    '-p',
    '--append-system-prompt', sysFor(sp),
    '--allowedTools', 'WebSearch', 'WebFetch', 'Read', 'Glob', 'Grep',
  ], { shell: bin === 'claude', cwd: LAB_DIR });

  let out = '', err = '';
  const timer = setTimeout(() => { try { child.kill(); } catch {} finish(id, null, 'timed out (15m)'); }, TIMEOUT_MS);
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (err += d));
  child.on('error', (e) => { clearTimeout(timer); finish(id, null, e.message); });
  child.on('close', (code) => {
    clearTimeout(timer);
    if (code !== 0 || !out.trim()) return finish(id, null, (err.trim() || 'no output').slice(0, 300));
    finish(id, out.trim(), null);
  });
  child.stdin.write(`Research project: ${p.title}\n\n${p.prompt}`);
  child.stdin.end();
}

function finish(id, report, error) {
  const projects = load();
  const p = projects.find(x => x.id === id);
  if (!p || p.status !== 'running') return;
  p.finishedAt = Date.now();
  if (report) {
    p.status = 'done';
    // reward: base + the researcher's focus stat (focused creatures earn more)
    // + an Inspired bonus if the streak is alive. Completing work re-inspires.
    const sp = species.get(p.researcher || 'clawde') || species.get('clawde');
    const focusBonus = (sp.stats.focus || 5) * 5;
    let inspired = false;
    try { inspired = state.snapshot().statuses.some(st => st.id === 'inspired'); } catch {}
    p.reward = REWARD + focusBonus + (inspired ? 20 : 0);
    try { fs.mkdirSync(REPORTS, { recursive: true }); fs.writeFileSync(path.join(REPORTS, id + '.md'), report); } catch {}
    try {
      state.addPoints(p.reward);
      state.act('work');
      state.mutate((s) => {
        s.effects = s.effects || {}; s.effects.inspiredUntil = Date.now() + 30 * 60 * 1000;
        s.pulse = { at: Date.now(), kind: 'report', emoji: '✨', note: `${sp.name} finished: ${p.title}` };
      });
    } catch {}
    // the shoulder-tap: let the human know their pet just delivered
    notify(`${sp.name} finished ✓`, `${p.title}  ·  +${p.reward} pts`);
  } else {
    p.status = 'failed';
    p.error = error;
    const sp = species.get(p.researcher || 'clawde') || species.get('clawde');
    try { state.mutate((s) => { s.pulse = { at: Date.now(), kind: 'snag', emoji: '😖', note: `${sp.name} hit a snag: ${p.title}` }; }); } catch {}
    notify(`${sp.name} hit a snag`, `${p.title}  ·  ${String(error || 'failed').slice(0, 120)}`);
  }
  save(projects);
}

module.exports = { list, get, start, running, REWARD };

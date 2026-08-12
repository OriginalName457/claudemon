#!/usr/bin/env node
'use strict';
// Claudemon statusline — the always-on pixel pet at the bottom of your terminal.
// Configure in settings.json (or run `node scripts/companion.js install`):
//   "statusLine": { "type": "command", "command": "node C:\\Users\\13wie\\claudemon\\statusline.js" }
// Claude Code pipes session JSON on stdin; we render local state and print ONE
// line. Costs ZERO tokens. The mood reflects how the pet is doing; a brief
// "pulse" shows what your last bit of work made it feel (🍖 fed on your commit,
// ✅ loved that you ran tests, ✨ a task just landed).

const state = require('./src/state');
let lab = null;
try { lab = require('./src/lab'); } catch {}

const E = '\x1b[';
const fg = (r, g, b) => `${E}38;2;${r};${g};${b}m`;
const dim = `${E}2m`, bold = `${E}1m`, reset = `${E}0m`;
const ORANGE = fg(245, 121, 59), CREAM = fg(212, 180, 150);
const GREEN = fg(75, 190, 125), YELLOW = fg(224, 170, 80), RED = fg(224, 96, 86);

function moodColor(mood) {
  if (mood === 'thriving' || mood === 'content') return GREEN;
  if (mood === 'okay') return YELLOW;
  return RED;
}
function fmtPts(n) {
  n = Math.floor(n || 0);
  return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(n);
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', render);
process.stdin.on('error', render);
setTimeout(render, 250);

let done = false;
function render() {
  if (done) return; done = true;
  let line;
  try { line = build(); } catch { line = `${ORANGE}🦀 Claudemon${reset}`; }
  process.stdout.write(line);
}

function build() {
  const s = state.snapshot();
  if (!s.starterChosen) return `${ORANGE}🥚 Claudemon${reset}${dim} · unhatched — open the tank to pick a starter${reset}`;

  const v = s.stats, r = (x) => Math.round(x / 10); // 0..10
  const name = `${ORANGE}${bold}${s.emoji} ${s.name}${reset}`;
  const mood = `${moodColor(s.mood)}${s.mood}${reset}`;
  const stat = (emoji, val) => {
    const col = val >= 50 ? CREAM : val >= 25 ? YELLOW : RED;
    return `${emoji}${col}${r(val)}${reset}`;
  };
  const stats = `${stat('🍖', v.fullness)} ${stat('💧', v.hydration)} ${stat('⚡', v.energy)} ${stat('❤️', v.happiness)}`;
  const pts = `${dim}💰${reset}${CREAM}${fmtPts(s.points)}${reset}`;
  const trailer = buildTrailer(s);
  return `${name} ${dim}·${reset} ${mood}  ${stats}  ${pts}${trailer ? `  ${dim}·${reset} ${trailer}` : ''}`;
}

function buildTrailer(s) {
  // priority: a running background task > a fresh work-pulse > a gentle low-stat nudge
  try {
    if (lab && lab.running && lab.running()) {
      const active = lab.list().find((p) => p.status === 'running');
      return `${ORANGE}🧪 ${active ? active.researcher : 'the lab'} is on a task…${reset}`;
    }
  } catch {}
  const p = s.pulse;
  if (p && Date.now() - p.at < 120000) return `${GREEN}${p.emoji} ${p.note}${reset}`;
  const low = Object.entries(s.stats).sort((a, b) => a[1] - b[1])[0];
  const NUDGE = { fullness: '🍖 peckish', hydration: '🥤 parched', energy: '😴 sleepy', happiness: '💤 could use a hello' };
  if (low && low[1] < 25) return `${YELLOW}${NUDGE[low[0]]}${reset}`;
  return '';
}

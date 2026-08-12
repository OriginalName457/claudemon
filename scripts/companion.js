#!/usr/bin/env node
'use strict';
// Turn Claudemon into a terminal-native companion by wiring its statusline +
// zero-token reaction hooks into Claude Code's settings. Safe and reversible:
// it merges into your existing settings.json without clobbering other keys, tags
// everything it adds, and `uninstall` removes exactly what it added.
//
//   node scripts/companion.js status      # is it wired up? (default)
//   node scripts/companion.js install      # wire into ~/.claude/settings.json
//   node scripts/companion.js install --project   # wire into ./.claude/settings.json
//   node scripts/companion.js uninstall

const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const HOOK = path.join(ROOT, 'hooks', 'claudemon-hook.js');
const SL = path.join(ROOT, 'statusline.js');
const HOOK_CMD = `node "${HOOK}"`;
const SL_CMD = `node "${SL}"`;
const EVENTS = ['SessionStart', 'PostToolUse', 'Stop', 'SessionEnd', 'Notification'];

const args = process.argv.slice(2);
const cmd = (args.find((a) => !a.startsWith('-')) || 'status').toLowerCase();
const scope = args.includes('--project') ? 'project' : 'user';
const settingsPath = scope === 'project'
  ? path.join(process.cwd(), '.claude', 'settings.json')
  : path.join(os.homedir(), '.claude', 'settings.json');

function readSettings() {
  try { return JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch { return {}; }
}
function writeSettings(s) {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2) + '\n');
}
const isOurGroup = (g) => Array.isArray(g && g.hooks) && g.hooks.some((h) => (h.command || '').includes('claudemon-hook.js'));
const slIsOurs = (sl) => !!(sl && typeof sl.command === 'string' && sl.command.includes('statusline.js') && sl.command.includes('claudemon'));

function install() {
  const s = readSettings();

  // statusline — back up any existing one so uninstall can restore it
  if (s.statusLine && !slIsOurs(s.statusLine)) s._claudemonPrevStatusLine = s.statusLine;
  s.statusLine = { type: 'command', command: SL_CMD, padding: 0 };

  // hooks — drop any prior Claudemon groups, then add fresh ones
  s.hooks = s.hooks || {};
  for (const ev of EVENTS) {
    const existing = Array.isArray(s.hooks[ev]) ? s.hooks[ev].filter((g) => !isOurGroup(g)) : [];
    const group = { hooks: [{ type: 'command', command: HOOK_CMD }] };
    if (ev === 'PostToolUse') group.matcher = ''; // all tools
    s.hooks[ev] = existing.concat([group]);
  }

  writeSettings(s);
  console.log(`✓ Claudemon companion installed → ${settingsPath}`);
  console.log(`  statusline:  ${SL_CMD}`);
  console.log(`  hooks:       ${EVENTS.join(', ')}  (all → ${HOOK_CMD})`);
  console.log(`\n  Open a new Claude Code session to see the pet in your statusline.`);
  console.log(`  Undo any time:  node scripts/companion.js uninstall${scope === 'project' ? ' --project' : ''}`);
}

function uninstall() {
  const s = readSettings();
  let touched = false;

  if (slIsOurs(s.statusLine)) {
    if (s._claudemonPrevStatusLine) { s.statusLine = s._claudemonPrevStatusLine; delete s._claudemonPrevStatusLine; }
    else delete s.statusLine;
    touched = true;
  }
  if (s.hooks) {
    for (const ev of EVENTS) {
      if (!Array.isArray(s.hooks[ev])) continue;
      const kept = s.hooks[ev].filter((g) => !isOurGroup(g));
      if (kept.length !== s.hooks[ev].length) touched = true;
      if (kept.length) s.hooks[ev] = kept; else delete s.hooks[ev];
    }
    if (Object.keys(s.hooks).length === 0) delete s.hooks;
  }

  if (touched) { writeSettings(s); console.log(`✓ Claudemon companion removed from ${settingsPath}`); }
  else console.log(`Nothing to remove — Claudemon wasn't wired into ${settingsPath}`);
}

function status() {
  const s = readSettings();
  const sl = slIsOurs(s.statusLine);
  const wired = EVENTS.filter((ev) => Array.isArray(s.hooks && s.hooks[ev]) && s.hooks[ev].some(isOurGroup));
  console.log(`Claudemon companion — ${scope} scope`);
  console.log(`  settings:   ${settingsPath}${fs.existsSync(settingsPath) ? '' : '  (not created yet)'}`);
  console.log(`  statusline: ${sl ? '✓ wired' : '✗ not wired'}`);
  console.log(`  hooks:      ${wired.length ? '✓ ' + wired.join(', ') : '✗ none'}`);
  if (!sl && !wired.length) console.log(`\n  Enable with:  node scripts/companion.js install`);
}

try {
  if (cmd === 'install') install();
  else if (cmd === 'uninstall' || cmd === 'remove') uninstall();
  else status();
} catch (e) {
  console.error('companion error:', e.message);
  process.exit(1);
}

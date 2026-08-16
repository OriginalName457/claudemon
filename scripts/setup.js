#!/usr/bin/env node
'use strict';
// Claudemon setup / doctor. Runs on `npm install` (postinstall, quiet check) and via
// `npm run setup` (installs anything missing) or `npm run doctor` (just checks).
// Bulletproof + non-fatal: never breaks an install, always exits 0.
//
//   npm run setup    → install the claude CLI if missing, then report
//   npm run doctor   → just check and report

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const CHECK_ONLY = args.includes('--check');
const QUIET = args.includes('--quiet');
const win = process.platform === 'win32';

const say = (...a) => { if (!QUIET) console.log(...a); };
const warn = (...a) => console.log(...a);   // warnings show even in quiet mode

function findClaude() {
  const cands = [
    process.env.CLAUDE_BIN,
    path.join(os.homedir(), '.local', 'bin', win ? 'claude.exe' : 'claude'),
    path.join(os.homedir(), '.local', 'bin', 'claude'),
    path.join(__dirname, '..', 'node_modules', '.bin', win ? 'claude.cmd' : 'claude'),
  ].filter(Boolean);
  for (const c of cands) { try { if (fs.existsSync(c)) return c; } catch {} }
  try { const r = spawnSync(win ? 'where' : 'which', ['claude'], { encoding: 'utf8' }); if (r.status === 0 && (r.stdout || '').trim()) return r.stdout.split(/\r?\n/)[0].trim() || 'claude'; } catch {}
  return null;
}
function nodeMajor() { return parseInt(process.versions.node, 10) || 0; }

function report() {
  const nOK = nodeMajor() >= 24;
  const claude = findClaude();
  say('\n🦀 Claudemon setup check');
  say('   Node ' + process.versions.node + (nOK ? '   ✓' : '   ✗  (need Node 24+ — the app uses Node’s built-in database)'));
  say('   claude CLI   ' + (claude ? '✓  ' + claude : '✗  not found'));
  const todo = [];
  if (!nOK) todo.push('Install Node 24+  →  https://nodejs.org');
  if (!claude) todo.push('Install the claude CLI  →  npm install @anthropic-ai/claude-code   (or -g for global)');
  if (claude) say('   → make sure it’s signed in:  claude login');
  if (todo.length) { warn('\n   ⚠ Before running Claudemon:'); todo.forEach((t) => warn('      • ' + t)); }
  else say('\n   ✓ Ready! Start the app:  npm start');
  return { nOK, claude: !!claude };
}

function tryInstallClaude() {
  if (findClaude()) { say('   claude CLI already present ✓'); return; }
  say('   Installing the claude CLI (@anthropic-ai/claude-code)…');
  const npm = win ? 'npm.cmd' : 'npm';
  const r = spawnSync(npm, ['install', '@anthropic-ai/claude-code'], { stdio: QUIET ? 'ignore' : 'inherit', cwd: path.join(__dirname, '..') });
  if (r.status === 0 && findClaude()) say('   Installed ✓'); else warn('   Could not auto-install — run:  npm i -g @anthropic-ai/claude-code');
}

// Register the MCP server with Claude Code — path auto-detected, nothing for the user to edit.
function registerMcp(claudeBin) {
  const server = path.join(__dirname, '..', 'src', 'server.js');
  say('\n   Registering the Claudemon MCP server…');
  // Arg-array form: no interpolated command string (nothing to inject), and spaces in
  // paths are handled by spawn itself. Windows .cmd/.bat shims can't launch without a
  // shell, so opt one in narrowly just for those; the native binary needs no shell.
  const cmdArgs = ['mcp', 'add', 'claudemon', '-s', 'user', '--', 'node', server];
  const useShell = win && /\.(cmd|bat)$/i.test(claudeBin);
  const r = spawnSync(claudeBin, cmdArgs, { stdio: QUIET ? 'ignore' : 'inherit', shell: useShell });
  if (r.status === 0) { say('   ✓ MCP server registered — your tank auto-starts at http://localhost:4573'); return true; }
  warn('   ⚠ `claude mcp add` didn’t succeed (it may already be registered).');
  warn('     To redo it:  claude mcp remove claudemon   then   npm run setup');
  return false;
}

// Optional: add the pixel-pet statusline (patches ~/.claude/settings.json, never clobbers on parse error).
function addStatusline() {
  try {
    const statusline = path.join(__dirname, '..', 'statusline.js');
    const cfgPath = path.join(os.homedir(), '.claude', 'settings.json');
    let cfg = {};
    try { if (fs.existsSync(cfgPath)) cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8') || '{}'); }
    catch { warn('   (couldn’t parse your settings.json — skipping statusline so nothing gets clobbered)'); return; }
    cfg.statusLine = { type: 'command', command: `node "${statusline}"` };
    fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
    say('   ✓ Statusline pixel-pet added to ' + cfgPath);
  } catch (e) { warn('   (couldn’t add the statusline: ' + (e && e.message) + ')'); }
}

try {
  if (!CHECK_ONLY) tryInstallClaude();
  const status = report();
  if (!CHECK_ONLY && status.claude) {
    registerMcp(findClaude());
    if (args.includes('--statusline') || args.includes('--all')) addStatusline();
    else say('\n   (optional) want the pixel pet in your terminal statusline too?  npm run setup -- --statusline');
    say('\n   ➡  Restart Claude Code, then say “show Clawde”. That’s it 🦀');
  }
} catch (e) { if (!QUIET) console.log('   (setup note:', e && e.message, ')'); }
process.exit(0);

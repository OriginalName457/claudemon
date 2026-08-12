#!/usr/bin/env node
'use strict';
// Claudemon hook entry. Claude Code calls this on lifecycle events (SessionStart,
// PostToolUse, Stop, SessionEnd, Notification) with a JSON payload on stdin.
// It updates the pet's state at ZERO token cost — no LLM, no network — so your
// real coding work nourishes your companion. It always exits 0, fast, and never
// blocks a tool call.

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  try { require('../src/reactions').onEvent(JSON.parse(raw || '{}')); } catch { /* never block the tool */ }
  process.exit(0);
});
// If no stdin ever arrives (defensive), don't hang the hook.
setTimeout(() => process.exit(0), 3000);

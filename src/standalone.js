#!/usr/bin/env node
'use strict';
// Standalone Claudemon tank server. Runs the web server only (no MCP stdio),
// stays alive on its own. This is what the desktop app window talks to when
// Claude Code isn't the one hosting the pet.

const state = require('./state');
const { startTank } = require('./webserver');

const PORT = Number(process.env.CLAUDEMON_PORT || 4573);
const log = (...a) => console.error('[claudemon]', ...a);

startTank(PORT, log);
log('standalone tank running on', PORT, '| home', state.HOME);

// Keep the process alive independently of any stdin.
setInterval(() => {}, 1 << 30);
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

// Safety net: a background dev server must stay up. Log stray errors instead of
// letting one crash the whole tank (which stranded the app window before).
process.on('uncaughtException', (e) => log('uncaught (kept alive):', e && e.stack || e));
process.on('unhandledRejection', (e) => log('unhandled rejection (kept alive):', e && e.stack || e));

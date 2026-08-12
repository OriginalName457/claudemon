#!/usr/bin/env node
'use strict';
// Open the Claudemon tank in the default browser (server must be running).
const { spawn } = require('child_process');
const port = process.env.CLAUDEMON_PORT || 4573;
const url = `http://localhost:${port}`;
console.log('Opening', url, '(make sure `npm start` is running in another terminal)');
if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', url], { detached: true });
else if (process.platform === 'darwin') spawn('open', [url], { detached: true });
else spawn('xdg-open', [url], { detached: true });

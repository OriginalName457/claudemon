#!/usr/bin/env node
'use strict';
// Drives src/server.js over stdio exactly like an MCP client, verifying the
// handshake, tools/list, and a few tool calls.
const { spawn } = require('child_process');
const path = require('path');

const child = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'server.js')], {
  stdio: ['pipe', 'pipe', 'inherit'],
  env: { ...process.env, CLAUDEMON_PORT: '0' }, // 0 => let OS pick / effectively skip fixed port
});

let buf = '';
const pending = [];
child.stdout.setEncoding('utf8');
child.stdout.on('data', (d) => {
  buf += d;
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    const cb = pending.shift();
    if (cb) cb(msg);
  }
});

function rpc(method, params) {
  return new Promise((resolve) => {
    const id = Math.floor(Math.random() * 1e6);
    pending.push(resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}
function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}

(async () => {
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoketest', version: '1' } });
  console.log('✓ initialize:', init.result.serverInfo, '| proto', init.result.protocolVersion);
  console.log('  instructions bytes:', (init.result.instructions || '').length);
  notify('notifications/initialized');

  const list = await rpc('tools/list', {});
  console.log('✓ tools/list:', list.result.tools.map(t => t.name).join(', '));

  for (const action of ['get_status', 'feed', 'water', 'pet', 'work', 'work', 'play', 'get_status']) {
    const r = await rpc('tools/call', { name: action, arguments: {} });
    const sc = r.result.structuredContent;
    console.log(`✓ ${action.padEnd(11)} -> ${sc.emoji} ${sc.formName} stage${sc.stage} xp${sc.xp} care${sc.care} | ${sc.mood}`);
  }

  // Force evolution by hammering work + care
  for (let i = 0; i < 30; i++) { await rpc('tools/call', { name: 'work', arguments: {} }); await rpc('tools/call', { name: 'pet', arguments: {} }); }
  const final = await rpc('tools/call', { name: 'get_status', arguments: {} });
  const f = final.result.structuredContent;
  console.log(`\n✓ after heavy care+work: ${f.emoji} ${f.name} the ${f.formName} (stage ${f.stage}/4) xp=${f.xp} care=${f.care}`);
  console.log('  text render:\n' + final.result.content[0].text.split('\n').map(l => '    ' + l).join('\n'));

  child.kill();
  process.exit(0);
})().catch((e) => { console.error('SMOKETEST FAILED:', e); child.kill(); process.exit(1); });

#!/usr/bin/env node
'use strict';
// The PERMISSION BRIDGE. When a Manual-mode Claudemon session wants to do
// something that needs approval, Claude Code calls this MCP tool. It relays the
// request to the running Claudemon server (which shows the pet's "needs you ✋"
// card in the game) and BLOCKS until you tap Approve/Deny, then returns the
// decision so the action proceeds or is refused. Zero dependencies.
//
// It's told which session it belongs to (and how to reach the server) via env:
//   CLAUDEMON_PORT, CLAUDEMON_AGENT, CLAUDEMON_TOKEN

const http = require('http');

const send = (m) => process.stdout.write(JSON.stringify(m) + '\n');
const TOOLS = [{
  name: 'approve',
  description: 'Ask the human to approve or deny a requested tool call.',
  inputSchema: { type: 'object', properties: { tool_name: { type: 'string' }, input: { type: 'object' }, tool_use_id: { type: 'string' } } },
}];

// Ask the game (via the server) and wait for the human's decision.
function ask(payload) {
  return new Promise((resolve) => {
    const data = JSON.stringify(payload);
    const req = http.request({
      host: '127.0.0.1', port: Number(process.env.CLAUDEMON_PORT || 4573),
      path: '/api/agent/permission', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'X-Lab-Token': process.env.CLAUDEMON_TOKEN || '' },
    }, (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ behavior: 'deny', message: 'no decision from the game' }); } }); });
    req.on('error', () => resolve({ behavior: 'deny', message: 'could not reach the game' }));
    req.end(data);
  });
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => {
  buf += c; let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg; try { msg = JSON.parse(line); } catch { continue; }
    handle(msg);
  }
});

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') { send({ jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'cmapprove', version: '0.1' } } }); return; }
  if (method === 'notifications/initialized' || method === 'notifications/cancelled') return;
  if (method === 'ping') { send({ jsonrpc: '2.0', id, result: {} }); return; }
  if (method === 'tools/list') { send({ jsonrpc: '2.0', id, result: { tools: TOOLS } }); return; }
  if (method === 'tools/call') {
    const args = (params && params.arguments) || {};
    const decision = await ask({ agentId: process.env.CLAUDEMON_AGENT || '', tool_name: args.tool_name, input: args.input, tool_use_id: args.tool_use_id });
    // the permission-prompt-tool contract: return the decision JSON as text
    send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(decision) }] } });
    return;
  }
  if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'no method' } });
}

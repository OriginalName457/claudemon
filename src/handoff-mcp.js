#!/usr/bin/env node
'use strict';
// The HAND-OFF BRIDGE. When a Claudemon gets stuck or needs you to do something
// only a human can (log in, solve a captcha, make a judgement call, take the wheel
// in the browser it's driving), it calls this MCP tool. The request shows up in the
// game as the pet's "needs your help 🙋" card and BLOCKS until you reply; your
// answer is handed straight back to the agent so it picks up where it left off.
// Zero dependencies. Reached via env: CLAUDEMON_PORT, CLAUDEMON_AGENT, CLAUDEMON_TOKEN.

const http = require('http');

const send = (m) => process.stdout.write(JSON.stringify(m) + '\n');
const TOOLS = [{
  name: 'ask_human',
  description: "Pause and ask your human for help, a decision, or to take over — e.g. when you hit a login, captcha, paywall, an ambiguous choice (like 'AWS or Azure?'), or want them to co-pilot the browser you're driving. Whenever the decision is basically a pick between a few paths, PASS `options` so they can just tap a button instead of typing. Returns their reply as text; act on it and continue. Use this instead of guessing or giving up.",
  inputSchema: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'What you need from them, in plain language and SHORT.' },
      context: { type: 'string', description: 'Optional: what you were doing / why it matters / any trade-off — keep it brief.' },
      options: { type: 'array', items: { type: 'string' }, description: "Optional: 2-4 short choices they can tap (e.g. ['AWS','Azure','GCP']). A 'something else' box is always added for you automatically — don't include it yourself." },
    },
    required: ['question'],
  },
}];

function ask(payload) {
  return new Promise((resolve) => {
    const data = JSON.stringify(payload);
    const req = http.request({
      host: '127.0.0.1', port: Number(process.env.CLAUDEMON_PORT || 4573),
      path: '/api/agent/handoff', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'X-Lab-Token': process.env.CLAUDEMON_TOKEN || '' },
    }, (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ answer: '(no reply from your human — use your best judgement)' }); } }); });
    req.on('error', () => resolve({ answer: '(could not reach the game — use your best judgement and continue)' }));
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
  if (method === 'initialize') { send({ jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'cmhandoff', version: '0.1' } } }); return; }
  if (method === 'notifications/initialized' || method === 'notifications/cancelled') return;
  if (method === 'ping') { send({ jsonrpc: '2.0', id, result: {} }); return; }
  if (method === 'tools/list') { send({ jsonrpc: '2.0', id, result: { tools: TOOLS } }); return; }
  if (method === 'tools/call') {
    const args = (params && params.arguments) || {};
    const options = Array.isArray(args.options) ? args.options.filter((o) => typeof o === 'string' && o.trim()).slice(0, 4) : [];
    const reply = await ask({ agentId: process.env.CLAUDEMON_AGENT || '', question: args.question || '(they need your help)', context: args.context || '', options });
    send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `Your human replied: ${reply.answer}` }] } });
    return;
  }
  if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'no method' } });
}

#!/usr/bin/env node
'use strict';
// A creature's MEMORY tools. Bundled into every Claudemon session so the agent can
// keep and retrieve its own long-term memories — surviving context compaction. It
// operates directly on this creature's private SQLite store (no server round-trip);
// which creature it belongs to comes in via CLAUDEMON_CREATURE. Zero extra deps.

const memory = require('./memory');
const CREATURE = process.env.CLAUDEMON_CREATURE || 'clawde';

const send = (m) => process.stdout.write(JSON.stringify(m) + '\n');
const TOOLS = [
  {
    name: 'recall',
    description: "Search YOUR OWN long-term memory for anything relevant — past decisions, the human's preferences, project facts, how you did something before. Returns only the matching memories, not the whole store. Check this at the start of a task, and whenever you think 'have we dealt with this before?'.",
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'keywords to search your memory for' }, limit: { type: 'number', description: 'max memories to return (default 6)' } }, required: ['query'] },
  },
  {
    name: 'remember',
    description: "Save something worth keeping to YOUR OWN long-term memory so future-you (even after a context reset) still knows it: a human preference, a project fact, a decision and why, a gotcha you hit. Keep each memory to one clear sentence or two. Add tags to make it findable later.",
    inputSchema: { type: 'object', properties: { content: { type: 'string', description: 'the memory, in one or two clear sentences' }, tags: { type: 'string', description: 'space-separated keywords to find it later' }, kind: { type: 'string', description: 'fact | preference | project | decision | note' } }, required: ['content'] },
  },
];

function handleTool(name, args) {
  try {
    if (name === 'recall') {
      const hits = memory.search(CREATURE, args.query || '', Math.min(20, args.limit || 6));
      if (!hits.length) return 'No matching memories yet.';
      return hits.map((h) => `• [${h.kind || 'note'}] ${h.content}${h.tags ? `  (tags: ${h.tags})` : ''}`).join('\n');
    }
    if (name === 'remember') {
      const r = memory.remember(CREATURE, { content: args.content, tags: args.tags || '', kind: args.kind || 'note' });
      return r ? 'Saved to memory. ✅' : 'Nothing to save.';
    }
  } catch (e) { return 'memory error: ' + e.message; }
  return 'unknown tool';
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

function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') { send({ jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'cmmemory', version: '0.1' } } }); return; }
  if (method === 'notifications/initialized' || method === 'notifications/cancelled') return;
  if (method === 'ping') { send({ jsonrpc: '2.0', id, result: {} }); return; }
  if (method === 'tools/list') { send({ jsonrpc: '2.0', id, result: { tools: TOOLS } }); return; }
  if (method === 'tools/call') {
    const args = (params && params.arguments) || {};
    send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: handleTool(params && params.name, args) }] } });
    return;
  }
  if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'no method' } });
}

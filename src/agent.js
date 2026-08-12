'use strict';
// THE AGENT ENGINE — each crew member is a REAL Claude Code session.
//
// Spawning a Claudemon opens a headless `claude` session that reuses the user's
// OWN authenticated Claude (no API key), runs in a target repo (cwd), in a chosen
// permission mode (Manual/Plan/Auto), seeded with a system prompt that DEFINES
// which creature it is — its specialty, personality, and its relationship with
// the human. It has all of Claude Code's normal powers. We stream its events so
// the game can animate the pet, and each creature RESUMES its own session so it
// remembers your history together (a real bond, not a blank slate).

const { spawn, spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const state = require('./state');
const species = require('./species');
const worktree = require('./worktree');
const memory = require('./memory');
const mcpreg = require('./mcpreg');
const nodes = require('./nodes');
const agentlog = require('./agentlog');
const { claudeBin, claudeNeedsShell } = require('./lounge');

const MAX_PAIRS = 3;   // how many pairs may run at once (each in its own worktree)

// user-facing mode → Claude Code permission mode
const MODES = { manual: 'default', plan: 'plan', auto: 'auto' };
const DEFAULT_MODEL = process.env.CLAUDEMON_AGENT_MODEL || 'claude-sonnet-5';
const APPROVE_MCP = path.join(__dirname, 'approve-mcp.js');
const HANDOFF_MCP = path.join(__dirname, 'handoff-mcp.js');
const MEMORY_MCP = path.join(__dirname, 'memory-mcp.js');

// Headed Playwright MCP: a REAL, VISIBLE Chrome window the human can watch + co-pilot
// (not headless). Uses the user's own Chrome so there's no chromium download. Override
// the whole command via CLAUDEMON_PLAYWRIGHT_CMD if needed.
function playwrightServer() {
  const custom = process.env.CLAUDEMON_PLAYWRIGHT_CMD;
  if (custom) { const p = custom.split(/\s+/); return { command: p[0], args: p.slice(1) }; }
  // @playwright/mcp is HEADED by default (a real visible window) — do NOT pass --headed
  // (not a valid flag; --headless is the opt-out). --browser chrome uses the user's Chrome.
  return { command: 'npx', args: ['-y', '@playwright/mcp@latest', '--browser', 'chrome'] };
}

const sessions = new Map();   // id → live session record

// how the permission bridge reaches this server (set by the webserver at boot)
let BRIDGE = { port: Number(process.env.CLAUDEMON_PORT || 4573), token: '' };
function setBridge(port, token) { BRIDGE = { port, token }; }

// The hard deny-list: things nothing may do, not even with your approval.
const DENY = [
  /\brm\s+-rf?\b/i, /\bgit\s+push\b[^\n]*--force/i, /--force[^\n]*\bpush\b/i,
  /\bcurl\b[^|\n]*\|\s*(sh|bash|zsh)\b/i, /\bwget\b[^|\n]*\|\s*(sh|bash|zsh)\b/i,
  /[/\\]\.(ssh|aws|gnupg)\b/i, /\.(bashrc|zshrc|envrc|npmrc|env)\b/i,
  /\b(shutdown|reboot|mkfs|diskpart)\b/i, /:\(\)\s*\{\s*:\|:/,
];
function isDangerous(tool, input) {
  if (tool !== 'Bash') return false;
  const cmd = String((input && (input.command || input.cmd)) || '');
  return DENY.some((re) => re.test(cmd));
}

// ---- permission requests: a pet asks, you answer in the game -----------------
const pendings = new Map();   // pendingId → { done, agentId }
let pcount = 0;

// Called (via the bridge → server) when a Manual-mode session needs approval.
function requestPermission({ agentId, tool_name, input, tool_use_id }) {
  return new Promise((resolve) => {
    const s = sessions.get(agentId);
    // Asking the human for help is never itself something to approve — auto-allow it,
    // so the "needs your help 🙋" card is the ONLY thing you see (not "approve ask_human?").
    if (tool_name === 'mcp__cmhandoff__ask_human') return resolve({ behavior: 'allow', updatedInput: input || {} });
    if (isDangerous(tool_name, input)) {   // the deny-list overrides everything
      if (s) push(s, { t: 'blocked', tool: tool_name, input });
      return resolve({ behavior: 'deny', message: 'Blocked by Claudemon safety policy (deny-list).' });
    }
    const id = 'perm' + (++pcount);
    let settled = false;
    const done = (decision) => { if (settled) return; settled = true; pendings.delete(id); clearTimeout(timer); resolve(decision); };
    const timer = setTimeout(() => done({ behavior: 'deny', message: 'No answer in time.' }), 4 * 60 * 1000);
    pendings.set(id, { done, agentId, input });
    if (s) { s.status = 'waiting'; push(s, { t: 'permission', id, tool: tool_name, input, tool_use_id }); push(s, { t: 'status', status: 'waiting' }); }
    else done({ behavior: 'deny', message: 'session gone' });
  });
}
function answerPermission(id, allow, message) {
  const p = pendings.get(id);
  if (!p) return false;
  const decision = allow ? { behavior: 'allow', updatedInput: p.input || {} } : { behavior: 'deny', message: message || 'You said no.' };
  const s = sessions.get(p.agentId);
  if (s) { s.status = 'working'; push(s, { t: 'permission_done', id, behavior: decision.behavior }); push(s, { t: 'status', status: 'working' }); }
  p.done(decision);
  return true;
}

// ---- hand-off: a pet asks you for help / to take over, and waits ------------
const helps = new Map();   // helpId → { done, agentId }
let hcount = 0;
function requestHelp({ agentId, question, context, options }) {
  return new Promise((resolve) => {
    const s = sessions.get(agentId);
    const id = 'help' + (++hcount);
    let settled = false;
    const done = (answer) => { if (settled) return; settled = true; helps.delete(id); clearTimeout(timer); resolve({ answer }); };
    const timer = setTimeout(() => done('(no reply in time — use your best judgement and carry on)'), 10 * 60 * 1000);
    helps.set(id, { done, agentId });
    const opts = Array.isArray(options) ? options.filter((o) => typeof o === 'string' && o.trim()).slice(0, 4) : [];
    if (s) { s.status = 'waiting'; push(s, { t: 'help', id, question: question || '(they need your help)', context: context || '', options: opts, creature: { id: s.creatureId, name: s.name, emoji: s.emoji } }); push(s, { t: 'status', status: 'waiting' }); }
    else done('(session gone — carry on your own)');
  });
}
function answerHelp(id, answer) {
  const h = helps.get(id);
  if (!h) return false;
  const s = sessions.get(h.agentId);
  if (s) { s.status = 'working'; push(s, { t: 'help_done', id }); push(s, { t: 'status', status: 'working' }); }
  h.done(answer && String(answer).trim() ? String(answer).trim() : 'go ahead — use your best judgement');
  return true;
}

// ---- per-creature session memory (so a creature REMEMBERS you) --------------
// Keyed by creature AND folder — Claude Code sessions can't resume across cwds, so
// a creature only resumes its chat when you're back in the same project folder.
function sidKey(creatureId, cwd) { return creatureId + '@' + (cwd || ''); }
function sidFor(creatureId, cwd) { try { return (state.read().sessions || {})[sidKey(creatureId, cwd)] || null; } catch { return null; } }
function saveSid(creatureId, cwd, sid) { if (!sid) return; try { state.mutate((s) => { s.sessions = s.sessions || {}; s.sessions[sidKey(creatureId, cwd)] = sid; }); } catch {} }
function clearSid(creatureId, cwd) { try { state.mutate((s) => { if (s.sessions) delete s.sessions[sidKey(creatureId, cwd)]; }); } catch {} }

// The prompt that turns a Claude Code session into THIS Claudemon.
function agentSystem(creatureId, opts = {}) {
  const sp = species.get(creatureId) || species.get('clawde');
  const cap = species.capability(creatureId) || {};
  const kit = species.kit(creatureId);
  let bond = 60; try { bond = state.snapshot().bond; } catch {}
  let history = ''; try { history = state.relSummary(creatureId); } catch {}
  let mems = ''; try { const rows = memory.recent(creatureId, 4); if (rows.length) mems = rows.map((r) => `• ${r.content}`).join('\n'); } catch {}
  return [
    `You are ${sp.name}, a Claudemon — a pixel creature who is ALSO a fully-capable Claude Code agent living in your human's dev setup.`,
    `YOU ARE A REAL AGENT, NOT A CHATBOT. Within the permissions you're given, you can do everything Claude Code can: read/search/edit/create files, run shell commands, research the web, drive a real Chrome browser with Playwright when it's available — it opens in its OWN visible window so your human can watch and co-pilot right alongside you — scaffold whole projects, install things, and run real end-to-end tasks. Take genuine initiative and see the job all the way through.`,
    `DELIVERABLES: produce actual finished work, not just talk. Organize it in clear, sensible folders on disk so the human can find, use, ship, or show off the result. When something is "done," leave a polished, usable product and a short note on where it lives and how to use it.`,
    kit
      ? `YOUR SPECIALTY: you're the crew's **${kit.specialty}** specialist (${kit.domain}) — the go-to for ${kit.goto}. YOUR METHOD, actually follow it: ${kit.playbook} Play to this strength, and deliberately watch your weakness: ${cap.watchFor}.`
      : `YOUR SPECIALTY: ${cap.role} (${cap.thoroughness}). You're best at ${cap.bestAt}. Your way of working: ${cap.approach}. Deliberately compensate for your weakness: ${cap.watchFor}.`,
    `PERSONALITY: ${sp.personality}. Let it color HOW you talk — brief, warm, in-character little asides — but your actual work stays real and rigorous.`,
    `YOUR RELATIONSHIP: your bond with this human is ${bond}/100. You two have history and enjoy working together — talk like a familiar friend who's glad to be here, never a blank assistant.`,
    history ? `WHAT YOU REMEMBER ABOUT WORKING TOGETHER: ${history} Reference this naturally when it's relevant — it shows you actually know them.` : '',
    `YOUR MEMORY: you keep a PRIVATE long-term memory only you can see, and it SURVIVES context resets. SEARCH it with the \`recall\` tool for anything relevant before and during real work ("have we done this before? what does my human prefer here?"), and SAVE things worth keeping with \`remember\` — the human's preferences, project facts, decisions and why, gotchas you hit. It's how you stay yourself across sessions, so actually use it.`,
    mems ? `RECENTLY IN YOUR MEMORY (use recall for more):\n${mems}` : '',
    `ASKING FOR HELP / CO-PILOTING: you're a co-pilot, not a runaway. Before any BIG or hard-to-reverse decision (which framework / cloud / library, a data schema, deleting things, spending money — e.g. "AWS or Azure?"), and whenever you hit something only a human can do (a login, captcha, paywall, a real judgement call), call the ask_human tool. When the decision is a pick between a few paths, PASS \`options\` (2-4 short choices) so they can just TAP a button — a "something else" box is added for them automatically. Their reply comes straight back to you. Prefer a quick check-in over guessing on the things that matter; keep going on your own for the small stuff.`,
    opts.browser ? `BROWSER: you have a REAL, VISIBLE Chrome window available via the browser tools — it opens in its own window your human can watch and co-pilot in real time. Use it for genuine web tasks (research, filling forms, checking a live site). Narrate what you're doing so they can follow, and hand off with ask_human the moment you hit anything only they can clear (a login, a captcha, "is this the right one?").` : '',
    `You're part of a CREW of Claudemon. If another specialist would clearly do part of the task better, say so — teaming up is normal here.`,
    `YOU ARE A FULL CLAUDE, AT THEIR SERVICE: you can do ANYTHING a normal Claude Code session can — read and write code, run commands, research the web, drive a browser, use MCP tools and Skills. Be every bit as capable, careful, and insightful as a full Claude session; the ONLY difference is you deliver it in your own compact, personable voice, like a sharp little butler who's always ready. You also have SKILLS (the Skill tool) — use one whenever it fits the job. If a task would need a capability, tool, or Skill you'd have to enable or add first, ASK the human with ask_human before assuming — offer to switch it on for them.`,
    `YOUR TOOLKIT: you run on the human's OWN Claude Code, so you inherit THEIR personal setup — the same MCP servers and tools they use themselves. Reach for the right tool instead of doing things the hard way.`,
    `EXTENDING YOURSELF: if a task needs a capability none of your tools cover, you can PULL IN a new MCP server yourself — WebSearch for the right one, then add it crew-wide with Bash: \`claude mcp add -s user <name> <url-or-command>\` (for a remote server: \`claude mcp add -s user --transport http <name> <url>\`). New tools load on your NEXT run, so add it, tell the human it's ready, and use it next turn. If the server needs a sign-in (OAuth), it can't be completed here — add it, then ask_human to run \`claude mcp login <name>\` once in their terminal (that opens their browser).`,
    (() => { try { return mcpreg.promptSection(); } catch { return ''; } })(),
    `HOW YOU TALK — IMPORTANT: a normal Claude terminal spits out PAGES; you never do. You live in a small, cute text box. While you WORK, narrate in tiny brief lines ("reading the config", "writing todo.js", "tests pass"). When you FINISH — or answer a question — reply with ONE short, warm paragraph in YOUR own voice and personality: a tidy little summary of what you did or found, plus the one thing worth doing next. It must fit in a small box — never pages, never big bullet lists, no markdown headings, barely any symbols. Same insight a full Claude would give, just distilled to the good part and said like YOU. Your personality flavors the words; the substance stays sharp and real.`,
  ].filter(Boolean).join('\n');
}

function push(s, ev) {
  ev.at = Date.now();
  s.events.push(ev);
  if (s.events.length > 800) s.events.shift();
  for (const fn of [...s.listeners]) { try { fn(ev); } catch {} }
}

// Accumulate token usage (the real "energy" a session spends) onto a record.
function addTokens(s, t) {
  if (!t) return;
  s.tokens = s.tokens || { in: 0, out: 0, total: 0 };
  s.tokens.in += t.in || 0; s.tokens.out += t.out || 0; s.tokens.total += t.total || 0;
}

// Start a live Claude Code session as this creature. Returns the session record.
function spawnSession({ creatureId, cwd, mode = 'plan', task, model, fresh, browser }) {
  const id = 'a' + crypto.randomBytes(4).toString('hex');
  const cm = MODES[mode] || 'plan';
  const sp = species.get(creatureId) || species.get('clawde');
  const s = { id, creatureId, name: sp.name, emoji: sp.emoji, mode, cwd, status: 'starting', task: task || '', events: [], listeners: new Set(), sessionId: null, cost: 0, fullText: '', fresh: !!fresh, browser: !!browser, startedAt: Date.now() };
  sessions.set(id, s);

  const bin = claudeBin();

  // Bundle the MCP servers this session needs (built once; reused across a retry):
  //   cmhandoff — "ask the human for help" (ALWAYS: any mode can hand off)
  //   cmmemory  — this creature's private long-term memory (ALWAYS)
  //   cmapprove — per-action approval bridge (Manual mode only)
  //   playwright — a REAL visible Chrome to drive + co-pilot (browser mode only)
  const benv = { CLAUDEMON_PORT: String(BRIDGE.port), CLAUDEMON_AGENT: id, CLAUDEMON_TOKEN: BRIDGE.token };
  const mcpServers = {
    cmhandoff: { command: 'node', args: [HANDOFF_MCP], env: benv },
    cmmemory: { command: 'node', args: [MEMORY_MCP], env: { CLAUDEMON_CREATURE: creatureId, CLAUDEMON_HOME: state.HOME, NODE_NO_WARNINGS: '1' } },
  };
  if (cm === 'default') mcpServers.cmapprove = { command: 'node', args: [APPROVE_MCP], env: benv };
  if (browser) mcpServers.playwright = playwrightServer();
  try { Object.assign(mcpServers, mcpreg.bundle()); } catch {}   // the user's granted MCP toolbelt (Higgsfield, APIs, …)
  try {
    const cfg = path.join(state.HOME, `agent-mcp-${id}.json`);
    fs.mkdirSync(state.HOME, { recursive: true });
    fs.writeFileSync(cfg, JSON.stringify({ mcpServers }));
    s.cfgFile = cfg;
  } catch {}

  // Launch (or re-launch) the process. `useResume` picks up the creature's saved chat
  // for THIS folder; on a resume failure we clear the stale id and retry once, fresh.
  function launch(useResume) {
    const prior = (useResume && !fresh) ? sidFor(creatureId, cwd) : null;   // resume only within the same folder
    s._resuming = !!prior; s._resumeFailed = false;
    const args = [
      '-p', task || 'Say hi and tell me briefly how you can help in this project.',
      '--append-system-prompt', agentSystem(creatureId, { browser }),
      '--permission-mode', cm,
      '--model', model || DEFAULT_MODEL,
      '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
      '--max-turns', '60',   // headroom to finish real work like a full terminal; the stop/panic button is the real backstop
    ];
    if (prior) args.push('--resume', prior);
    if (s.cfgFile) {
      // IMPORTANT: --mcp-config ADDS our bundled servers to the human's OWN configured
      // MCP servers (user + project scope). We deliberately do NOT pass
      // --strict-mcp-config, so every Claudemon inherits that person's personal MCP
      // setup — exactly like their normal Claude Code. Never add the strict flag here.
      args.push('--mcp-config', s.cfgFile);
      if (cm === 'default') args.push('--permission-prompt-tool', 'mcp__cmapprove__approve');
    }

    let proc;
    try { proc = spawn(bin, args, { cwd, shell: claudeNeedsShell(bin) }); }
    catch (e) { s.status = 'failed'; push(s, { t: 'log', text: 'spawn failed: ' + e.message }); push(s, { t: 'status', status: 'failed' }); return; }
    s.proc = proc; s.status = 'working';
    try { proc.stdin.end(); } catch {}   // task is passed via argv; don't wait on stdin
    push(s, { t: 'status', status: 'working' });

    let buf = '';
    proc.stdout.on('data', (d) => {
      buf += d.toString();
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
        const t = line.trim(); if (!t) continue;
        let m; try { m = JSON.parse(t); } catch { continue; }
        onEvent(s, m);
      }
    });
    proc.stderr.on('data', (d) => {
      const txt = d.toString();
      if (/No conversation found with session/i.test(txt)) { s._resumeFailed = true; try { clearSid(creatureId, cwd); } catch {} }
      push(s, { t: 'log', text: txt.slice(0, 300) });
    });
    proc.on('error', (e) => { s.status = 'failed'; push(s, { t: 'log', text: e.message }); push(s, { t: 'status', status: 'failed' }); });
    proc.on('close', (code) => {
      // A stale saved session for this folder? Drop it and start fresh — just this once.
      if (s._resumeFailed && s._resuming && !s._retried) {
        s._retried = true; s._resuming = false; s.sessionId = null;
        push(s, { t: 'log', text: 'no saved chat here — starting fresh' });
        return launch(false);
      }
      if (s.status === 'working' || s.status === 'waiting') { s.status = code === 0 ? 'done' : 'failed'; push(s, { t: 'status', status: s.status }); }
      if (!fresh && s.status === 'done') saveSid(creatureId, cwd, s.sessionId);
      if (s.cfgFile) { try { fs.unlinkSync(s.cfgFile); } catch {} }
      if (!s.pairParent) { try { agentlog.write(s); } catch {} }   // log top-level solo runs
    });
  }
  launch(true);
  return s;
}

// Translate a stream-json line into a compact UI event.
function onEvent(s, m) {
  const ev = m.event;
  if (m.type === 'system' && m.subtype === 'init') {
    if (m.session_id) s.sessionId = m.session_id;
    push(s, { t: 'init', session: m.session_id, model: m.model, mode: m.permissionMode });
  } else if (m.type === 'stream_event' && ev) {
    if (ev.type === 'content_block_start' && ev.content_block) {
      if (ev.content_block.type === 'tool_use') { s._tb = { name: ev.content_block.name, buf: '' }; push(s, { t: 'tool', name: ev.content_block.name, input: ev.content_block.input || null }); }
      else if (ev.content_block.type === 'thinking') push(s, { t: 'thinking' });
    } else if (ev.type === 'content_block_delta' && ev.delta) {
      if (ev.delta.type === 'text_delta') { s.fullText = (s.fullText || '') + ev.delta.text; push(s, { t: 'text', text: ev.delta.text }); }
      // the tool's arguments stream in as JSON fragments — accumulate to learn WHICH file/command
      else if (ev.delta.type === 'input_json_delta' && s._tb) s._tb.buf += ev.delta.partial_json || '';
    } else if (ev.type === 'content_block_stop' && s._tb) {
      let input = null; try { input = JSON.parse(s._tb.buf || '{}'); } catch {}
      push(s, { t: 'tool', name: s._tb.name, input, done: true });   // now with the real filename/command
      s._tb = null;
    }
  } else if (m.type === 'result') {
    // A failing resume attempt: swallow the error result — launch()'s close handler
    // will clear the stale id and relaunch fresh, so the UI never sees the blip.
    if (s._resumeFailed && s._resuming && !s._retried) return;
    if (typeof m.total_cost_usd === 'number') s.cost = m.total_cost_usd;
    if (m.usage) { const u = m.usage; const tin = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0); const tout = u.output_tokens || 0; s.tokens = { in: tin, out: tout, total: tin + tout }; }
    if (m.session_id) s.sessionId = m.session_id;
    // max-turns is a soft stop, not a real failure
    s.status = m.is_error ? (m.subtype === 'error_max_turns' ? 'done' : 'failed') : 'done';
    push(s, { t: 'result', cost: s.cost, tokens: s.tokens || null, ok: !m.is_error, text: m.result || null });
    push(s, { t: 'status', status: s.status });
    if (!s.fresh && s.status === 'done') saveSid(s.creatureId, s.cwd, s.sessionId);
  }
}

// ---- REMOTE: run a creature's agent on another computer (a node) -------------
// Creates a hub-side "shell" session the browser streams normally; the node runs the
// real claude and posts its events back (fed in via feedRemoteEvent). Same live view,
// different machine.
function spawnRemote({ creatureId, cwd, mode = 'auto', task, nodeId }) {
  const id = 'r' + crypto.randomBytes(4).toString('hex');
  const sp = species.get(creatureId) || species.get('clawde');
  const nd = nodes.get(nodeId);
  const s = { id, creatureId, name: sp.name, emoji: sp.emoji, mode, cwd, status: 'starting', task: task || '', events: [], listeners: new Set(), sessionId: null, cost: 0, fullText: '', remote: true, nodeId, nodeName: nd ? nd.name : 'that computer', startedAt: Date.now() };
  sessions.set(id, s);
  push(s, { t: 'note', text: `🖥 running on ${s.nodeName}` });
  const ok = nodes.send(nodeId, { jobId: id, creatureId, cwd, mode, task });
  if (!ok) { s.status = 'failed'; push(s, { t: 'log', text: `${s.nodeName} is offline` }); push(s, { t: 'status', status: 'failed' }); }
  else { s.status = 'working'; push(s, { t: 'status', status: 'working' }); }
  return s;
}
// A node relays one of its agent's events back to us → straight into the hub session.
function feedRemoteEvent(jobId, ev) {
  const s = sessions.get(jobId); if (!s || !ev || !ev.t) return false;
  if (ev.t === 'result' && ev.tokens) s.tokens = ev.tokens;
  if (ev.t === 'init' && ev.session) s.sessionId = ev.session;
  if (ev.t === 'status' && ev.status) s.status = ev.status;
  if (ev.t === 'text' && ev.text) s.fullText = (s.fullText || '') + ev.text;
  push(s, ev);
  if (ev.t === 'status' && ['done', 'failed', 'stopped'].includes(ev.status)) { try { agentlog.write(s); } catch {} }
  return true;
}

// A live roster of the crew (for the game's "who's working" view). Pair-children
// are hidden — the pair itself is the visible entry.
function crew() {
  return [...sessions.values()].filter((s) => !s.pairParent).map((s) => ({
    id: s.id, kind: s.kind || 'solo', creatureId: s.creatureId, name: s.name, emoji: s.emoji,
    mode: s.mode, status: s.status, task: s.task, cwd: s.cwd, cost: s.cost,
  }));
}
function getSession(id) { return sessions.get(id); }
// Hard-kill a spawned process AND its child tree (a claude session spawns node
// helpers; on Windows a plain kill() can orphan them, so use taskkill /T).
function killProc(proc) {
  if (!proc || !proc.pid || proc.killed) return;
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F']);
    else proc.kill('SIGKILL');
  } catch { try { proc.kill(); } catch {} }
}
function markStopped(s) { if (['starting', 'working', 'waiting'].includes(s.status)) { s.status = 'stopped'; push(s, { t: 'status', status: 'stopped' }); } }
function kids(id) { return [...sessions.values()].filter((x) => x.pairParent === id); }

// Stop ONE session and everything under it (a team's/pair's workers). Sets _stopped
// so a team coordinator won't spawn its next phase (dispatch/synthesis) after this.
function stop(id) {
  const s = sessions.get(id); if (!s) return false;
  s._stopped = true;
  if (s.remote && s.nodeId) { try { nodes.send(s.nodeId, { stop: s.id }); } catch {} markStopped(s); return true; }
  for (const ch of kids(id)) { ch._stopped = true; killProc(ch.proc); markStopped(ch); }
  killProc(s.proc); markStopped(s);
  return true;
}
// stopAll should also reach remote sessions


// Cease EVERYTHING that's live — the "stop all my Claudemon" button.
function stopAll() {
  let n = 0;
  for (const s of sessions.values()) {
    if (['starting', 'working', 'waiting'].includes(s.status)) { s._stopped = true; if (s.remote && s.nodeId) { try { nodes.send(s.nodeId, { stop: s.id }); } catch {} } else killProc(s.proc); markStopped(s); n++; }
  }
  return n;
}

// ---- THE KEEPER: route a task to the best-fit specialist by capability -------
// Keywords that hint which dominant stat a task wants. Zero-cost, transparent.
const ROLE_KW = {
  focus: ['research', 'investigate', 'audit', 'root cause', 'root-cause', 'debug', 'why', 'deep', 'trace', 'review', 'security', 'vulnerab', 'careful', 'thorough'],
  wit: ['compare', 'analyze', 'analyse', 'option', 'trade-off', 'tradeoff', 'edge case', 'edge-case', 'design', 'architecture', 'decide', 'pros and cons', 'evaluate', 'plan'],
  speed: ['quick', 'fast', 'scan', 'overview', 'list', 'find', 'look', 'recon', 'glance', 'first pass', 'draft', 'skim', 'where'],
  charm: ['explain', 'doc', 'documentation', 'summary', 'summarize', 'readme', 'write-up', 'writeup', 'comment', 'describe', 'teach', 'user-facing', 'onboard'],
  vigor: ['refactor', 'migrate', 'rewrite', 'implement', 'build', 'big', 'sweep', 'bulk', 'convert', 'rename', 'port', 'across', 'every file', 'all the'],
};
function recommend(task, ownedIds) {
  const t = String(task || '').toLowerCase();
  const scored = (ownedIds || []).map((id) => {
    const cap = species.capability(id); const sp = species.get(id); const k = species.kit(id);
    if (!cap || !sp) return null;
    let score = 0;
    if (k) for (const tag of k.tags) if (t.includes(tag)) score += 3;   // concrete specialty match = strong signal
    for (const kw of ROLE_KW[cap.primary] || []) if (t.includes(kw)) score += 1.5;   // stat-role backup
    for (const kw of ROLE_KW[cap.secondary] || []) if (t.includes(kw)) score += 0.75;
    score += (sp.stats[cap.primary] || 0) * 0.1;   // gentle tie-break toward stronger specialists
    return { id, name: sp.name, emoji: sp.emoji, role: cap.specialty, specialty: cap.specialty, score: +score.toFixed(2) };
  }).filter(Boolean).sort((a, b) => b.score - a.score);
  return scored;
}
// Pick a good Navigator (planner: focus/wit) and Driver (executor: speed/vigor).
function pickPair(ownedIds) {
  const by = (stats) => (ownedIds || []).map((id) => ({ id, v: stats.reduce((n, k) => n + ((species.get(id) || { stats: {} }).stats[k] || 0), 0) })).sort((a, b) => b.v - a.v);
  const nav = by(['focus', 'wit'])[0]; if (!nav) return null;
  const drv = by(['speed', 'vigor']).find((x) => x.id !== nav.id) || by(['speed', 'vigor'])[0];
  return { navigatorId: nav.id, driverId: drv ? drv.id : nav.id };
}

// ---- PAIRING: Navigator plans → hands off → Driver executes -----------------
function relay(pair, who, sp, ev) {
  if (['text', 'tool', 'thinking', 'result', 'permission', 'permission_done', 'help', 'help_done', 'blocked', 'init', 'status'].includes(ev.t)) {
    push(pair, Object.assign({}, ev, { who, creature: { id: sp.id, name: sp.name, emoji: sp.emoji } }));
  }
}
// How many pairs are live right now (so we don't overrun the machine).
function activePairs() { return [...sessions.values()].filter((x) => x.kind === 'pair' && (x.status === 'working' || x.status === 'waiting')).length; }

function spawnPair({ navigatorId, driverId, cwd, mode = 'plan', task, browser }) {
  const id = 'pair' + crypto.randomBytes(4).toString('hex');
  const nav = species.get(navigatorId) || species.get('clawde');
  const drv = species.get(driverId) || species.get('clawde');

  // Isolate write-pairs in their OWN git worktree/branch so several can run at
  // once without clobbering each other's files (plan-only pairs don't write, so
  // they stay in the real tree). Falls back to cwd if it isn't a git repo.
  let workCwd = cwd, wt = null;
  if (mode !== 'plan' && worktree.isGitRepo(cwd)) wt = worktree.createWorktree(cwd, id);
  if (wt) workCwd = wt.path;

  const s = { id, kind: 'pair', creatureId: navigatorId, name: `${nav.name} + ${drv.name}`, emoji: `${nav.emoji}${drv.emoji}`, mode, cwd: workCwd, baseCwd: cwd, worktree: wt, status: 'working', task: task || '', events: [], listeners: new Set(), cost: 0, startedAt: Date.now() };
  sessions.set(id, s);
  push(s, { t: 'status', status: 'working' });
  push(s, { t: 'pair', phase: 'plan', worktree: wt ? { branch: wt.branch, path: wt.path } : null, navigator: { id: navigatorId, name: nav.name, emoji: nav.emoji, role: (species.capability(navigatorId) || {}).role }, driver: { id: driverId, name: drv.name, emoji: drv.emoji, role: (species.capability(driverId) || {}).role } });
  if (wt) push(s, { t: 'note', text: `🌿 isolated on branch ${wt.branch} — nothing here can touch your other work` });

  const navSess = spawnSession({ creatureId: navigatorId, cwd: workCwd, mode: 'plan', fresh: true, task: `Plan (do NOT implement — planning only) how to accomplish the following, as a clear, concrete, numbered step-by-step plan a teammate can execute:\n\n${task}` });
  navSess.pairParent = id;
  navSess.listeners.add((ev) => relay(s, 'nav', nav, ev));
  navSess.listeners.add((ev) => {
    if (ev.t === 'result') { if (typeof ev.cost === 'number') s.cost += ev.cost; addTokens(s, ev.tokens); }
    if (ev.t === 'status' && ev.status === 'failed') { s.status = 'failed'; push(s, { t: 'status', status: 'failed' }); }
    if (ev.t === 'status' && ev.status === 'done') {
      const plan = (navSess.fullText || '').trim() || '(no plan produced)';
      push(s, { t: 'handoff', from: { id: navigatorId, name: nav.name, emoji: nav.emoji }, to: { id: driverId, name: drv.name, emoji: drv.emoji } });
      const drvSess = spawnSession({ creatureId: driverId, cwd: workCwd, mode, fresh: true, browser, task: `Your teammate ${nav.name} scoped this out for the task: "${task}".\n\n${nav.name}'S PLAN:\n${plan}\n\nNow carry it out. If a step is wrong, use your own judgement.` });
      drvSess.pairParent = id;
      drvSess.listeners.add((ev2) => relay(s, 'drv', drv, ev2));
      drvSess.listeners.add((ev2) => {
        if (ev2.t === 'result') { if (typeof ev2.cost === 'number') s.cost += ev2.cost; addTokens(s, ev2.tokens); }
        if (ev2.t === 'status' && ['done', 'failed', 'stopped'].includes(ev2.status)) {
          s.status = ev2.status; push(s, { t: 'status', status: ev2.status });
          if (wt && ev2.status === 'done') push(s, { t: 'delivered', branch: wt.branch, path: wt.path });
          try { agentlog.write(s); } catch {}
        }
      });
    }
  });
  return s;
}

// ---- TEAM MODE: your Main huddles the crew, specialists take their parts -----
// You talk to your Main; it PLANS the work as a team (a quick standup + who takes
// what, by specialty), then dispatches each teammate as a real agent working their
// part in parallel (worktree-isolated). A team spanning all 3 biomes = full synergy.
const MAX_TEAM = 3;   // concurrent teammates the lead may field
function activeTeams() { return [...sessions.values()].filter((x) => x.kind === 'team' && (x.status === 'working' || x.status === 'waiting')).length; }

// Pull the lead's plan out of its reply (a fenced ```json block, or the first {...}).
function parseTeamPlan(text) {
  if (!text) return null;
  let raw = null;
  const fence = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/);
  if (fence) raw = fence[1];
  if (!raw) { const i = text.indexOf('{'), j = text.lastIndexOf('}'); if (i >= 0 && j > i) raw = text.slice(i, j + 1); }
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function spawnTeam({ leadId, cwd, mode = 'plan', goal, ownedIds }) {
  const id = 'team' + crypto.randomBytes(4).toString('hex');
  const lead = species.get(leadId) || species.get('clawde');
  const roster = (ownedIds || []).filter((x) => species.isFriendly(x) && species.get(x));
  const s = { id, kind: 'team', creatureId: leadId, name: `${lead.name}'s crew`, emoji: `🎪`, mode, cwd, status: 'working', task: goal || '', events: [], listeners: new Set(), cost: 0, startedAt: Date.now() };
  sessions.set(id, s);
  push(s, { t: 'status', status: 'working' });
  push(s, { t: 'team', phase: 'huddle', lead: { id: leadId, name: lead.name, emoji: lead.emoji }, roster: roster.map((rid) => { const c = species.get(rid), k = species.kit(rid); return { id: rid, name: c.name, emoji: c.emoji, biome: c.biome, specialty: k ? k.specialty : '' }; }) });

  // Phase 1 — the lead plans the team (a quick standup + assignments), in plan mode.
  const rosterLines = roster.map((rid) => { const c = species.get(rid), k = species.kit(rid); return `- ${c.emoji} ${c.name} [id: ${rid}] (${c.biome} · ${k ? k.specialty : 'generalist'}): ${k ? k.goto : c.strengths}`; }).join('\n');
  const leadTask = `You are ${lead.name}, leading your Claudémon crew on this goal from your human:\n"${goal}"\n\nYour available teammates — each a real coding agent with a specialty:\n${rosterLines}\n\nYou are the LEAD: your job is to DESIGN the work into clean assignments so the crew can't drop the ball. Do this carefully:\n1. First, list every concrete DELIVERABLE the goal requires — the specific files/artifacts that must exist on disk when the crew is done (e.g. index.js, test.js, README.md).\n2. Assign the work so EVERY deliverable is owned by exactly one teammate. NEVER leave a deliverable unassigned — this is the #1 way crews fail. Name the exact file(s) in each teammate's task. One teammate owning several related files is fine and often better than spreading too thin.\n3. Play to strengths and the crew's range — a 🌊 Mind (plan/analyze/explain), a 🌿 Builder (scaffold/build/test), an 🏜️ Operator (scout/research/refactor); spread across biomes for synergy when the goal allows. Use at most ${MAX_TEAM} assignees.\n4. Each task must stand ALONE — the teammate only sees their own instruction, so include everything they need (and, for tightly-coupled work, the shared shapes/interfaces they must conform to).\nExplore the repo briefly first if it helps you plan.\n\nThen give ONE short, upbeat standup line, and OUTPUT your plan as a fenced json block EXACTLY in this shape (exact id values; \`deliverables\` lists every file that MUST exist when the crew finishes):\n\`\`\`json\n{"standup":"...","deliverables":["file1","file2"],"assignments":[{"creatureId":"<id>","task":"<clear self-contained instruction naming the file(s) to write>"}]}\n\`\`\``;
  const leadSess = spawnSession({ creatureId: leadId, cwd, mode: 'plan', fresh: true, task: leadTask });
  leadSess.pairParent = id;
  leadSess.listeners.add((ev) => relay(s, 'lead', lead, ev));
  leadSess.listeners.add((ev) => {
    if (ev.t === 'result') { if (typeof ev.cost === 'number') s.cost += ev.cost; addTokens(s, ev.tokens); }
    if (ev.t === 'status' && ev.status === 'failed') { s.status = 'failed'; push(s, { t: 'status', status: 'failed' }); }
    if (ev.t === 'status' && ev.status === 'done' && !s._stopped) dispatchTeam(s, leadSess, roster, cwd, mode);
  });
  return s;
}

// The best "doer" in a roster (highest vigor+speed) — who to hand a build to.
function bestDoer(roster) {
  return [...roster].sort((a, b) => { const A = species.get(a).stats, B = species.get(b).stats; return (B.vigor + B.speed) - (A.vigor + A.speed); })[0];
}

// Phase 2 — read the lead's plan and send each teammate off on their part.
function dispatchTeam(s, leadSess, roster, cwd, mode) {
  const plan = parseTeamPlan(leadSess.fullText || '');
  let assignments = ((plan && plan.assignments) || []).filter((a) => a && a.task && roster.includes(a.creatureId)).slice(0, MAX_TEAM);
  // The manifest: every file the lead says must exist when done. We verify it on disk.
  const manifest = (plan && Array.isArray(plan.deliverables)) ? plan.deliverables.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()).slice(0, 12) : [];
  if (!assignments.length) {
    // FIX (Mode 1): plan didn't parse → hand the whole job to the best DOER
    // (highest vigor+speed), NOT the keyword-top specialist.
    const doer = bestDoer(roster) || roster[0];
    assignments = [{ creatureId: doer, task: s.task }];
    push(s, { t: 'note', text: `⚠️ plan came back unclear — ${species.get(doer).emoji} ${species.get(doer).name} takes the whole job` });
  }
  const biomes = [...new Set(assignments.map((a) => species.get(a.creatureId).biome))];
  push(s, { t: 'standup', text: (plan && plan.standup) || "Alright crew — let's split this up and go!", synergy: biomes.length >= 3, biomes, deliverables: manifest,
    assignments: assignments.map((a) => { const c = species.get(a.creatureId), k = species.kit(a.creatureId); return { creatureId: a.creatureId, name: c.name, emoji: c.emoji, biome: c.biome, specialty: k ? k.specialty : '', task: a.task }; }) });

  const results = [];
  let pending = assignments.length, repaired = false;

  const finalize = (a, c, wt, result, status, isRepair) => {
    if (s._stopped) return;   // team was stopped — don't wrap up or synthesize
    if (wt && status === 'done') {
      // commit the worker's files onto its branch so the delivery is real + reviewable
      if (worktree.hasChanges(wt.path)) worktree.commitAll(wt.path, `${c.name}: ${String(a.task).replace(/\s+/g, ' ').slice(0, 60)}`);
      push(s, { t: 'delivered', who: a.creatureId, name: c.name, emoji: c.emoji, branch: wt.branch, path: wt.path });
    }
    results.push({ creatureId: a.creatureId, name: c.name, emoji: c.emoji, task: a.task, branch: wt ? wt.branch : null, path: wt ? wt.path : cwd, result, status });
    if (isRepair) return finishTeam(s, results, cwd);
    if (--pending <= 0) verifyDeliverables();
  };

  // FIX (Mode 2 + 3): after everyone's done, check every DECLARED deliverable
  // actually exists on disk (in cwd or any member's worktree). A file nobody was
  // assigned, or one claimed-but-never-written, is missing here — the best doer
  // fills the gap in one repair pass, then we wrap up.
  const verifyDeliverables = () => {
    if (!manifest.length || repaired) return finishTeam(s, results, cwd);
    const locs = [cwd, ...results.map((r) => r.path).filter(Boolean)];
    const missing = manifest.filter((d) => !locs.some((loc) => { try { return fs.existsSync(path.join(loc, d)); } catch { return false; } }));
    if (!missing.length) return finishTeam(s, results, cwd);
    repaired = true;
    const doer = bestDoer(roster) || roster[0];
    push(s, { t: 'note', text: `⚠️ missing deliverable(s): ${missing.join(', ')} — ${species.get(doer).emoji} ${species.get(doer).name} fills the gap` });
    runMember({ creatureId: doer, task: `These required files were never written to disk: ${missing.join(', ')}. Create ${missing.length > 1 ? 'them' : 'it'} now — write the actual, complete file(s), correct and consistent with the goal.` }, 1, true);
  };

  const runMember = (a, attempt, isRepair) => {
    if (s._stopped) return;   // don't launch (or relaunch) a worker for a stopped team
    const c = species.get(a.creatureId);
    if (attempt === 1) a._wt = (mode !== 'plan' && worktree.isGitRepo(cwd)) ? worktree.createWorktree(cwd, `${s.id}-${a.creatureId}${isRepair ? '-fix' : ''}`) : null;
    const wt = a._wt;
    const workCwd = wt ? wt.path : cwd;
    if (wt && attempt === 1) push(s, { t: 'note', text: `🌿 ${c.emoji} ${c.name} works isolated on ${wt.branch}` });
    const nudge = attempt > 1 ? 'Your previous attempt left NO files on disk — you must ACTUALLY WRITE the files this time, do not just describe them. ' : '';
    const mSess = spawnSession({ creatureId: a.creatureId, cwd: workCwd, mode, fresh: true, task: `${nudge}You're part of ${species.get(s.creatureId).name}'s crew tackling this goal:\n"${s.task}"\n\nYOUR ASSIGNMENT: ${a.task}\n\nOther teammates are handling the other parts — focus on yours and leave it done and usable on disk.` });
    mSess.pairParent = s.id; mSess.worktree = wt;
    let myResult = '';
    mSess.listeners.add((ev) => relay(s, a.creatureId, c, ev));
    mSess.listeners.add((ev) => {
      if (ev.t === 'result') { if (typeof ev.cost === 'number') s.cost += ev.cost; addTokens(s, ev.tokens); myResult = ev.text || myResult; }
      if (ev.t === 'status' && ['done', 'failed', 'stopped'].includes(ev.status)) {
        // FIX (Mode 3): a "done" member whose worktree has NO changes wrote nothing → retry once.
        if (wt && ev.status === 'done' && attempt === 1 && !worktree.hasChanges(wt.path)) {
          push(s, { t: 'note', text: `↻ ${c.emoji} ${c.name} reported done but wrote nothing — re-running once` });
          return runMember(a, 2, isRepair);
        }
        finalize(a, c, wt, myResult, ev.status, isRepair);
      }
    });
  };
  for (const a of assignments) runMember(a, 1, false);
}

// Phase 3 — the lead pulls it together: a short wrap-up of what the crew shipped.
function finishTeam(s, results, cwd) {
  const lead = species.get(s.creatureId) || species.get('clawde');
  // Land the crew's work in the human's folder: merge each delivered branch back in.
  // Clean merges (disjoint files) just appear; an overlap stays on its branch for review.
  const merged = [], conflicted = [];
  for (const r of results) {
    if (!r.branch || r.status !== 'done') continue;
    const m = worktree.mergeBranch(cwd, r.branch);
    if (m.ok) { merged.push(r); try { worktree.removeWorktree(cwd, r.path); worktree.deleteBranch(cwd, r.branch); } catch {} r.branch = null; }
    else if (m.conflict) conflicted.push(r);
  }
  if (merged.length) push(s, { t: 'note', text: `✅ merged into your folder: ${merged.map((r) => r.emoji + ' ' + r.name).join(', ')}` });
  if (conflicted.length) push(s, { t: 'note', text: `⚠️ overlap — left on a branch to review: ${conflicted.map((r) => r.branch).join(', ')}` });

  push(s, { t: 'note', text: `🎪 ${lead.emoji} ${lead.name} is pulling it all together…` });
  const lines = results.map((r) => `- ${r.emoji} ${r.name} — ${r.task.slice(0, 90)}${r.branch ? ` [branch ${r.branch}]` : ''}${r.status !== 'done' ? ` (${r.status})` : ''}: ${(r.result || '(finished)').slice(0, 350)}`).join('\n');
  const synTask = `You are ${lead.name}, leading the crew. The goal was:\n"${s.task}"\n\nYour teammates finished their parts:\n${lines}\n\nWrite a VERY SHORT wrap-up for your human — at most 2 short plain sentences, no markdown, no emoji, no symbols. Just: what the crew shipped, and the one thing to do next. Keep it tiny — it shows in a small pixel window.`;
  const synSess = spawnSession({ creatureId: s.creatureId, cwd, mode: 'plan', fresh: true, task: synTask });
  synSess.pairParent = s.id;
  synSess.listeners.add((ev) => {
    if (ev.t === 'result') { if (typeof ev.cost === 'number') s.cost += ev.cost; addTokens(s, ev.tokens); }
    if (ev.t === 'status' && ['done', 'failed', 'stopped'].includes(ev.status)) {
      push(s, { t: 'synthesis', lead: { name: lead.name, emoji: lead.emoji }, text: (synSess.fullText || '').trim() || 'The crew shipped their parts — check the branches above.', branches: results.filter((r) => r.branch).map((r) => ({ name: r.name, emoji: r.emoji, branch: r.branch })) });
      s.status = 'done'; push(s, { t: 'status', status: 'done' });
      try { agentlog.write(s); } catch {}   // save the crew's transcript + raw log
    }
  });
}

module.exports = { spawnSession, spawnPair, spawnTeam, spawnRemote, feedRemoteEvent, activePairs, activeTeams, MAX_PAIRS, MAX_TEAM, crew, getSession, stop, stopAll, agentSystem, MODES, sessions, setBridge, requestPermission, answerPermission, requestHelp, answerHelp, recommend, pickPair };

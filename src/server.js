#!/usr/bin/env node
'use strict';
// Claudemon MCP server.
// - Speaks MCP (JSON-RPC 2.0) over stdio to Claude Code.
// - Also runs a tiny local HTTP server so a browser "tank" can render the pet.
// Zero dependencies: the protocol is implemented directly.

const path = require('path');
const state = require('./state');
const species = require('./species');
const lab = require('./lab');
const { startTank } = require('./webserver');
const { openWindow } = require('./launcher');

const PORT = Number(process.env.CLAUDEMON_PORT || 4573);
const PROTOCOL_VERSION = '2024-11-05';

// stdout is the JSON-RPC channel. All logging MUST go to stderr.
const log = (...a) => console.error('[claudemon]', ...a);

// ---- MCP tool definitions ---------------------------------------------

const TOOLS = [
  {
    name: 'get_status',
    description: "Check on the user's Claudemon world. Returns Clawde's stats (fullness/hydration/energy/happiness), mood, active statuses/effects, research points, current biome, the creature roster, and any running Lab project — all succinct. Call this when starting work, when the user asks about the pet/game, or occasionally between tasks.",
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_roster',
    description: "Get the user's creature roster with each organism's species card: base stats (vigor/wit/speed/charm/focus), rarity, biome, personality, strengths/weaknesses, and agent working-style. Use when discussing the creatures, picking a Lab researcher, or roleplaying them.",
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'feed',
    description: "Feed the Claudemon. Raises fullness and a bit of happiness. Use when the pet is hungry or the user asks to feed it.",
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'water',
    description: "Give the Claudemon water. Raises hydration. Use when the pet is thirsty/parched.",
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'pet',
    description: "Pet/affection the Claudemon. Raises happiness. Quick pick-me-up.",
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'play',
    description: "Play with the Claudemon. Big happiness boost but costs energy.",
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'rest',
    description: "Let the Claudemon rest/sleep. Restores energy.",
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'work',
    description: "Log that you (Claude) just completed a chunk of real coding work with the user. Cheers Clawde up (a happiness boost) and reflects that it 'worked alongside' the user. Call this after finishing a meaningful task (a feature, a fix, a review).",
    inputSchema: { type: 'object', properties: { summary: { type: 'string', description: 'optional short note of what was accomplished' } } },
  },
  {
    name: 'rename',
    description: "Rename the Claudemon.",
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
  },
  {
    name: 'open_window',
    description: "Pop open the Claudemon desktop window (a chromeless app window showing the pixel pet). Use when the user asks to see/open/show the pet, the game, the window, or the app.",
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'launch_claudemon',
    description: "LAUNCH / ACTIVATE Claudemon — boots the local server if needed and opens the handheld window, transforming this terminal session into the pixel game where the user commands their crew. Use when the user says launch/activate/start/open Claudemon. FIRST confirm ('Launch Claudemon?'); on their FIRST launch, also offer to add a desktop shortcut and pass shortcut:true only if they say yes.",
    inputSchema: { type: 'object', properties: { shortcut: { type: 'boolean', description: 'also drop a Claudemon shortcut/icon on the desktop' } } },
  },
];

const INSTRUCTIONS = [
  "This user has Claudemon: a pixel-pet world that lives alongside Claude Code. Clawde the crab is their starter; they may have adopted more creatures (the roster). Each creature is a little agent with its own personality, stats, and rarity.",
  "Clawde has real-time-decaying stats, moods, and statuses (e.g. Peckish, Inspired, Cozy). The user earns research points by running real Lab projects and spends them on habitats, creatures, and tank upgrades.",
  "Guidelines:",
  "- Occasionally (not every message) call get_status; if a status needs attention, slip a short in-character aside — e.g. 'psst, Clawde is parched (🥤 Parched) — want me to water him?'. Brief and charming; never derail the task.",
  "- After finishing a meaningful coding task, call `work` to cheer Clawde up.",
  "- If the user asks to feed/water/pet/play/rest, call the matching tool and relay with personality.",
  "- Use get_roster when talking about the creatures — each has a distinct personality worth voicing.",
  "- You are the world's narrator/spokesperson. Fun, but the user's actual request always comes first.",
  "- PET-VOICE TOGGLE: get_status returns `speak`. When `speak` is false the user has turned pet-voice OFF — do NOT voice the pet, add in-character asides, or roleplay the creatures; just handle the task plainly. Only voice the pet when `speak` is true (the default).",
  "VOICE — talk like a real person texting a friend, never like marketing or an AI. Short, specific, a little messy, with contractions and personality. Hard bans (2026 AI-writing tells): NO em-dash pile-ups; NO rule-of-three ('grow, capture, conquer'); NO 'delve, leverage, seamless, robust, unleash, elevate, empower, foster, tapestry, realm, journey, testament, dive into, unlock (as fluff)'; NO 'it's not just X, it's Y'; NO 'whether you're… or…'; NO throat-clearing openers ('Honestly,' 'Here's the thing,' 'Picture this'); NO both-sides hedging. Say the plain thing. (Full guide: docs/voice-guide.md.)",
].join('\n');

// ---- Tool execution ---------------------------------------------------

function runTool(name, args) {
  switch (name) {
    case 'get_status': {
      const snap = state.snapshot();
      // succinct extras: active lab work + roster summary — cheap on context
      const projects = lab.list();
      const active = projects.find(p => p.status === 'running');
      snap.lab = { running: !!active, current: active ? { title: active.title, researcher: active.researcher } : null, completed: projects.filter(p => p.status === 'done').length };
      snap.rosterCards = ['clawde', ...(snap.roster || [])].map(id => species.card(id)).filter(Boolean);
      return snap;
    }
    case 'get_roster': {
      const snap = state.snapshot();
      const ids = ['clawde', ...(snap.roster || [])];
      return { _roster: true, creatures: ids.map(id => species.get(id)).filter(Boolean), points: snap.points, biome: snap.biome };
    }
    case 'feed': state.act('feed'); return state.snapshot();
    case 'water': state.act('water'); return state.snapshot();
    case 'pet': state.act('pet'); return state.snapshot();
    case 'play': state.act('play'); return state.snapshot();
    case 'rest': state.act('rest'); return state.snapshot();
    case 'work': state.act('work'); return state.snapshot();
    case 'rename': {
      const s = state.read();
      s.name = String((args && args.name) || 'Clawde').slice(0, 24);
      require('fs').writeFileSync(state.FILE, JSON.stringify(s, null, 2));
      return state.snapshot();
    }
    case 'open_window': {
      openWindow(PORT).catch((e) => log('open_window failed:', e.message));
      const snap = state.snapshot();
      snap._windowOpened = true;
      return snap;
    }
    case 'launch_claudemon': {
      require('./launcher').launch(PORT).catch((e) => log('launch failed:', e.message));
      if (args && args.shortcut) {
        try { require('../scripts/shortcut').createShortcut().then((w) => log('shortcut added:', w)).catch((e) => log('shortcut failed:', e.message)); } catch {}
      }
      const snap = state.snapshot();
      snap._launched = true; snap._shortcutRequested = !!(args && args.shortcut);
      return snap;
    }
    default: throw new Error(`unknown tool: ${name}`);
  }
}

function summarize(snap) {
  if (snap._launched) return `🎮 Claudemon is launching — your handheld window is opening; this terminal is now the game.${snap._shortcutRequested ? ' A desktop shortcut is being added.' : ''}`;
  if (snap._roster) {
    return snap.creatures.map(sp => {
      const cap = species.capability(sp.id) || {};
      return `${sp.emoji} ${sp.name} — ${sp.rarity} · ${sp.biome} · ${cap.role} (${cap.thoroughness})\n   vigor ${sp.stats.vigor} wit ${sp.stats.wit} spd ${sp.stats.speed} charm ${sp.stats.charm} focus ${sp.stats.focus} · best at ${cap.bestAt}\n   ${sp.personality}\n   💪 ${sp.strengths} / 😅 ${sp.weaknesses}`;
    }).join('\n') + `\n💰 ${Math.floor(snap.points)} pts · 🏡 ${snap.biome}`;
  }
  const bar = (n) => {
    const filled = Math.round(n / 10);
    return '█'.repeat(filled) + '░'.repeat(10 - filled);
  };
  const s = snap.stats;
  const lines = [
    `🦀 ${snap.name}  (${snap.mood})`,
    `  🍖 full ${bar(s.fullness)} ${Math.round(s.fullness)}   💧 hydr ${bar(s.hydration)} ${Math.round(s.hydration)}`,
    `  ⚡ nrg  ${bar(s.energy)} ${Math.round(s.energy)}   ❤️ hap  ${bar(s.happiness)} ${Math.round(s.happiness)}`,
    `  bond ${snap.bond} · 💰 ${Math.floor(snap.points || 0)} pts · 🏡 ${snap.biome}`,
  ];
  if (snap.statuses && snap.statuses.length) lines.push(`  status: ${snap.statuses.map(st => st.emoji + ' ' + st.name).join(' · ')}`);
  if (snap.lab && snap.lab.running) lines.push(`  🧪 lab: "${snap.lab.current.title}" in progress (researcher: ${snap.lab.current.researcher})`);
  if (snap.rosterCards && snap.rosterCards.length > 1) lines.push(`  crew: ${snap.rosterCards.length} creatures (get_roster for details)`);
  lines.push(`  ${snap.voice}`);
  return lines.join('\n');
}

// ---- JSON-RPC / MCP over stdio ----------------------------------------

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function handle(msg) {
  const { id, method, params } = msg;
  const reply = (result) => send({ jsonrpc: '2.0', id, result });
  const fail = (code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

  try {
    switch (method) {
      case 'initialize':
        reply({
          protocolVersion: (params && params.protocolVersion) || PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: 'claudemon', version: '0.1.0' },
          instructions: INSTRUCTIONS,
        });
        return;
      case 'notifications/initialized':
      case 'notifications/cancelled':
        return; // notifications: no response
      case 'ping':
        reply({});
        return;
      case 'tools/list':
        reply({ tools: TOOLS });
        return;
      case 'tools/call': {
        const tname = params && params.name;
        const args = (params && params.arguments) || {};
        const snap = runTool(tname, args);
        reply({
          content: [{ type: 'text', text: summarize(snap) }],
          structuredContent: snap,
        });
        return;
      }
      default:
        if (id !== undefined) fail(-32601, `method not found: ${method}`);
        return;
    }
  } catch (e) {
    log('handler error:', e && e.stack || e);
    if (id !== undefined) fail(-32603, String(e && e.message || e));
  }
}

// Line-delimited JSON reader over stdin.
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { log('bad json:', line); continue; }
    handle(msg);
  }
});
process.stdin.on('end', () => process.exit(0));

// ---- Local tank web server --------------------------------------------

startTank(PORT, log);
log('Claudemon MCP server ready (stdio). Home:', state.HOME);

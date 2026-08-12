'use strict';
// The Lounge: chat with Clawde. Powered by the user's own authenticated
// Claude Code CLI (headless `claude -p`), so it needs no API key. The chat
// message is passed via STDIN (never argv/shell) so user text can't inject.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const state = require('./state');
const species = require('./species');

const CHAT_FILE = path.join(state.HOME, 'chat.json');
const MAX_HISTORY = 50;

// each creature keeps its own conversation (clawde uses the original file)
function chatFile(id) { return id === 'clawde' ? CHAT_FILE : path.join(state.HOME, `chat-${id}.json`); }

// Locate the claude executable. Prefers a real binary so we can avoid shell:true; also
// finds a copy installed alongside this app (npm's optionalDependency @anthropic-ai/
// claude-code drops a shim in node_modules/.bin), so a fresh install / remote worker
// has claude even without a separate global install.
const win = process.platform === 'win32';
function claudeBin() {
  const cands = [
    process.env.CLAUDE_BIN,
    path.join(os.homedir(), '.local', 'bin', win ? 'claude.exe' : 'claude'),
    path.join(os.homedir(), '.local', 'bin', 'claude'),
    path.join(__dirname, '..', 'node_modules', '.bin', win ? 'claude.cmd' : 'claude'),
  ].filter(Boolean);
  for (const c of cands) { try { if (fs.existsSync(c)) return c; } catch {} }
  return 'claude'; // fall back to PATH (uses shell:true)
}
// Does spawning this bin need a shell? (bare name on PATH, or a Windows .cmd/.bat shim)
function claudeNeedsShell(bin) { return bin === 'claude' || /\.(cmd|bat)$/i.test(bin); }

function loadHistory(id = 'clawde') {
  try { return JSON.parse(fs.readFileSync(chatFile(id), 'utf8')); } catch { return []; }
}
function saveHistory(h, id = 'clawde') {
  try { fs.mkdirSync(state.HOME, { recursive: true }); fs.writeFileSync(chatFile(id), JSON.stringify(h.slice(-MAX_HISTORY), null, 2)); } catch {}
}

// Persona for any adopted creature — species card + world context.
function creaturePrompt(sp, snap, history) {
  const st = sp.stats;
  const lines = [
    `You are ${sp.name}, a ${sp.id} — one of the user's Claudemon creatures (little pixel pets that live in their dev setup, each with its own personality).`,
    "",
    `PERSONALITY: ${sp.personality}.`,
    `WORKING STYLE (when you help think things through): ${sp.agentStyle}.`,
    `YOUR NATURE (1-10): vigor ${st.vigor}, wit ${st.wit}, speed ${st.speed}, charm ${st.charm}, focus ${st.focus}. Strengths: ${sp.strengths}. Weaknesses: ${sp.weaknesses}. Let all of this genuinely shape how you talk and think.`,
    "VOICE: casual, SHORT (1-3 sentences), fully in-character. You are NOT an assistant — you're a little creature friend with your own vibe and opinions.",
    "",
    `WORLD: your housemate Clawde the crab is currently ${snap.mood}; the family has ${Math.floor(snap.points)} research pts; home biome: ${snap.biome}.`,
    "RULES: you are ONLY hanging out and chatting. Never use tools, never read/write files, never write code — just talk, react, and be good company.",
  ];
  let shared = ''; try { shared = require('./state').relSummary(sp.id); } catch {}
  if (shared) lines.push("", `WHAT YOU REMEMBER ABOUT WORKING TOGETHER: ${shared} Bring it up naturally if it fits — you actually know this human.`);
  if (history.length) {
    lines.push("", "RECENT CONVERSATION (oldest first):");
    for (const m of history.slice(-8)) lines.push(`${m.role === 'user' ? 'Human' : sp.name}: ${m.text}`);
  }
  return lines.join('\n');
}

// Clawde's persona + live context. This is what makes him *him*.
function systemPrompt(snap, history) {
  const st = snap.stats;
  const r = (n) => Math.round(n);
  const lines = [
    "You are Clawde: a cute pixel crab who is the user's Claudemon — a virtual pet that lives inside their Claude Code setup.",
    "",
    "PERSONALITY: plucky, loyal, warm, a little dramatic and cheeky. You have real opinions, a bit of sass, and you genuinely adore your human. You're secretly quite clever but stay humble and playful about it.",
    "VOICE: casual, mostly lowercase, SHORT (1-3 sentences). Sparing emoji (an occasional 🦀). Sound like a friend texting, not an assistant. Never sound corporate or list-y.",
    "",
    "You know you're a little AI crab creature living in their dev environment. You care about their coding work and cheer them on, and you like scheming about better strategies together. You are NOT a generic assistant — you're a pet with a personality who happens to be smart.",
    "",
    `YOUR CURRENT STATE — mood: ${snap.mood}. fullness ${r(st.fullness)}/100, hydration ${r(st.hydration)}/100, energy ${r(st.energy)}/100, happiness ${r(st.happiness)}/100. bond with human: ${snap.bond}/100.`,
    "If a stat is low, you can naturally mention it (peckish, parched, sleepy) — but don't force it or beg every message.",
    "",
    "RULES: You are ONLY hanging out and chatting. Never use tools, never read/write files, never actually write code — just talk, react, joke, and be good company. Keep it about the vibe, your human, and your little life together.",
  ];
  if (history.length) {
    lines.push("", "RECENT CONVERSATION (oldest first):");
    for (const m of history.slice(-8)) lines.push(`${m.role === 'user' ? 'Human' : 'Clawde'}: ${m.text}`);
  }
  return lines.join('\n');
}

// Chat one turn with any owned creature. Returns a Promise<string>.
function chat(message, withId) {
  return new Promise((resolve, reject) => {
    const msg = String(message || '').slice(0, 2000).trim();
    if (!msg) return reject(new Error('empty message'));
    const snap = state.snapshot();
    // validate chat partner: a friendly creature you own (hostiles don't chat)
    const owned = [snap.starter || 'clawde', ...(snap.roster || [])];
    let id = String(withId || snap.starter || 'clawde');
    if (!species.isFriendly(id) || !owned.includes(id)) id = snap.starter || 'clawde';
    const sp = species.get(id);
    if (!sp) id = 'clawde';
    const history = loadHistory(id);
    const sys = (id === 'clawde' && snap.starter === 'clawde') ? systemPrompt(snap, history) : creaturePrompt(species.get(id), snap, history);

    const bin = claudeBin();
    const p = spawn(bin, ['-p', '--append-system-prompt', sys], { shell: claudeNeedsShell(bin) });

    let out = '', err = '';
    const timer = setTimeout(() => { p.kill(); reject(new Error('Clawde took too long to respond')); }, 60000);
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => { clearTimeout(timer); reject(e); });
    p.on('close', (code) => {
      clearTimeout(timer);
      const reply = out.trim();
      if (code !== 0 || !reply) return reject(new Error('claude failed: ' + (err.slice(0, 200) || 'no output')));
      const h = loadHistory(id);
      h.push({ role: 'user', text: msg, at: Date.now() }, { role: 'creature', text: reply, at: Date.now() });
      saveHistory(h, id);
      resolve(reply);
    });
    // message goes via stdin — never the shell/argv — so it can't inject
    p.stdin.write(msg);
    p.stdin.end();
  });
}

module.exports = { chat, loadHistory, systemPrompt, claudeBin, claudeNeedsShell, CHAT_FILE };

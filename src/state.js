'use strict';
// Claudemon state engine: persistence + real-time stat decay for ONE creature.
// (Evolution was scrapped — Clawde is a single entity whose mood/expression
// changes instead of morphing into new forms.)
// State lives in a single JSON file so multiple processes (the MCP server,
// the statusline script, the web tank) can all read the same creature.

const fs = require('fs');
const path = require('path');
const species = require('./species');

const HOME = process.env.CLAUDEMON_HOME || path.join(__dirname, '..', 'state');
const FILE = path.join(HOME, 'pet.json');

// Decay per real hour (stats are 0..100, higher = healthier).
const DECAY = { fullness: 9, hydration: 13, energy: 6, happiness: 5 };

// How much each action helps.
const ACTIONS = {
  feed:  { fullness: +45, happiness: +6,  verb: 'fed' },
  water: { hydration: +55, happiness: +5, verb: 'watered' },
  pet:   { happiness: +22, energy: +4,    verb: 'petted' },
  play:  { happiness: +28, energy: -12,   verb: 'played with' },
  rest:  { energy: +50, happiness: +3,    verb: 'let rest' },
  // "work" is called by Claude when real coding work happens.
  work:  { happiness: +8, energy: -5,     verb: 'worked alongside you' },
};

function clamp(n) { return Math.max(0, Math.min(100, n)); }
function now() { return Date.now(); }

function defaultState() {
  const t = now();
  return {
    version: 3,
    starter: null,     // chosen at first run via the egg screen (species id)
    name: null,        // display name of the main creature (set on hatch)
    createdAt: t,
    lastUpdate: t,
    stats: { fullness: 80, hydration: 80, energy: 90, happiness: 80 },
    bond: 60,          // slow EMA of overall wellbeing — how well cared-for over time
    points: 0,         // research points, earned in the Lab (proto tycoon currency)
    tank: { tier: 1, decorations: [] }, // upgrades bought in the shop
    biome: 'aquatic',            // the currently-active tank
    unlockedBiomes: ['aquatic'], // everyone starts with water; others unlock in the shop
    roster: [],                  // adopted creature species ids (the starter is implicit)
    main: null,                  // the FEATURED creature (defaults to the starter)
    occupants: {},               // per-biome tank residents: { biome: [creatureIds] }
    effects: {},                 // timed effects, e.g. { inspiredUntil: ts }
    rel: {},                     // per-creature relationship memory (spans every repo): { id: {lastSeen,focus,wins,sessions[]} }
    totals: { feed: 0, water: 0, pet: 0, play: 0, rest: 0, work: 0 },
    lastAction: null,
    lastActionAt: null,
  };
}

function load() {
  try {
    return Object.assign(defaultState(), JSON.parse(fs.readFileSync(FILE, 'utf8')));
  } catch {
    return defaultState();
  }
}

function save(s) {
  try {
    fs.mkdirSync(HOME, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(s, null, 2));
  } catch { /* best effort */ }
}

function wellbeing(s) {
  const v = s.stats;
  return (v.fullness + v.hydration + v.energy + v.happiness) / 4;
}

// Apply time-based decay since lastUpdate; drift bond toward wellbeing.
// A comfier home slows decay: each decoration -4%, each tank tier above 1
// -5%, floored at 50% of base decay. This is the incentive to upgrade.
function comfortMultiplier(s) {
  const tank = s.tank || { tier: 1, decorations: [] };
  const comfort = (tank.decorations || []).length * 0.04 + (Math.max(1, tank.tier) - 1) * 0.05;
  return Math.max(0.5, 1 - comfort);
}

function tick(s) {
  const t = now();
  const hours = Math.max(0, (t - s.lastUpdate) / 3600000);
  if (hours > 0) {
    const mult = comfortMultiplier(s);
    for (const k of Object.keys(DECAY)) s.stats[k] = clamp(s.stats[k] - DECAY[k] * mult * hours);
    const alpha = Math.min(1, hours / 6); // ~6h to substantially move bond
    s.bond = clamp(s.bond + (wellbeing(s) - s.bond) * alpha);
    s.lastUpdate = t;
  }
  return s;
}

function act(action) {
  const def = ACTIONS[action];
  if (!def) throw new Error(`unknown action: ${action}`);
  const s = tick(load());
  for (const [k, dv] of Object.entries(def)) {
    if (k === 'verb') continue;
    s.stats[k] = clamp((s.stats[k] || 0) + dv);
  }
  s.totals[action] = (s.totals[action] || 0) + 1;
  s.lastAction = action;
  s.lastActionAt = now();
  save(s);
  return s;
}

// Read current state with decay applied (and persisted).
function read() {
  const s = tick(load());
  save(s);
  return s;
}

// Grant (or spend, with negative n) research points.
function addPoints(n) {
  const s = tick(load());
  s.points = Math.max(0, (s.points || 0) + n);
  save(s);
  return s.points;
}

// Apply fn to the live state and persist (used by the shop).
function mutate(fn) {
  const s = tick(load());
  fn(s);
  save(s);
  return s;
}

// "off adventuring in Clawland" — heartbeat-based so it clears itself if the game tab dies
function setPlaying(on) { return mutate((s) => { s.playingUntil = on ? now() + 25000 : 0; }); }
function isPlaying() { return (read().playingUntil || 0) > now(); }
function setSpeak(on) { return mutate((s) => { s.speakOff = !on; }); }   // pet-voice on/off
function isSpeak() { return !read().speakOff; }

// Hatch a starter egg: sets the main creature + its home biome. One-time.
function chooseStarter(biome) {
  const egg = species.EGGS[biome];
  if (!egg) throw new Error('unknown egg');
  return mutate((s) => {
    if (s.starter) throw new Error('you already hatched an egg');
    const sp = species.get(egg.species);
    s.starter = sp.id;
    s.main = sp.id;
    s.name = sp.name;
    s.biome = biome;
    s.unlockedBiomes = [biome];
    s.stats = { fullness: 85, hydration: 85, energy: 95, happiness: 85 };
    s.createdAt = now();
    s.lastUpdate = now();
  });
}

// ---- Derived presentation helpers -------------------------------------

const SEVERE = { fullness: 'starving', hydration: 'parched', energy: 'exhausted', happiness: 'lonely' };
const LOW = { fullness: 'hungry', hydration: 'thirsty', energy: 'sleepy', happiness: 'restless' };

function mood(s) {
  const [key, val] = Object.entries(s.stats).sort((a, b) => a[1] - b[1])[0];
  if (val < 15) return SEVERE[key];
  if (val < 35) return LOW[key];
  const wb = wellbeing(s);
  if (wb > 80) return 'thriving';
  if (wb > 60) return 'content';
  return 'okay';
}

// Map the fine-grained mood to a coarse expression/sprite state.
// The tank falls back to 'idle' when a state has no dedicated sprite yet.
function moodState(m) {
  if (['starving', 'hungry', 'parched', 'thirsty'].includes(m)) return 'hungry';
  if (['exhausted', 'sleepy'].includes(m)) return 'sleepy';
  if (['lonely', 'restless'].includes(m)) return 'sad';
  if (['thriving', 'content'].includes(m)) return 'happy';
  return 'idle';
}

// Little statuses/effects — visible in the tank UI and exposed to Claude.
// Mostly informational; 'inspired' has a real effect (+bonus pts on lab work).
function statuses(s) {
  const v = s.stats, out = [], t = now();
  if (v.fullness >= 80) out.push({ id: 'wellfed', emoji: '😋', name: 'Well Fed', desc: 'belly full, spirits high' });
  else if (v.fullness < 35) out.push({ id: 'peckish', emoji: '🍖', name: 'Peckish', desc: 'could really use a snack' });
  if (v.hydration >= 80) out.push({ id: 'bubbly', emoji: '💧', name: 'Bubbly', desc: 'fully hydrated' });
  else if (v.hydration < 35) out.push({ id: 'parched', emoji: '🥤', name: 'Parched', desc: 'needs water soon' });
  if (v.energy < 35) out.push({ id: 'drowsy', emoji: '😴', name: 'Drowsy', desc: 'running on fumes' });
  if (s.lastAction === 'play' && s.lastActionAt && t - s.lastActionAt < 15 * 60 * 1000)
    out.push({ id: 'playful', emoji: '🎾', name: 'Playful', desc: 'still buzzing from playtime' });
  if (s.effects && s.effects.inspiredUntil > t)
    out.push({ id: 'inspired', emoji: '💡', name: 'Inspired', desc: '+20 bonus pts on the next Lab project' });
  const comfort = Math.round((1 - comfortMultiplier(s)) * 100);
  if (comfort >= 8) out.push({ id: 'cozy', emoji: '🛋️', name: 'Cozy', desc: `comfy home: stats decay ${comfort}% slower` });
  if (s.bond >= 75) out.push({ id: 'bonded', emoji: '💞', name: 'Bonded', desc: 'deeply attached to you' });
  return out;
}

// A short line the creature would "say" — Claude can voice this.
function voiceLine(s) {
  const v = s.stats;
  const needs = [];
  if (v.hydration < 30) needs.push('water');
  if (v.fullness < 30) needs.push('food');
  if (v.energy < 25) needs.push('a nap');
  if (v.happiness < 30) needs.push('some attention');
  const m = mood(s);
  if (needs.length) return `${s.name} is ${m} — could really use ${needs[0]}.`;
  if (wellbeing(s) > 80) return `${s.name} is thriving and happy to be here.`;
  return `${s.name} is doing okay.`;
}

// ---- Tank residency: main creature + who shares each biome's tank ----------
// Capacity by tank size: tier 1 = 1 resident, tier 2 = 2, tier 3 = 3 — all of
// the SAME biome. You pick a "main" (the featured face) and which others live in.
function tankCapacity(s) { return Math.max(1, Math.min(3, (s.tank && s.tank.tier) || 1)); }

function ownedFriendly(s) {
  const ids = [s.starter, ...(s.roster || [])].filter(Boolean);
  return ids.filter((id, i) => ids.indexOf(id) === i && species.isFriendly(id) && species.get(id));
}

function mainId(s) {
  const owned = ownedFriendly(s);
  return (s.main && owned.includes(s.main)) ? s.main : (s.starter || owned[0] || 'clawde');
}

// Companion ids that share the given biome's tank (excludes the main), capped by
// capacity minus the main's own slot if the main lives in that biome.
function occupantsFor(s, biome) {
  const main = mainId(s);
  const candidates = ownedFriendly(s).filter(id => id !== main && species.get(id).biome === biome);
  const chosen = Array.isArray(s.occupants && s.occupants[biome])
    ? s.occupants[biome].filter(id => candidates.includes(id))
    : candidates; // default: everyone eligible, capped below
  const mainHere = species.get(main).biome === biome;
  const room = Math.max(0, tankCapacity(s) - (mainHere ? 1 : 0));
  return chosen.slice(0, room);
}

function setMain(id) {
  return mutate((s) => {
    if (!ownedFriendly(s).includes(id)) throw new Error('you can only feature a friendly creature you own');
    s.main = id;
  });
}

function setTankOccupants(biome, ids) {
  return mutate((s) => {
    const main = mainId(s);
    const eligible = ownedFriendly(s).filter(x => x !== main && species.get(x).biome === biome);
    const clean = (ids || []).filter(x => eligible.includes(x) && (ids || []).indexOf(x) === ids.indexOf(x));
    const mainHere = species.get(main).biome === biome;
    const room = Math.max(0, tankCapacity(s) - (mainHere ? 1 : 0));
    s.occupants = s.occupants || {};
    s.occupants[biome] = clean.slice(0, room);
  });
}

// A view of every tank the user owns — powers the Den / Tanks page.
function tanksView() {
  const s = read();
  const main = mainId(s), cap = tankCapacity(s);
  return {
    main, capacity: cap, activeBiome: s.biome || 'aquatic',
    tanks: (s.unlockedBiomes || ['aquatic']).map((biome) => {
      const mainHere = species.get(main).biome === biome;
      const residents = occupantsFor(s, biome);
      return {
        biome, capacity: cap, active: biome === (s.biome || 'aquatic'),
        main: mainHere ? main : null,
        residents,
        candidates: ownedFriendly(s).filter(id => species.get(id).biome === biome),
        full: residents.length + (mainHere ? 1 : 0) >= cap,
      };
    }),
  };
}

// ---- RELATIONSHIP MEMORY: how a creature comes to know you, across every repo --
// Each creature keeps its OWN record of your work together (it has its own
// personality — this is how it gets to know YOU). Built zero-token from the same
// real-work signals the reaction engine already sees. No streaks, no punishment.
const CURRENT_MAIN = () => { try { return mainId(read()); } catch { return null; } };

function relRecord(s, id) {
  s.rel = s.rel || {};
  if (!s.rel[id]) s.rel[id] = { lastSeen: 0, focus: '', wins: 0, sessions: [] };
  return s.rel[id];
}

// Start a fresh work session with this creature (records which repo; caps history).
function beginSession(id, repo) {
  if (!id) return;
  return mutate((s) => {
    const r = relRecord(s, id);
    r.sessions.push({ at: now(), repo: repo || '', commits: 0, greens: 0, edits: 0 });
    if (r.sessions.length > 15) r.sessions.shift();
    if (repo) r.focus = repo;
    r.lastSeen = now();
  });
}

// Fold a real-work signal ('commit' | 'tests' | 'edit') into the open session.
function noteSignal(id, kind, repo) {
  if (!id) return;
  return mutate((s) => {
    const r = relRecord(s, id);
    if (!r.sessions.length) r.sessions.push({ at: now(), repo: repo || '', commits: 0, greens: 0, edits: 0 });
    const cur = r.sessions[r.sessions.length - 1];
    if (kind === 'commit') cur.commits++;
    else if (kind === 'tests') { cur.greens++; r.wins++; }
    else if (kind === 'edit') cur.edits++;
    if (repo) { if (!cur.repo) cur.repo = repo; r.focus = repo; }
    r.lastSeen = now();
  });
}

// A zero-token continuity greeting from the LAST session, in this creature's own
// voice (tone keyed to its dominant stat). Returns null if there's nothing to recall.
const GREET_TAIL = {
  focus: 'want to pick up where we dug in?',
  wit: 'ready to think through the next bit?',
  speed: "let's knock out what's next?",
  charm: 'happy to be back with you — what are we on today?',
  vigor: "let's get after it 💪",
};
function greetingFor(id) {
  const s = read();
  const r = (s.rel || {})[id];
  const sp = species.get(id) || species.get('clawde');
  if (!r || !r.sessions.length) return null;
  const last = r.sessions[r.sessions.length - 1];
  const bits = [];
  if (last.commits) bits.push(`landed ${last.commits} commit${last.commits > 1 ? 's' : ''}`);
  if (last.greens) bits.push('got tests green ✅');
  if (!bits.length && last.edits) bits.push(`worked through ${last.edits} edit${last.edits > 1 ? 's' : ''}`);
  const where = last.repo ? ` in ${last.repo}` : '';
  const recap = bits.length ? `last time${where} we ${bits.join(' and ')}` : (last.repo ? `last time we were in ${last.repo}` : '');
  if (!recap) return null;
  const cap = species.capability ? species.capability(id) : null;
  const tail = GREET_TAIL[(cap && cap.primary) || 'charm'] || GREET_TAIL.charm;
  return `${recap} — ${tail}`;
}

// A compact prose recap of your shared history — injected into a creature's own
// prompt so it speaks with real continuity (knows your repos, wins, recent work).
function relSummary(id) {
  const s = read();
  const r = (s.rel || {})[id];
  if (!r || !r.sessions.length) return '';
  const recent = r.sessions.slice(-4).map((x) => {
    const b = [];
    if (x.commits) b.push(`${x.commits} commit${x.commits > 1 ? 's' : ''}`);
    if (x.greens) b.push('green tests');
    if (x.edits) b.push(`${x.edits} edits`);
    return `${x.repo || 'a repo'} (${b.join(', ') || 'hung out'})`;
  }).join('; ');
  const parts = [];
  if (r.focus) parts.push(`lately you two have been working in "${r.focus}"`);
  if (r.wins) parts.push(`${r.wins} win${r.wins > 1 ? 's' : ''} celebrated together`);
  if (recent) parts.push(`recent sessions: ${recent}`);
  return parts.join('. ') + '.';
}

// The line your Main "says" when you open the app: the continuity greeting if you
// two have history, otherwise a warm in-character hello (tone by dominant stat).
const HELLO = {
  focus: 'good to see you — what are we digging into?',
  wit: 'hey — got something to think through?',
  speed: "yo! what are we knocking out today?",
  charm: "hey friend — so glad you're here 💛",
  vigor: "let's build something 💪 what's the mission?",
};
function welcomeLine(id) {
  const g = greetingFor(id);
  if (g) return g;
  const cap = species.capability ? species.capability(id) : null;
  return HELLO[(cap && cap.primary) || 'charm'] || HELLO.charm;
}

function snapshot() {
  const s = read();
  const m = mood(s);
  const main = mainId(s);
  const sp = species.get(main) || species.get('clawde');
  return {
    starter: s.starter || null,
    starterChosen: !!s.starter,
    main,
    name: (main === s.starter ? (s.name || sp.name) : sp.name),
    emoji: sp.emoji,
    mainSprite: sp.sprite,
    capacity: tankCapacity(s),
    occupants: occupantsFor(s, s.biome || 'aquatic'),
    stats: s.stats,
    bond: Math.round(s.bond),
    points: s.points || 0,
    tank: s.tank || { tier: 1, decorations: [] },
    biome: s.biome || 'aquatic',
    unlockedBiomes: s.unlockedBiomes || ['aquatic'],
    roster: s.roster || [],
    statuses: statuses(s),
    comfort: Math.round((1 - comfortMultiplier(s)) * 100), // % slower decay
    wellbeing: Math.round(wellbeing(s)),
    mood: m,
    state: moodState(m),
    playing: (s.playingUntil || 0) > now(),   // off adventuring in Clawland
    voice: voiceLine(s),
    speak: !s.speakOff,   // pet-voice toggle — when false, Claude should NOT voice the pet in-character
    greeting: welcomeLine(main), // what the Main "says" when you open the app
    pulse: s.pulse || null, // the last thing the pet "felt" from your real work
    totals: s.totals,
    ageHours: (now() - s.createdAt) / 3600000,
  };
}

module.exports = { read, act, snapshot, addPoints, mutate, setPlaying, isPlaying, setSpeak, isSpeak, chooseStarter, statuses, mood, moodState, voiceLine, wellbeing, tankCapacity, mainId, occupantsFor, setMain, setTankOccupants, tanksView, beginSession, noteSignal, greetingFor, relSummary, welcomeLine, CURRENT_MAIN, FILE, HOME, ACTIONS };

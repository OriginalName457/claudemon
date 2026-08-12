'use strict';
// THE GAME LAYER — simple achievements that unlock new Claudemon (and their biome tanks).
// You start with one egg → one starter + its tank. Easy early goals hand you a friend
// from each OTHER biome (so all three tanks open up fast), then the rest come with play.
// Everything lives in state so progress continues forever.

const state = require('./state');
const species = require('./species');

const BIOMES = ['aquatic', 'vivarium', 'desert'];
// friendly roster per biome, in unlock-tier order: [starter, uncommon, legendary]
const ROSTER = {
  aquatic: ['clawde', 'octo', 'snail'],
  vivarium: ['mosskit', 'glowbug', 'fernling'],
  desert: ['dunepup', 'mirageling', 'sting'],
};

// The order new friends are handed out (excludes the starter you already have). Front-loads
// the two OTHER biomes' starters so all three tanks unlock early, then uncommons, then legendaries.
function unlockOrder(starterBiome) {
  const others = BIOMES.filter((b) => b !== starterBiome);
  const order = [];
  others.forEach((b) => order.push(ROSTER[b][0]));                 // other two biome starters → their tanks
  [...others, starterBiome].forEach((b) => order.push(ROSTER[b][1])); // uncommons
  [...others, starterBiome].forEach((b) => order.push(ROSTER[b][2])); // legendaries
  return order;
}

// Each achievement is a trigger; when earned it hands you the NEXT friend in unlockOrder.
const ACHIEVEMENTS = [
  { id: 'firstjob', name: 'First Assignment', desc: 'Give a Claudemon their first job', icon: '📋', stat: 'tasks', goal: 1 },
  { id: 'gettinghang', name: 'Getting the Hang of It', desc: 'Send 3 jobs', icon: '⭐', stat: 'tasks', goal: 3 },
  { id: 'crew', name: 'Better Together', desc: 'Run a team of Claudemon', icon: '🎪', stat: 'teams', goal: 1 },
  { id: 'toolsmith', name: 'Toolsmith', desc: 'Add a tool to your toolbelt', icon: '🧰', stat: 'tools', goal: 1 },
  { id: 'networked', name: 'Reach Out', desc: 'Connect another computer', icon: '🖥', stat: 'computers', goal: 1 },
  { id: 'busybee', name: 'Busy Bee', desc: 'Send 10 jobs', icon: '🐝', stat: 'tasks', goal: 10 },
  { id: 'captain', name: 'Crew Captain', desc: 'Run 5 teams', icon: '👑', stat: 'teams', goal: 5 },
  { id: 'seasoned', name: 'Seasoned', desc: 'Send 25 jobs', icon: '🏅', stat: 'tasks', goal: 25 },
];

function card(id) { const sp = species.get(id); return sp ? { id, name: sp.name, emoji: sp.emoji, biome: sp.biome } : null; }

// Count an event, then grant any achievements newly reached. Returns newly-unlocked (for a
// little celebration). Each unlock adds the next friend to the roster + opens their tank.
function bump(event, n = 1) {
  const newly = [];
  state.mutate((s) => {
    s.counters = s.counters || {};
    s.counters[event] = (s.counters[event] || 0) + (n || 1);
    s.achievements = s.achievements || {};
    if (!s.starter) return;   // haven't hatched yet
    const order = unlockOrder(species.get(s.starter).biome);
    const owned = new Set([s.starter, ...(s.roster || [])]);
    for (const a of ACHIEVEMENTS) {
      if (s.achievements[a.id]) continue;
      if ((s.counters[a.stat] || 0) < a.goal) continue;
      s.achievements[a.id] = Date.now();
      const next = order.find((id) => !owned.has(id));
      if (next) {
        s.roster = s.roster || []; if (!s.roster.includes(next)) s.roster.push(next);
        owned.add(next);
        const b = species.get(next).biome;
        s.unlockedBiomes = s.unlockedBiomes || []; if (!s.unlockedBiomes.includes(b)) s.unlockedBiomes.push(b);
        newly.push({ achievement: a.id, achName: a.name, ...card(next), newBiome: !((s.unlockedBiomes || []).slice(0, -1).includes(b)) });
      } else {
        newly.push({ achievement: a.id, achName: a.name });
      }
    }
  });
  return newly;
}

// Full picture for the trophy panel.
function list() {
  let s = {}; try { s = state.read(); } catch {}
  const counters = s.counters || {}, ach = s.achievements || {};
  const owned = new Set([s.starter, ...(s.roster || [])].filter(Boolean));
  const totalFriendly = BIOMES.reduce((n, b) => n + ROSTER[b].length, 0);
  return {
    achievements: ACHIEVEMENTS.map((a) => ({ id: a.id, name: a.name, desc: a.desc, icon: a.icon, goal: a.goal, progress: Math.min(counters[a.stat] || 0, a.goal), unlocked: !!ach[a.id] })),
    counters,
    owned: owned.size, totalFriendly,
    unlockedBiomes: s.unlockedBiomes || [],
  };
}

module.exports = { bump, list, ACHIEVEMENTS, ROSTER, BIOMES, unlockOrder };

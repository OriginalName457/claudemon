'use strict';
// The Shop: spend research points (earned in the Lab) on tank upgrades and
// decorations. Bigger tanks add decoration slots; every decoration and tank
// tier makes the home comfier (slower stat decay — see state.comfortMultiplier).

const state = require('./state');
const species = require('./species');

const BIOMES = {
  aquatic:  { name: 'Water Tank',  emoji: '🌊', cost: 0,    blurb: 'the starter home. sandy + cozy.' },
  vivarium: { name: 'Forest',      emoji: '🌿', cost: 1200, blurb: 'lush + green, fireflies at dusk.' },
  desert:   { name: 'Desert Dome', emoji: '🏜️', cost: 1200, blurb: 'warm pastel sunsets, soft sand.' },
};

const TIERS = {
  1: { name: 'Starter Tank',    w: 192, h: 128, slots: 2, cost: 0 },
  2: { name: 'Big Tank',        w: 256, h: 160, slots: 4, cost: 250 },
  3: { name: 'Grand Aquarium',  w: 320, h: 192, slots: 6, cost: 600 },
};

const DECOR = [
  { id: 'rock',     name: 'Cozy Rock',      emoji: '🪨', cost: 40,  blurb: 'a classic. very sittable.' },
  { id: 'seaweed',  name: 'Seaweed',        emoji: '🌿', cost: 50,  blurb: 'sways gently in the current.' },
  { id: 'starfish', name: 'Starfish',       emoji: '⭐', cost: 60,  blurb: 'a lil friend for the floor.' },
  { id: 'ball',     name: 'Bouncy Ball',    emoji: '⚽', cost: 80,  blurb: 'rolls around — creatures push it!' },
  { id: 'bubbler',  name: 'Bubbler',        emoji: '🫧', cost: 100, blurb: 'extra bubbles! very fancy.' },
  { id: 'chest',    name: 'Treasure Chest', emoji: '💰', cost: 120, blurb: 'sparkles when you least expect.' },
  { id: 'castle',   name: 'Sand Castle',    emoji: '🏰', cost: 150, blurb: 'a noble residence upgrade.' },
];

function catalog() {
  const s = state.snapshot();
  const tank = s.tank;
  const tier = TIERS[tank.tier] || TIERS[1];
  const nextTier = TIERS[tank.tier + 1] || null;
  const unlocked = s.unlockedBiomes || ['aquatic'];
  return {
    points: s.points,
    comfort: s.comfort,
    tank: { tier: tank.tier, name: tier.name, slots: tier.slots, used: (tank.decorations || []).length },
    nextTank: nextTier ? { tier: tank.tier + 1, name: nextTier.name, cost: nextTier.cost, slots: nextTier.slots } : null,
    decorations: DECOR.map(d => ({ ...d, owned: (tank.decorations || []).includes(d.id) })),
    biomes: Object.entries(BIOMES).map(([id, b]) => ({ id, ...b, owned: unlocked.includes(id), active: s.biome === id })),
    creatures: species.friendly().filter(sp => sp.rarity !== 'starter').map(sp => ({
      id: sp.id, name: sp.name, emoji: sp.emoji, biome: sp.biome, rarity: sp.rarity,
      rarityColor: species.RARITY[sp.rarity].color, cost: species.cost(sp.id), blurb: sp.blurb,
      stats: sp.stats,
      owned: (s.roster || []).includes(sp.id),
      comingSoon: !sp.artReady,
      needsBiome: !unlocked.includes(sp.biome) ? sp.biome : null,
    })),
  };
}

// switch the active tank to an unlocked biome (free)
function switchBiome(id) {
  if (!BIOMES[id]) throw new Error('unknown habitat');
  state.mutate((s) => {
    const unlocked = s.unlockedBiomes || ['aquatic'];
    if (!unlocked.includes(id)) throw new Error('not unlocked yet — buy it in the shop!');
    s.biome = id;
  });
  return catalog();
}

function buy(item) {
  let result = null;
  state.mutate((s) => {
    s.tank = s.tank || { tier: 1, decorations: [] };
    if (BIOMES[item] && item !== 'aquatic') {
      const b = BIOMES[item];
      s.unlockedBiomes = s.unlockedBiomes || ['aquatic'];
      if (s.unlockedBiomes.includes(item)) throw new Error('already unlocked!');
      if ((s.points || 0) < b.cost) throw new Error(`need ${b.cost} pts (you have ${Math.floor(s.points || 0)}) — hit the Lab!`);
      s.points -= b.cost;
      s.unlockedBiomes.push(item);
      s.biome = item; // hop over to see your new habitat
      result = { bought: b.name };
      return;
    }
    const sp = species.get(item);
    if (sp && sp.rarity !== 'starter') {
      if (sp.faction === 'hostile') throw new Error(`${sp.name} is a wild creature — you can't adopt it!`);
      s.roster = s.roster || [];
      if (s.roster.includes(sp.id)) throw new Error('already part of the family!');
      if (!sp.artReady) throw new Error(`${sp.name} hasn't hatched yet — coming soon!`);
      const unlocked2 = s.unlockedBiomes || ['aquatic'];
      if (!unlocked2.includes(sp.biome)) throw new Error(`${sp.name} needs the ${sp.biome} habitat first!`);
      const c = species.cost(sp.id);
      if ((s.points || 0) < c) throw new Error(`need ${c} pts (you have ${Math.floor(s.points || 0)}) — hit the Lab!`);
      s.points -= c;
      s.roster.push(sp.id);
      result = { bought: sp.name };
      return;
    }
    if (item === 'tank') {
      const next = TIERS[s.tank.tier + 1];
      if (!next) throw new Error('your tank is already maxed out!');
      if ((s.points || 0) < next.cost) throw new Error(`need ${next.cost} pts (you have ${Math.floor(s.points || 0)}) — hit the Lab!`);
      s.points -= next.cost;
      s.tank.tier += 1;
      result = { bought: next.name };
      return;
    }
    const d = DECOR.find(x => x.id === item);
    if (!d) throw new Error('unknown item');
    if ((s.tank.decorations || []).includes(d.id)) throw new Error('you already own that!');
    const slots = (TIERS[s.tank.tier] || TIERS[1]).slots;
    if (s.tank.decorations.length >= slots) throw new Error(`no free slots — upgrade the tank! (${slots} used)`);
    if ((s.points || 0) < d.cost) throw new Error(`need ${d.cost} pts (you have ${Math.floor(s.points || 0)}) — hit the Lab!`);
    s.points -= d.cost;
    s.tank.decorations.push(d.id);
    result = { bought: d.name };
  });
  return { ...result, ...catalog() };
}

// tank pixel dimensions for a tier (used by the renderer via /api/state)
function tierDims(tier) { const t = TIERS[tier] || TIERS[1]; return { w: t.w, h: t.h }; }

module.exports = { catalog, buy, switchBiome, tierDims, TIERS, DECOR, BIOMES };

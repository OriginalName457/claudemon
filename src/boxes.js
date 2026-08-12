'use strict';
// BOXES (a.k.a. tanks) — the simple way to organize your crew. Each box holds up to
// 3 Claudemon and doubles as a ready team. Members can be ANY owned Claudemon,
// regardless of their native biome — you arrange them however you like, and each
// tank has its OWN biome environment (aquatic / vivarium / desert) you can set.
// Anyone not placed in a box sits on the "bench" (owned minus everyone in a box).
// Persisted as state.boxes = [{ ids:[id,id,id], biome:'aquatic' }, ...].

const state = require('./state');
const species = require('./species');

const CAP = 3;
const BIOMES = ['aquatic', 'vivarium', 'desert'];

function ownedIds(s) {
  const ids = [s.starter, ...(s.roster || [])].filter(Boolean);
  return ids.filter((id, i) => ids.indexOf(id) === i && species.isFriendly(id) && species.get(id));
}

function card(id) {
  const sp = species.get(id);
  return sp ? { id, name: sp.name, emoji: sp.emoji, biome: sp.biome, rarity: sp.rarity } : null;
}

function defBiome(ids) {
  const first = ids.map((id) => species.get(id)).find(Boolean);
  return (first && BIOMES.includes(first.biome)) ? first.biome : 'aquatic';
}

// Accept legacy (array of ids) or new ({ids,biome}) box shapes → {ids, biome}.
function normBox(b) {
  if (Array.isArray(b)) return { ids: b.filter(Boolean), biome: defBiome(b) };
  if (b && typeof b === 'object') { const ids = (Array.isArray(b.ids) ? b.ids : []).filter(Boolean); return { ids, biome: BIOMES.includes(b.biome) ? b.biome : defBiome(ids) }; }
  return { ids: [], biome: 'aquatic' };
}

// A nice starting arrangement: pack biome-diverse trios (best synergy), then fill.
function compose(ids) {
  const remaining = ids.slice();
  const boxes = [];
  while (remaining.length) {
    const box = [];
    const usedBiomes = new Set();
    for (const id of remaining.slice()) {         // first pass: one per distinct biome
      if (box.length >= CAP) break;
      const b = species.get(id).biome;
      if (usedBiomes.has(b)) continue;
      box.push(id); usedBiomes.add(b);
    }
    for (const id of remaining.slice()) {          // fill any leftover slots
      if (box.length >= CAP) break;
      if (!box.includes(id)) box.push(id);
    }
    for (const id of box) remaining.splice(remaining.indexOf(id), 1);
    boxes.push({ ids: box, biome: defBiome(box) });
  }
  return boxes.length ? boxes : [{ ids: [], biome: 'aquatic' }];
}

// Reconcile stored boxes against what's actually owned (drop sold/unowned ids).
function reconcile(s) {
  const owned = ownedIds(s);
  const ownedSet = new Set(owned);
  let boxes = Array.isArray(s.boxes)
    ? s.boxes.map(normBox).map((b) => ({ ids: b.ids.filter((id) => ownedSet.has(id)).slice(0, CAP), biome: b.biome }))
    : null;
  if (!boxes) boxes = compose(owned);
  if (!boxes.length) boxes = [{ ids: [], biome: 'aquatic' }];
  return { boxes, owned };
}

function get() {
  const s = state.read();
  const { boxes, owned } = reconcile(s);
  if (JSON.stringify(boxes) !== JSON.stringify(s.boxes)) state.mutate((st) => { st.boxes = boxes; });
  const placed = new Set(boxes.flatMap((b) => b.ids));
  const unlocked = (Array.isArray(s.unlockedBiomes) && s.unlockedBiomes.length) ? s.unlockedBiomes.filter((b) => BIOMES.includes(b)) : ['aquatic'];
  return {
    cap: CAP,
    biomes: unlocked,        // only the tank types you've unlocked (biome switcher cycles these)
    allBiomes: BIOMES,
    boxes: boxes.map((b, i) => ({ id: i, biome: b.biome, members: b.ids.map(card).filter(Boolean) })),
    bench: owned.filter((id) => !placed.has(id)).map(card).filter(Boolean),   // owned but in no box
  };
}

// Save a whole arrangement. `arr` = array of boxes ({ids,biome} or [ids]). Validated:
// owned only, unique across boxes, capped at 3. Empty boxes kept (a blank tank to fill).
function save(arr) {
  const s = state.read();
  const owned = new Set(ownedIds(s));
  const seen = new Set();
  const clean = (Array.isArray(arr) ? arr : []).map(normBox).map((b) => {
    const out = [];
    for (const id of b.ids) {
      if (out.length >= CAP) break;
      if (owned.has(id) && !seen.has(id)) { out.push(id); seen.add(id); }
    }
    return { ids: out, biome: BIOMES.includes(b.biome) ? b.biome : defBiome(out) };
  });
  state.mutate((st) => { st.boxes = clean.length ? clean : [{ ids: [], biome: 'aquatic' }]; });
  return get();
}

module.exports = { get, save, CAP, BIOMES };

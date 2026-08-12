#!/usr/bin/env node
'use strict';
// One-shot pretty status of the Claudemon pet (for `npm run status`).
const state = require('../src/state');
const s = state.snapshot();
const bar = (n) => '█'.repeat(Math.round(n / 10)) + '░'.repeat(10 - Math.round(n / 10));

if (!s.starterChosen) {
  console.log(`\n🥚  Your egg hasn't hatched yet — open the tank to pick a starter.\n`);
  process.exit(0);
}
console.log(`\n${s.emoji}  ${s.name}  (${s.mood})`);
console.log(`   🍖 fullness  ${bar(s.stats.fullness)} ${Math.round(s.stats.fullness)}`);
console.log(`   💧 hydration ${bar(s.stats.hydration)} ${Math.round(s.stats.hydration)}`);
console.log(`   ⚡ energy    ${bar(s.stats.energy)} ${Math.round(s.stats.energy)}`);
console.log(`   ❤️  happiness ${bar(s.stats.happiness)} ${Math.round(s.stats.happiness)}`);
console.log(`\n   bond ${s.bond} · 💰 ${Math.floor(s.points)} pts · 🏡 ${s.biome} · wellbeing ${s.wellbeing}`);
if (s.pulse && Date.now() - s.pulse.at < 300000) console.log(`   ${s.pulse.emoji} ${s.pulse.note}`);
console.log(`   "${s.voice}"\n`);

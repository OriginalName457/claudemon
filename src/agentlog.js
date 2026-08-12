'use strict';
// Session logs, for the record. When a crew run (solo / pair / team) finishes we
// write two files to state/logs/: a raw <kind>-<id>.jsonl event stream (for research
// / replay / a future cutscene) and a readable <kind>-<id>.md transcript of what the
// Claudemon actually said and did to each other.

const fs = require('fs');
const path = require('path');
const state = require('./state');

const DIR = path.join(state.HOME, 'logs');

function write(s) {
  if (!s || !Array.isArray(s.events) || !s.events.length) return;
  try { fs.mkdirSync(DIR, { recursive: true }); } catch {}
  const base = `${s.kind || 'solo'}-${s.id}`;
  try { fs.writeFileSync(path.join(DIR, base + '.jsonl'), s.events.map((e) => JSON.stringify(e)).join('\n')); } catch {}
  try { fs.writeFileSync(path.join(DIR, base + '.md'), transcript(s)); } catch {}
}

function transcript(s) {
  const L = [];
  L.push(`# ${s.name || s.creatureId} — ${s.kind || 'session'}`);
  if (s.task) L.push(`> ${s.task.split('\n')[0].slice(0, 200)}`);
  L.push(`\n\`status: ${s.status}  ·  $${(s.cost || 0).toFixed(4)}${s.tokens ? `  ·  ${s.tokens.total.toLocaleString()} tokens` : ''}\`\n`);
  let buf = '', speaker = '';
  const flush = () => { if (buf.trim()) L.push(`**${speaker || s.name}:** ${buf.trim()}\n`); buf = ''; };
  for (const e of s.events) {
    const who = e.creature ? `${e.creature.emoji} ${e.creature.name}` : `${s.emoji || ''} ${s.name || ''}`.trim();
    if (e.t === 'text') { if (who !== speaker) { flush(); speaker = who; } buf += e.text; continue; }
    flush();
    if (e.t === 'standup') { L.push(`### 🎪 Standup\n${e.text}\n`); (e.assignments || []).forEach((a) => L.push(`- **${a.emoji} ${a.name}** *(${a.specialty})* → ${a.task}`)); if (e.deliverables && e.deliverables.length) L.push(`\n_Deliverables: ${e.deliverables.join(', ')}_`); L.push(''); }
    else if (e.t === 'handoff') L.push(`\n**🤝 ${e.from.name} → ${e.to.name}**\n`);
    else if (e.t === 'note') L.push(`_${e.text}_\n`);
    else if (e.t === 'tool') L.push(`\`↳ ${e.name}\``);
    else if (e.t === 'delivered') L.push(`\n📦 **${(e.name || '').trim()} delivered**${e.branch ? ` on \`${e.branch}\`` : ''}\n`);
    else if (e.t === 'synthesis') L.push(`\n### 🎪 Wrap-up\n${e.text}\n`);
  }
  flush();
  return L.join('\n');
}

module.exports = { write, DIR };

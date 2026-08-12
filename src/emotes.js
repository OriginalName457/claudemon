'use strict';
// EMOTES — the little reactions that make each Claudemon feel alive. Every creature
// reacts to a feeling in its OWN way: a symbol that pops over its head, a tiny
// animation, and a short in-character line. Used by the tank (on actions + ambient
// mood), the lounge, and the crew cutscene. Pure data — no art budget.
//
// anim vocabulary (renderer maps these): bounce hop wiggle spin pulse sway flop
// shimmer flick glow droop shake.

const EMOTES = {
  // 🌊 AQUATIC
  clawde: {
    happy:   { emote: '✨', anim: 'bounce', line: 'eee! *taps the glass, claws clicking*' },
    excited: { emote: '🎉', anim: 'hop',    line: "let's GOOO! 🦀" },
    proud:   { emote: '💪', anim: 'puff',   line: 'nailed it — did you SEE that?' },
    love:    { emote: '💗', anim: 'wiggle',  line: "you're my favorite human, y'know that?" },
    sleepy:  { emote: '💤', anim: 'sway',   line: 'just... restin\' my eyestalks a sec...' },
  },
  octo: {
    happy:   { emote: '❗', anim: 'wiggle', line: 'ooh! I already have three thoughts about this!' },
    excited: { emote: '💡', anim: 'spin',   line: "wait wait — I've almost got it—" },
    proud:   { emote: '🎯', anim: 'puff',   line: 'elementary, really. all eight arms agreed.' },
    curious: { emote: '❓', anim: 'wiggle', line: 'hmm... but what if we came at it sideways?' },
    sleepy:  { emote: '💤', anim: 'droop',  line: '...running low on ink. and thoughts.' },
  },
  snail: {
    happy:   { emote: '〽️', anim: 'pulse',  line: '...good. *shell glows soft*' },
    excited: { emote: '⚡', anim: 'glow',   line: '...worth the wait.' },
    proud:   { emote: '🏔️', anim: 'pulse',  line: 'one careful step, then the next. done.' },
    love:    { emote: '💙', anim: 'pulse',  line: '...I carry my home. and you, a little.' },
    sleepy:  { emote: '💤', anim: 'sway',   line: '...resting the shell. do not rush a snail.' },
  },
  // 🌿 VIVARIUM
  mosskit: {
    happy:   { emote: '🌸', anim: 'pulse',  line: '*hums low through the soil* ...that\'s nice.' },
    excited: { emote: '✨', anim: 'sway',   line: 'oh! oh, lovely~' },
    proud:   { emote: '🌿', anim: 'pulse',  line: 'grew that one just right, I think.' },
    love:    { emote: '💚', anim: 'sway',   line: "so glad you're here, tending things with me." },
    sleepy:  { emote: '💤', anim: 'droop',  line: 'mm... just basking a little longer...' },
  },
  glowbug: {
    happy:   { emote: '✨', anim: 'shimmer', line: 'ooh, sparkly feeling!' },
    excited: { emote: '💡', anim: 'shimmer', line: '3AM idea energy, baby!!' },
    proud:   { emote: '🌟', anim: 'glow',   line: '*glows a little brighter*' },
    curious: { emote: '❓', anim: 'flick',  line: 'wait — nobody looked HERE, did they...' },
    sleepy:  { emote: '🌙', anim: 'droop',  line: '...daytime. ugh. dim me down.' },
  },
  fernling: {
    happy:   { emote: '😎', anim: 'sway',   line: '...s\'good. *basks on a warm rock*' },
    excited: { emote: '☀️', anim: 'wiggle', line: 'oh, now we\'re cookin\'.' },
    proud:   { emote: '✅', anim: 'pulse',  line: 'steady wins. told ya.' },
    love:    { emote: '🍃', anim: 'sway',   line: 'you\'re alright to bask beside, human.' },
    sleepy:  { emote: '💤', anim: 'droop',  line: 'cold-blooded — gimme a sec to warm up.' },
  },
  // 🏜️ DESERT
  dunepup: {
    happy:   { emote: '💨', anim: 'hop',    line: 'yipyipyip!! *zoomies*' },
    excited: { emote: '🎾', anim: 'spin',   line: 'OH BOY OH BOY OH BOY—' },
    proud:   { emote: '⭐', anim: 'hop',    line: 'DID IT! ...wait, did what again?' },
    love:    { emote: '🧡', anim: 'wiggle', line: '*buries a little treasure at your feet*' },
    sleepy:  { emote: '💤', anim: 'flop',   line: '*flops in the sand* five more minutes...' },
  },
  mirageling: {
    happy:   { emote: '✨', anim: 'shimmer', line: '*flickers, pleased, just off to your left*' },
    excited: { emote: '💫', anim: 'shimmer', line: "you didn't see that coming, did you." },
    proud:   { emote: '🌀', anim: 'glow',   line: '...reframed. you\'re welcome.' },
    curious: { emote: '❓', anim: 'sway',   line: 'hmm... look at it from over HERE instead.' },
    sleepy:  { emote: '🌫️', anim: 'droop',  line: '...fading out for a bit. blink and I\'m gone.' },
  },
  sting: {
    happy:   { emote: '·', anim: 'flick',  line: '...hm. good. *tail flicks once*' },
    excited: { emote: '⚡', anim: 'shake',  line: 'now.' },
    proud:   { emote: '🎯', anim: 'pulse',  line: 'clean strike. once was enough.' },
    love:    { emote: '🩶', anim: 'pulse',  line: '...you\'re alright. I don\'t say that twice.' },
    sleepy:  { emote: '💤', anim: 'sway',   line: '...slowing the heart. wake me if it matters.' },
  },
  // ☠️ HOSTILE (reflex-only — no inner life to speak of)
  slime:     { happy: { emote: '❔', anim: 'wiggle', line: '*jiggles*' } },
  cactuskid: { happy: { emote: '❗', anim: 'shake',  line: '*rattles spines warily*' } },
};

// A gentle default for anything not covered.
const DEFAULT = {
  happy:   { emote: '✨', anim: 'bounce', line: '*happy little wiggle*' },
  excited: { emote: '🎉', anim: 'hop',    line: '*bounces excitedly*' },
  proud:   { emote: '💪', anim: 'pulse',  line: '*stands a little taller*' },
  love:    { emote: '💗', anim: 'wiggle', line: '*leans in fondly*' },
  sleepy:  { emote: '💤', anim: 'droop',  line: '*yawns*' },
  curious: { emote: '❓', anim: 'sway',   line: '*tilts, thinking*' },
};

function emote(id, feeling) {
  const set = EMOTES[id] || {};
  return set[feeling] || DEFAULT[feeling] || DEFAULT.happy;
}
function feelings(id) { return Object.keys(EMOTES[id] || DEFAULT); }

module.exports = { EMOTES, DEFAULT, emote, feelings };

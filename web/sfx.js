'use strict';
// ============================================================================
//  Clawland — procedural sound effects (zero-dependency, Web Audio).
//  Same spirit as fx-attacks.js: everything is synthesized live from oscillators
//  + noise, so there are NO audio files to ship. window.SFX.play('name').
//  Audio must start from a user gesture — call SFX.init() on the first click.
// ============================================================================
(function (root) {
  let ctx = null, master = null, enabled = true;
  try { enabled = localStorage.getItem('cl_sfx') !== '0'; } catch {}
  function ac() {
    if (ctx) return ctx;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = 0.32; master.connect(ctx.destination); } catch { ctx = null; }
    return ctx;
  }
  // a pitched blip: f→f2 slide, quick attack, exponential decay
  function tone(o) {
    if (!enabled || !ac()) return; if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime, osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'square'; osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t + (o.dur || 0.15));
    const a = o.a != null ? o.a : 0.004, d = o.dur || 0.15, peak = o.g != null ? o.g : 0.5;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    osc.connect(g); g.connect(master); osc.start(t); osc.stop(t + d + 0.02);
  }
  // filtered noise burst — for whooshes, bites, impacts
  function noise(o) {
    if (!enabled || !ac()) return; if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime, dur = o.dur || 0.15, buf = ctx.createBuffer(1, Math.max(1, (ctx.sampleRate * dur) | 0), ctx.sampleRate), dd = buf.getChannelData(0);
    for (let i = 0; i < dd.length; i++) dd[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const filt = ctx.createBiquadFilter(); filt.type = o.ft || 'bandpass'; filt.frequency.setValueAtTime(o.f || 1200, t);
    if (o.f2) filt.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + dur); filt.Q.value = o.q != null ? o.q : 1;
    const g = ctx.createGain(), peak = o.g != null ? o.g : 0.4;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt); filt.connect(g); g.connect(master); src.start(t); src.stop(t + dur + 0.02);
  }
  // little melody
  function seq(notes, type, dur, gap, g) { notes.forEach((f, i) => setTimeout(() => tone({ f, type: type || 'square', dur: dur || 0.12, g: g || 0.36 }), i * (gap || 75))); }

  // ---- classic arcade palette: mostly square/pulse blips, coins, laser pews, power-ups ----
  const S = {
    // punchy melee hits — square zap + a little impact crunch
    slash()  { tone({ f: 1200, f2: 500, type: 'square', dur: 0.08, g: 0.26 }); noise({ f: 3000, f2: 800, dur: 0.05, q: 0.6, g: 0.14 }); },
    hook()   { tone({ f: 820, f2: 300, type: 'square', dur: 0.10, g: 0.28 }); noise({ f: 1800, f2: 500, dur: 0.06, q: 0.7, g: 0.14 }); },
    pinch()  { tone({ f: 1400, type: 'square', dur: 0.04, g: 0.24 }); setTimeout(() => tone({ f: 700, f2: 1500, type: 'square', dur: 0.06, g: 0.26 }), 40); },
    bite()   { tone({ f: 520, f2: 150, type: 'square', dur: 0.08, g: 0.28 }); noise({ f: 900, dur: 0.05, g: 0.14 }); },
    bash()   { tone({ f: 180, f2: 70, type: 'square', dur: 0.14, g: 0.32 }); noise({ f: 500, f2: 100, dur: 0.1, ft: 'lowpass', g: 0.24 }); },
    // laser pew
    shoot()  { tone({ f: 1600, f2: 380, type: 'square', dur: 0.12, g: 0.22 }); },
    // area burst
    aoe()    { tone({ f: 300, f2: 900, type: 'square', dur: 0.14, g: 0.20 }); noise({ f: 1400, f2: 300, dur: 0.18, q: 0.6, g: 0.18 }); },
    // ultra — power chord + boom
    nova()   { tone({ f: 262, type: 'square', dur: 0.35, g: 0.22 }); tone({ f: 392, type: 'square', dur: 0.35, g: 0.18 }); tone({ f: 523, type: 'square', dur: 0.35, g: 0.16 }); noise({ f: 900, f2: 80, dur: 0.4, ft: 'lowpass', g: 0.26 }); },
    // hit taken — quick down-blip
    hurt()   { tone({ f: 440, f2: 160, type: 'square', dur: 0.1, g: 0.24 }); },
    // classic coin/pickup "bip-boop"
    eat()    { tone({ f: 988, type: 'square', dur: 0.06, g: 0.24 }); setTimeout(() => tone({ f: 1319, type: 'square', dur: 0.11, g: 0.26 }), 52); },
    // dash whip — fast up-sweep
    dash()   { tone({ f: 300, f2: 1200, type: 'square', dur: 0.09, g: 0.16 }); },
    // power-up rising arpeggio
    levelup(){ seq([523, 659, 784, 1047, 1319], 'square', 0.09, 55, 0.26); },
    // triumphant evolve run
    evolve() { seq([392, 523, 659, 784, 1047, 1319, 1568], 'square', 0.11, 68, 0.28); },
    // node capture — coin fanfare
    capture(){ seq([784, 784, 1047, 1319], 'square', 0.10, 78, 0.28); },
    // unlock chime
    unlock() { seq([1047, 1319, 1568], 'triangle', 0.10, 68, 0.24); },
    invite() { seq([784, 1047], 'square', 0.08, 58, 0.22); },
    // game-over run-down
    die()    { seq([523, 415, 330, 262, 196], 'square', 0.14, 88, 0.26); },
    // ominous heat drone
    heat()   { tone({ f: 98, f2: 73, type: 'square', dur: 0.5, g: 0.28 }); tone({ f: 110, type: 'square', dur: 0.5, g: 0.14 }); },
    // menu blip
    ui()     { tone({ f: 880, type: 'square', dur: 0.04, g: 0.14 }); },
    // "game start" jingle
    start()  { seq([523, 659, 784, 1047], 'square', 0.08, 55, 0.26); },
  };
  root.SFX = {
    play(n) { const fn = S[n]; if (fn) try { fn(); } catch {} },
    toggle() { enabled = !enabled; try { localStorage.setItem('cl_sfx', enabled ? '1' : '0'); } catch {} if (enabled) { ac(); if (ctx && ctx.state === 'suspended') ctx.resume(); } return enabled; },
    on() { return enabled; },
    init() { ac(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
  };
})(window);

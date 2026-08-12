'use strict';
// ============================================================================
//  Claudemon — standardized ATTACK / MOVE VFX
// ----------------------------------------------------------------------------
//  Procedural pixel effects meant to be "projected" over ANY creature, so we
//  never need per-creature attack art. Pick an effect by move TYPE, recolor it
//  by ELEMENT. Every effect is FXA.<id>(ctx, t, o):
//     t  = progress 0..1 (one full play of the move)
//     o  = { cx, cy, scale, dir(+1/-1), color, color2, color3 }
//  Draw pixel-snapped, no smoothing. Same style as fx.js (the snail lightning).
// ============================================================================
(function (root) {
  const P = (ctx, x, y, w, h, c, a) => {
    ctx.globalAlpha = (a == null ? 1 : (a < 0 ? 0 : a > 1 ? 1 : a));
    ctx.fillStyle = c;
    ctx.fillRect(x | 0, y | 0, Math.max(1, w | 0), Math.max(1, h | 0));
  };
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
  // envelope: eases 0→1 by `up`, holds, fades 1→0 after `down`
  const env = (t, up, down) => { up = up || 0.18; down = down || 0.62; return t < up ? t / up : t > down ? Math.max(0, (1 - t) / (1 - down)) : 1; };
  // tiny deterministic RNG so loops don't shimmer randomly
  const LCG = (seed) => { let s = (seed * 2654435761) >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
  // quadratic bezier point
  const bez = (a, k, b, f) => { const u = 1 - f; return u * u * a + 2 * u * f * k + f * f * b; };
  // draw a SOLID tapered stroke along a quadratic bezier (thick at root, sharp at tip)
  const strokeBez = (ctx, ax, ay, kx, ky, bx, by, col, thick, s, a, taper, n) => {
    n = n || 16; taper = taper == null ? 0.5 : taper;
    for (let i = 0; i <= n; i++) { const f = i / n, x = bez(ax, kx, bx, f), y = bez(ay, ky, by, f), w = Math.max(1, thick * (1 - f * taper) * s); ctx.globalAlpha = a; ctx.fillStyle = col; ctx.fillRect((x - w / 2) | 0, (y - w / 2) | 0, Math.max(1, w | 0), Math.max(1, w | 0)); }
  };
  // draw a rounded solid block (a chunky "palm") centered-ish, scanline fill with eased insets
  const roundBlock = (ctx, x, y, w, h, col, a) => {
    ctx.globalAlpha = a; ctx.fillStyle = col;
    for (let yy = 0; yy < h; yy++) { const t2 = yy / (h - 1 || 1), inset = Math.round(Math.pow(Math.abs(t2 - 0.5) * 2, 1.7) * (w * 0.34)); ctx.fillRect((x + inset) | 0, (y + yy) | 0, Math.max(1, (w - inset * 2) | 0), 1); }
  };

  const FXA = {};

  // ---- MELEE ---------------------------------------------------------------
  // curved, tapered claw marks. Shape is data-driven (root.SLASH_CFG) so it can be edited/positioned.
  const SLASH_DEFAULT = [
    { ax: 14, ay: -19, bx: -12, by: 15, cv: 6 },
    { ax: 19, ay: -15, bx: -7, by: 18, cv: 6 },
    { ax: 9, ay: -21, bx: -16, by: 12, cv: 7 },
  ];
  FXA.slash = (ctx, t, o) => {
    const cx = o.cx, cy = o.cy, s = o.scale || 1, dir = o.dir || 1, c = o.color || '#ffffff', c2 = o.color2 || '#ff6b6b';
    const marks = (root.SLASH_CFG && root.SLASH_CFG.length) ? root.SLASH_CFG : SLASH_DEFAULT;
    const a = env(t, 0.1, 0.42), reveal = clamp01(t * 1.8), n = 18;
    for (let k = 0; k < marks.length; k++) {
      const m = marks[k];
      const ax = cx + m.ax * dir * s, ay = cy + m.ay * s, bx = cx + m.bx * dir * s, by = cy + m.by * s;   // dir mirrors the swipe L/R
      const px = -(by - ay), py = (bx - ax), pl = Math.hypot(px, py) || 1;
      const kx = (ax + bx) / 2 + px / pl * (m.cv || 0) * s, ky = (ay + by) / 2 + py / pl * (m.cv || 0) * s;   // bezier control (curve)
      for (let i = 0; i < n; i++) {
        const f = i / (n - 1); if (f > reveal) break;
        const u = 1 - f, x = u * u * ax + 2 * u * f * kx + f * f * bx, y = u * u * ay + 2 * u * f * ky + f * f * by;
        const w = Math.max(1, (1 - Math.abs(f - 0.5) * 2) * 4.6 * s);   // taper: thin tips, thick middle
        P(ctx, x - w / 2, y - w / 2, w, w, i % 4 ? c : c2, a);
      }
    }
  };
  FXA.hook = (ctx, t, o) => {                          // hooking uppercut — a crescent blade sweeps up, connects with an impact burst
    const cx = o.cx, cy = o.cy, s = o.scale || 1, c = o.color || '#ffffff', c2 = o.color2 || '#ffd7c0';
    const a = env(t, 0.08, 0.4), sweep = clamp01(t * 1.5);
    const pcx = cx - 5 * s, pcy = cy + 5 * s;            // pivot low-back; blade rises up & forward
    const a0 = Math.PI * 0.86, a1 = -Math.PI * 0.34, N = 24;
    // crescent BLADE: fill the band between an inner and outer radius, widening toward the fist
    for (let i = 0; i < N; i++) {
      const f = i / (N - 1); if (f > sweep) break;
      const ang = lerp(a0, a1, f), dx = Math.cos(ang), dy = -Math.sin(ang);
      const Ro = (11 + 10 * f) * s, band = (1.6 + 4.2 * f) * s, edgeA = a * (0.22 + f * 0.78);
      for (let r = 0; r <= 3; r++) { const rr = Ro - band * (r / 3), x = pcx + dx * rr, y = pcy + dy * rr, col = r === 0 ? c2 : (r >= 2 ? c : '#ffffff'); P(ctx, x - 1.5 * s, y - 1.5 * s, 3 * s, 3 * s, col, edgeA); }
    }
    // leading knuckle
    const fa = lerp(a0, a1, sweep), fr = (11 + 10 * sweep) * s, fx = pcx + Math.cos(fa) * fr, fy = pcy - Math.sin(fa) * fr;
    P(ctx, fx - 5 * s, fy - 5 * s, 10 * s, 10 * s, c2, a); P(ctx, fx - 3.5 * s, fy - 3.5 * s, 7 * s, 7 * s, c, a); P(ctx, fx - 2 * s, fy - 2 * s, 4 * s, 4 * s, '#ffffff', a);
    // impact burst — spark shards fan out from the connect point as the swing lands
    if (sweep > 0.55) { const k = clamp01((sweep - 0.55) / 0.45) * env(t, 0.55, 0.72);
      for (let i = 0; i < 6; i++) { const sa = fa + Math.PI * 0.5 - i / 5 * Math.PI, len = (5 + (i % 2) * 4) * s;
        for (let j = 1; j <= 3; j++) { const x = fx + Math.cos(sa) * len * j / 3, y = fy - Math.sin(sa) * len * j / 3, w = (2.6 - j * 0.5) * s; P(ctx, x - w / 2, y - w / 2, w, w, j < 2 ? '#ffffff' : c2, k * (1 - j / 4)); } } }
  };
  FXA.pinch = (ctx, t, o) => {                         // a proper crab claw: chunky palm + a fixed and a moving finger that snap shut
    const s = o.scale || 1, cx = o.cx - 4 * s, cy = o.cy, c = o.color || '#ffffff', c2 = o.color2 || '#ff6b6b';
    const a = env(t, 0.1, 0.5);
    const open = (t < 0.4 ? lerp(11, 1.2, t / 0.4) : lerp(1.2, 4.5, clamp01((t - 0.4) / 0.6))) * s;   // jaw gap: open → snap → settle
    // --- palm (the chunky rounded hand) ---
    roundBlock(ctx, cx - 17 * s, cy - 10 * s, 16 * s, 20 * s, c2, a);
    roundBlock(ctx, cx - 15 * s, cy - 6 * s, 9 * s, 12 * s, c, a * 0.8);           // highlight
    P(ctx, cx - 12 * s, cy - 3 * s, 3 * s, 3 * s, '#ffffff', a * 0.7);            // glint
    // --- two jaws curving to a bite point: fixed thick thumb (lower) + thinner moving finger (upper) ---
    for (const sgn of [-1, 1]) {
      const moving = sgn < 0;                                                      // upper finger does the opening/closing
      const g = open * (moving ? 1 : 0.22);
      const rootx = cx - 4 * s, rooty = cy + sgn * (g * 0.5 + 2.5 * s);
      const kx = cx + 6 * s, ky = cy + sgn * (g + (moving ? 9 : 6.5) * s);         // moving finger bellies out more
      const tipx = cx + 16 * s, tipy = cy + sgn * (g * 0.3 + 0.5 * s);             // sharp tips meet at center-front
      const th = moving ? 5 : 7;
      strokeBez(ctx, rootx, rooty, kx, ky, tipx, tipy, c2, th, s, a, 0.6, 16);     // thick outer
      strokeBez(ctx, rootx, rooty, kx, ky, tipx, tipy, c, th * 0.44, s, a, 0.58, 16); // inner highlight
      P(ctx, tipx - 1.5 * s, tipy - 1.5 * s, 3 * s, 3 * s, '#ffffff', a * 0.9);    // tip point
    }
    // little serration notch on the fixed thumb so it reads as a claw, not a loop
    P(ctx, cx + 6 * s, cy + 5 * s, 2 * s, 2 * s, c2, a * 0.8);
    // --- snap spark at the bite point ---
    if (t > 0.32 && t < 0.5) { const k = (0.5 - t) / 0.18;
      P(ctx, cx + 14 * s, cy - 3 * s, 6 * s, 6 * s, '#ffffff', k * 0.95);
      for (let i = 0; i < 6; i++) { const an = i / 6 * 6.283, l = 6 * s; P(ctx, cx + 16 * s + Math.cos(an) * l, cy + Math.sin(an) * l, 2 * s, 2 * s, '#ffffff', k * 0.5); }
    }
  };
  FXA.bite = (ctx, t, o) => {                        // snapping jaws — teeth point inward
    const cx = o.cx, cy = o.cy, s = o.scale || 1, c = o.color || '#ffffff', c2 = o.color2 || '#dfe3ea';
    const gap = t < 0.45 ? lerp(20, 2, t / 0.45) * s : lerp(2, 7, clamp01((t - 0.45) / 0.55)) * s;
    const a = env(t, 0.1, 0.6), teeth = 5, tw = 6 * s;
    for (let j = 0; j < teeth; j++) {
      const x = cx - ((teeth - 1) / 2) * tw + j * tw;
      // upper row: wide base up top, narrow tip pointing DOWN toward the gap
      for (let r = 0; r < 4; r++) { const w = (r + 1) * 1.5 * s; P(ctx, x - w / 2, cy - gap - r * 2 * s - 2 * s, w, 2 * s, r % 2 ? c : c2, a); }
      // lower row: wide base at bottom, narrow tip pointing UP toward the gap
      for (let r = 0; r < 4; r++) { const w = (r + 1) * 1.5 * s; P(ctx, x - w / 2, cy + gap + r * 2 * s, w, 2 * s, r % 2 ? c : c2, a); }
    }
    if (t > 0.4 && t < 0.55) P(ctx, cx - 10 * s, cy - 2 * s, 20 * s, 4 * s, '#ffffff', (0.55 - t) / 0.15 * 0.8);
  };
  FXA.bash = (ctx, t, o) => {                        // blunt impact star + shockwave
    const cx = o.cx, cy = o.cy, s = o.scale || 1, c = o.color || '#ffffff', c2 = o.color2 || '#ffd23f';
    const g = env(t, 0.12, 0.35), R = lerp(2, 20, clamp01(t / 0.6)) * s;
    for (let i = 0; i < 18; i++) { const ang = i / 18 * Math.PI * 2; P(ctx, cx + Math.cos(ang) * R - 1, cy + Math.sin(ang) * R - 1, 2 * s, 2 * s, c2, g * 0.7); }
    const S = lerp(4, 16, g) * s;
    for (const d of [[0, -1], [0, 1], [-1, 0], [1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]) for (let i = 0; i < 6; i++) { const f = i / 6; P(ctx, cx + d[0] * f * S - 1.5, cy + d[1] * f * S - 1.5, 3 * s, 3 * s, i < 3 ? c : c2, g); }
    P(ctx, cx - 3 * s, cy - 3 * s, 6 * s, 6 * s, c, g);
  };

  // ---- PROJECTILE ----------------------------------------------------------
  FXA.orb = (ctx, t, o) => {                         // slow drifting energy bolt
    const cy = o.cy, s = o.scale || 1, dir = o.dir || 1, c = o.color || '#8fd0ff', c2 = o.color2 || '#e6f5ff';
    const x = lerp(6 * s, 58 * s, t), y = cy, pulse = 1 + 0.2 * Math.sin(t * 30);
    for (let i = 1; i <= 5; i++) { const r = (6 - i) * s; P(ctx, x - dir * i * 4 * s - r / 2, y - r / 2, r, r, c, 0.1 * (6 - i)); }
    for (let i = 0; i < 10; i++) { const ang = i / 10 * Math.PI * 2, rr = 5 * s * pulse; P(ctx, x + Math.cos(ang) * rr - 1, y + Math.sin(ang) * rr - 1, 2, 2, c, 0.5); }
    P(ctx, x - 3 * s, y - 3 * s, 6 * s, 6 * s, c2, 1); P(ctx, x - 2 * s, y - 2 * s, 4 * s, 4 * s, '#ffffff', 0.9);
  };
  FXA.spike = (ctx, t, o) => {                       // fast darting shard
    const cy = o.cy, s = o.scale || 1, dir = o.dir || 1, c = o.color || '#dfe9ff', c2 = o.color2 || '#9ab0ff';
    const x = lerp(4 * s, 60 * s, clamp01(t / 0.8)), y = cy;
    for (let i = 0; i < 8; i++) P(ctx, x - dir * i * 4 * s, y - 1, 3 * s, 2, c2, 0.6 * (1 - i / 8));
    P(ctx, x - 2 * s, y - 2 * s, 5 * s, 4 * s, c, 1); P(ctx, x + dir * 2 * s, y - 1, 3 * s, 2, '#ffffff', 1);
  };

  // ---- ELEMENTAL -----------------------------------------------------------
  FXA.shock = (ctx, t, o) => {                        // electric strike ⚡
    const cx = o.cx, cy = o.cy, s = o.scale || 1, c = o.color || '#bfe6ff', c2 = o.color2 || '#6cb8ff';
    const a = env(t, 0.05, 0.5), on = t < 0.7 && (Math.floor(t * 30) % 2 === 0 || t < 0.15);
    if (on) {
      const rng = LCG(3); let x = cx + lerp(-6, 6, rng()) * s, y = cy - 24 * s; const pts = [[x, y]];
      for (let i = 0; i < 7; i++) { x += (rng() - 0.5) * 8 * s; y += 24 * s / 7; pts.push([x, y]); }
      for (let i = 1; i < pts.length; i++) { const A = pts[i - 1], B = pts[i]; for (let j = 0; j < 6; j++) { const f = j / 6; P(ctx, lerp(A[0], B[0], f) - 1, lerp(A[1], B[1], f) - 1, 2 * s, 2 * s, j % 2 ? c : c2, a); } P(ctx, pts[i][0] - 1, pts[i][1] - 1, 2, 2, '#ffffff', a); }
    }
    const rng2 = LCG(9);
    for (let i = 0; i < 8; i++) { const ang = rng2() * Math.PI * 2, rr = lerp(2, 14, clamp01(t * 1.6)) * s; P(ctx, cx + Math.cos(ang) * rr - 1, cy + Math.sin(ang) * rr - 1, 2, 2, c, a * 0.8); }
  };
  FXA.poison = (ctx, t, o) => {                       // toxic bloom ☠
    const cx = o.cx, cy = o.cy, s = o.scale || 1, c = o.color || '#8fd94a', c2 = o.color2 || '#5a9e2a';
    const rng = LCG(21), g = env(t, 0.2, 0.55);
    for (let i = 0; i < 12; i++) { const ang = rng() * Math.PI * 2, rr = lerp(2, 12, clamp01(t * 1.3)) * s * (0.6 + rng() * 0.6); const bx = cx + Math.cos(ang) * rr, by = cy + Math.sin(ang) * rr * 0.7, sz = (1 + rng() * 2) * s; P(ctx, bx - sz / 2, by - sz / 2, sz, sz, i % 3 ? c : c2, g * 0.7); }
    for (let i = 0; i < 6; i++) { const ph = (t * 1.4 + i / 6) % 1, bx = cx + lerp(-10, 10, rng()) * s, by = cy + 8 * s - ph * 22 * s, sz = (1.5 + (1 - ph) * 2) * s, a = (1 - ph) * g; P(ctx, bx - sz / 2, by - sz / 2, sz, sz, c, a); P(ctx, bx - sz / 2, by - sz / 2, 1, 1, '#dfffb0', a); }
  };
  FXA.ember = (ctx, t, o) => {                        // flame burst 🔥
    const cx = o.cx, cy = o.cy, s = o.scale || 1, c = o.color || '#ffd23f', c2 = o.color2 || '#f5793b', c3 = o.color3 || '#d24a3a';
    const rng = LCG(33), g = env(t, 0.15, 0.5);
    for (let r = 0; r < 8; r++) { const w = (8 - r) * 2 * s * (0.8 + 0.4 * Math.sin(t * 30 + r)), y = cy + 8 * s - r * 2.2 * s; P(ctx, cx - w / 2, y, w, 2 * s, r < 3 ? c3 : r < 6 ? c2 : c, g); }
    for (let i = 0; i < 7; i++) { const ph = (t * 1.5 + i / 7) % 1, bx = cx + lerp(-8, 8, rng()) * s + Math.sin(ph * 6 + i) * 2, by = cy + 8 * s - ph * 24 * s, sz = (1 + (1 - ph) * 1.5) * s; P(ctx, bx - sz / 2, by - sz / 2, sz, sz, ph < 0.5 ? c : c2, (1 - ph) * g); }
  };
  FXA.splash = (ctx, t, o) => {                       // water spray 💧
    const cx = o.cx, cy = o.cy, s = o.scale || 1, c = o.color || '#8fd0ff', c2 = o.color2 || '#4fb6dc';
    const g = env(t, 0.1, 0.4), rng = LCG(41), p = clamp01(t / 0.8);
    for (let i = 0; i < 10; i++) { const ang = lerp(-Math.PI * 0.9, -Math.PI * 0.1, i / 9) + (rng() - 0.5) * 0.2, spd = lerp(6, 18, rng()); const dx = Math.cos(ang) * spd * p * s, dy = Math.sin(ang) * spd * p * s + 12 * p * p * s, sz = (2 - p) * s; P(ctx, cx + dx - sz / 2, cy + dy - sz / 2, sz, sz, i % 2 ? c : c2, g); }
    const ph = clamp01(t / 0.5); P(ctx, cx - 2 * s, cy - lerp(0, 14, ph) * s, 4 * s, lerp(2, 14, ph) * s, c, g * 0.8);
  };
  // ---- DEFENSE / UTILITY ---------------------------------------------------
  FXA.dodge = (ctx, t, o) => {                        // dash afterimage + dust
    const cx = o.cx, cy = o.cy, s = o.scale || 1, dir = o.dir || 1, c = o.color || '#dfefff', c2 = o.color2 || '#bcd0e6';
    const g = env(t, 0.1, 0.4);
    for (let i = 0; i < 3; i++) { const off = -dir * (6 + i * 8) * s * clamp01(t * 1.5), a = g * (1 - i * 0.28); for (let r = 0; r < 5; r++) { P(ctx, cx + off - dir * r * s, cy - 6 * s + r * 3 * s, 2 * s, 2 * s, i ? c2 : c, a); P(ctx, cx + off - dir * r * s, cy + 6 * s - r * 3 * s, 2 * s, 2 * s, i ? c2 : c, a); } }
    const rng = LCG(55); for (let i = 0; i < 6; i++) { const p = clamp01(t / 0.6), ang = Math.PI + (rng() - 0.5), dx = -dir * Math.cos(ang) * 10 * p * s, dy = Math.sin(ang) * 6 * p * s, sz = (2 - p * 1.5) * s; P(ctx, cx + dx, cy + 8 * s + dy, sz, sz, '#d8c9b0', g * 0.6); }
  };
  FXA.guard = (ctx, t, o) => {                        // shield bubble
    const cx = o.cx, cy = o.cy, s = o.scale || 1, c = o.color || '#8fe0ff', c2 = o.color2 || '#4fb6dc';
    const g = env(t, 0.15, 0.55), R = lerp(10, 13, Math.sin(t * 8) * 0.5 + 0.5) * s;
    for (let i = 0; i < 20; i++) { const ang = i / 20 * Math.PI * 2, rr = R * (1 + 0.06 * Math.sin(ang * 3 + t * 20)); P(ctx, cx + Math.cos(ang) * rr - 1, cy + Math.sin(ang) * rr - 1, 2 * s, 2 * s, i % 2 ? c : c2, g); }
    for (let i = 0; i < 6; i++) { const ang = t * 4 + i / 6 * Math.PI * 2; P(ctx, cx + Math.cos(ang) * 6 * s - 1, cy + Math.sin(ang) * 6 * s - 1, 2, 2, c, g * 0.5); }
  };
  FXA.heal = (ctx, t, o) => {                         // restore sparkles
    const cx = o.cx, cy = o.cy, s = o.scale || 1, c = o.color || '#b6f36a', c2 = o.color2 || '#ffe680';
    const g = env(t, 0.15, 0.6), rng = LCG(77);
    for (let i = 0; i < 6; i++) { const ph = (t * 1.2 + i / 6) % 1, bx = cx + lerp(-11, 11, rng()) * s, by = cy + 10 * s - ph * 24 * s, a = (1 - ph) * g, sz = 3 * s; P(ctx, bx - sz / 2, by - 1, sz, 2, i % 2 ? c : c2, a); P(ctx, bx - 1, by - sz / 2, 2, sz, i % 2 ? c : c2, a); }
  };

  // ---- catalog (drives the review panel + game move → effect mapping) ------
  FXA._meta = [
    { id: 'slash', cat: 'Melee', label: 'Claw / Slash', sig: 'curved claw marks (editable)' },
    { id: 'hook', cat: 'Melee', label: 'Hook', sig: 'hooking punch arc (L/R)' },
    { id: 'pinch', cat: 'Melee', label: 'Pincher', sig: 'crab claw snaps shut (L/R)' },
    { id: 'bite', cat: 'Melee', label: 'Bite', sig: 'jaws snap shut' },
    { id: 'bash', cat: 'Melee', label: 'Bash / Impact', sig: 'blunt hit, shockwave' },
    { id: 'orb', cat: 'Projectile', label: 'Orb (slow)', sig: 'drifting energy bolt' },
    { id: 'spike', cat: 'Projectile', label: 'Shard (fast)', sig: 'darting spike' },
    { id: 'shock', cat: 'Elemental', label: 'Shock ⚡', sig: 'electric strike' },
    { id: 'poison', cat: 'Elemental', label: 'Poison ☠', sig: 'toxic bloom + bubbles' },
    { id: 'ember', cat: 'Elemental', label: 'Ember 🔥', sig: 'flame burst + embers' },
    { id: 'splash', cat: 'Elemental', label: 'Splash 💧', sig: 'water spray' },
    { id: 'dodge', cat: 'Defense', label: 'Dodge', sig: 'dash afterimage + dust' },
    { id: 'guard', cat: 'Defense', label: 'Guard', sig: 'shield bubble' },
    { id: 'heal', cat: 'Defense', label: 'Heal', sig: 'rising restore sparkles' },
  ];

  root.FXA = FXA;
})(typeof window !== 'undefined' ? window : globalThis);

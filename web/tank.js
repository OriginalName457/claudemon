'use strict';
/* Claudemon tank — one creature (Clawde). Renders its current mood-state
   animation, wanders, reacts to feeding. Sprites come from /assets/manifest.json:
     manifest.creature.states[state] = { sheet, frameW, frameH, fps, frames, scale, smooth }
   Missing states fall back to the default ('idle'). */

const canvas = document.getElementById('tank');
const ctx = canvas.getContext('2d');
let W = canvas.width, H = canvas.height;
const TANK_SCALE = 1.125; // creatures ~25% bigger — read clearly in their environment
const ZOOM = 1;           // canvas is authored 1:1 with the 512x480 art (no fractional zoom = crisp)
const FOCUS = { x: 0.5, y: 0.5 }; // identity camera; art is laid out to fill the frame directly

// Canvas is fixed — each biome/tier is a glass vessel drawn to fill it.
// Tank upgrades swap the vessel image and widen the inner floor, they don't
// resize the canvas. (kept as a no-op so old callers don't break.)
function setTankSize() {}

// ---- Glass-vessel stages: which tank image + where the inner floor is ----
// floor l/r = walkable x bounds, y = ground line (fractions of the canvas).
// water.top = where water begins (bubble ambient, aquatic). ambient = flow.
const STAGES = {
  // All biomes share the exact frameless #2 tank shape (biome interior swapped
  // in). Tiers reuse it for now; "bigger tank" upgrade art is a follow-up.
  // Geometry for the 512x480 layered art: interior x 76..436, floor line y=336.
  // floor l/r give the walkable band (inset from the glass), y = ground line.
  // Zoomed-in framing: the biome scene fills the full canvas width (0..512) up
  // to y=410, wood shelf below. No desk white-space. floor y = scene ground.
  aquatic: {
    1: { bg: 'tank_aqua_a.png', floor: { l: 0.12, r: 0.88, y: 0.72 }, water: { top: 0.05 }, ambient: 'bubble' },
    2: { bg: 'tank_aqua_a.png', floor: { l: 0.12, r: 0.88, y: 0.72 }, water: { top: 0.05 }, ambient: 'bubble' },
    3: { bg: 'tank_aqua_a.png', floor: { l: 0.12, r: 0.88, y: 0.72 }, water: { top: 0.05 }, ambient: 'bubble' },
  },
  vivarium: {
    1: { bg: 'tank_viv.png', floor: { l: 0.12, r: 0.88, y: 0.76 }, ambient: 'leaf' },
    2: { bg: 'tank_viv.png', floor: { l: 0.12, r: 0.88, y: 0.76 }, ambient: 'leaf' },
    3: { bg: 'tank_viv.png', floor: { l: 0.12, r: 0.88, y: 0.76 }, ambient: 'leaf' },
  },
  desert: {
    1: { bg: 'tank_desert.png', floor: { l: 0.12, r: 0.88, y: 0.74 }, ambient: 'sand' },
    2: { bg: 'tank_desert.png', floor: { l: 0.12, r: 0.88, y: 0.74 }, ambient: 'sand' },
    3: { bg: 'tank_desert.png', floor: { l: 0.12, r: 0.88, y: 0.74 }, ambient: 'sand' },
  },
};
let biome = 'aquatic', tier = 1;
const urlBiome = new URLSearchParams(location.search).get('biome'); // preview override
if (STAGES[urlBiome]) biome = urlBiome;
function stage() { const b = STAGES[biome] || STAGES.aquatic; return b[tier] || b[1]; }
function floorY() { return stage().floor.y * H; }  // creatures' feet rest here
function LX() { return stage().floor.l * W; }        // inner-floor left bound
function RX() { return stage().floor.r * W; }        // inner-floor right bound

// Biome variants (different background looks for the same biome). Registry is
// built by scripts/build-variants.js. Selection: ?variant= override, else the
// biome's registered default. (State-driven selection can set variantSel later.)
let VARIANTS = {};
fetch('/assets/_bg/variants.json', { cache: 'no-store' }).then(r => r.json()).then(v => { VARIANTS = v; }).catch(() => {});
let variantSel = new URLSearchParams(location.search).get('variant') || null;
function bgFile() {
  const vb = VARIANTS[biome];
  if (vb && vb.variants) { const key = (variantSel && vb.variants[variantSel]) ? variantSel : vb.default; if (vb.variants[key]) return vb.variants[key]; }
  return stage().bg;
}

const BG = {};
function bgImage() {
  const file = bgFile();
  if (!BG[file]) { const im = new Image(); const rec = { im, ok: false }; im.onload = () => (rec.ok = true); im.src = '/assets/_bg/' + file + '?v=9'; BG[file] = rec; }
  return BG[file];
}

// Front glass pane — a shared transparent overlay drawn OVER the creatures so the
// tank reads as a box you look into. Same for every biome (same tank silhouette).
const GLASS = { im: new Image(), ok: false };
GLASS.im.onload = () => (GLASS.ok = true);
GLASS.im.src = '/assets/_bg/tank_glass.png?v=7';
function drawGlass() { if (GLASS.ok) { ctx.imageSmoothingEnabled = false; ctx.drawImage(GLASS.im, 0, 0, W, H); } }

const ART = { name: 'Clawde', def: 'idle', states: {}, images: {} };
const COMP = []; // companion actors that just live in the tank (no stats)

async function loadAssets() {
  try {
    const man = await (await fetch('/assets/manifest.json', { cache: 'no-store' })).json();
    const c = man.creature || {};
    ART.name = c.name || 'Clawde';
    ART.biome = c.biome || 'aquatic';
    ART.def = c.default || 'idle';
    ART.states = c.states || {};
    for (const [key, meta] of Object.entries(ART.states)) {
      if (!meta || !meta.sheet) continue;
      const ex = ART.images[key];
      if (ex && ex.ready && ex.meta.sheet === meta.sheet) { ex.meta = meta; continue; }
      const img = new Image();
      const rec = { img, meta, ready: false };
      img.onload = () => { rec.ready = true; };
      img.src = '/assets/' + meta.sheet + '?v=' + Date.now();
      ART.images[key] = rec;
    }
  } catch { /* keep whatever we have */ }
}

// Species registry (stats/personality/sprites) — companions come from the
// adopted roster in state, not from the manifest.
const REG = {};
async function loadSpecies() {
  try {
    const d = await (await fetch('/api/species')).json();
    for (const sp of d.species) REG[sp.id] = sp;
    if (pet.snap) buildCompanions(pet.snap);
  } catch {}
}
function buildCompanions(s) {
  // the chosen tank-mates for the active biome (already capacity-capped + excludes
  // the main); falls back to the whole roster for older snapshots.
  const ids = Array.isArray(s.occupants) ? s.occupants : (s.roster || []);
  const metas = ids
    .map(id => REG[id])
    .filter(sp => sp && sp.artReady && sp.sprite && sp.faction === 'friendly')
    .map(sp => ({ name: sp.name, biome: sp.biome, ...sp.sprite }));
  loadCompanions(metas);
}

function loadCompanions(list) {
  list.forEach((meta, i) => {
    if (!meta || !meta.sheet) return;
    const a = COMP[i];
    if (a && a.meta.sheet === meta.sheet) { a.meta = meta; return; }
    const img = new Image();
    const actor = {
      img, meta, ready: false, frame: 0, frameClock: 0,
      x: (i + 1) * W / (list.length + 1), dir: Math.random() < 0.5 ? -1 : 1,
      vx: 0.16 + Math.random() * 0.1, phase: Math.random() * 6, paused: 0,
    };
    img.onload = () => { actor.ready = true; };
    img.src = '/assets/' + meta.sheet + '?v=' + Date.now();
    COMP[i] = actor;
  });
  COMP.length = list.length; // drop any tank-mates that were removed
}

// Draw one companion (static or animated) wandering the floor with a squish-bob.
function drawActor(a) {
  if (!a || !a.ready || !inBiome(a.meta.biome)) return;
  const m = a.meta, scale = (m.scale || 1.7) * TANK_SCALE, fw = m.frameW, fh = m.frameH, frames = m.frames || 1;
  const dw = fw * scale, dh = fh * scale;
  const bp = a.bp || 0;
  const bob = -Math.sin(bp * Math.PI) * 4;      // occasional bounce, else flat
  const sq = 1 + Math.sin(bp * Math.PI) * 0.05; // tiny squish on the bounce only
  const ox = Math.round(a.x - dw / 2);
  const oy = Math.round(floorY() - dh * sq + bob);
  const sx = (a.frame % frames) * fw;
  ctx.save();
  ctx.imageSmoothingEnabled = !!m.smooth;
  if (a.dir > 0) { ctx.translate(ox + dw, 0); ctx.scale(-1, 1); ctx.translate(-ox, 0); } // face the way it walks
  ctx.drawImage(a.img, sx, 0, fw, fh, ox, oy, dw, dh * sq);
  ctx.restore();
  // electric crackle for creatures with a lightning fx (Sherpa)
  if (m.fx && m.fx.type === 'lightning' && window.drawLightningFx) {
    const spots = a.dir > 0 ? m.fx.spots.map(([x, y]) => [fw - x, y]) : m.fx.spots;
    window.drawLightningFx(ctx, spots, ox, oy, scale);
  }
}

// Keep Clawde + companions from overlapping — they share the floor and
// bump/push each other apart, then turn away (so the space feels alive).
function resolveCollisions() {
  const actors = [];
  if (inBiome(pet.homeBiome || ART.biome)) actors.push({ get x() { return pet.x; }, set x(v) { pet.x = v; }, get dir() { return pet.dir; }, set dir(v) { pet.dir = v; }, hw: creatureWidthPx() * 0.30, clear: () => { paused = 0; } });
  for (const a of COMP) {
    if (!a || !a.ready || !inBiome(a.meta.biome)) continue;
    actors.push({ get x() { return a.x; }, set x(v) { a.x = v; }, get dir() { return a.dir; }, set dir(v) { a.dir = v; }, hw: (a.meta.frameW * (a.meta.scale || 1.7)) * 0.30, clear: () => { a.paused = 0; } });
  }
  for (let i = 0; i < actors.length; i++) {
    for (let j = i + 1; j < actors.length; j++) {
      const A = actors[i], B = actors[j];
      const dx = B.x - A.x, dist = Math.abs(dx), min = A.hw + B.hw;
      if (dist < min && dist > 0.01) {
        const push = (min - dist) / 2, s = dx > 0 ? 1 : -1;
        A.x -= push * s; B.x += push * s;
        A.dir = -s; B.dir = s; A.clear(); B.clear();
      }
    }
  }
}

function updateActor(a, dt) {
  if (!a) return;
  const half = (a.meta.frameW * (a.meta.scale || 1.7)) * 0.28;
  const m = Math.min(half, (RX() - LX()) * 0.3);
  const lo = LX() + m, hi = RX() - m;
  if (a.paused > 0) { a.paused--; }
  else {
    a.x += a.vx * a.dir;
    if (a.x < lo) { a.x = lo; a.dir = 1; }
    if (a.x > hi) { a.x = hi; a.dir = -1; }
    if (Math.random() < 0.005) a.dir *= -1;
    if (Math.random() < 0.004) a.paused = 40 + Math.random() * 100;
  }
  // occasional bounce, otherwise it just strolls flat
  if (a.bp > 0) { a.bp -= dt / 430; if (a.bp < 0) a.bp = 0; }
  else if (a.paused <= 0 && Math.random() < 0.006) a.bp = 1;
  const frames = a.meta.frames || 1;
  if (frames > 1) {
    a.frameClock += dt; const fps = a.meta.fps || 6;
    if (a.frameClock >= 1000 / fps) { a.frameClock = 0; a.frame = (a.frame + 1) % frames; }
  }
}

// The main creature is whichever starter was hatched. Clawde uses the manifest
// mood-state sprites; other starters use their own single idle animation.
let MAIN = null;
function ensureMain(id, spriteMeta) {
  if (!spriteMeta) return;
  if (MAIN && MAIN.id === id && MAIN.meta.sheet === spriteMeta.sheet) return;
  const img = new Image();
  const rec = { id, img, meta: spriteMeta, ready: false };
  img.onload = () => { rec.ready = true; };
  img.src = '/assets/' + spriteMeta.sheet + '?v=' + Date.now();
  MAIN = rec;
}

// pick the renderable record for a mood-state, falling back to default.
function recFor(state) {
  if (MAIN && MAIN.ready) return MAIN; // non-Clawde starter: its own sprite
  const r = ART.images[state];
  if (r && r.ready) return r;
  const d = ART.images[ART.def];
  return d && d.ready ? d : null;
}

const pet = {
  state: 'idle', x: W / 2, dir: 1, vx: 0.28,
  t: 0, hop: 0, frame: 0, frameClock: 0, snap: null,
  dist: 0, py: null, tang: 0, // path-follow: arc-length, on-line y (px), tangent dx
};

// ---- Perspective walk paths (drawn in path-draw.html) ------------------
// A biome path is a normalized polyline; the creature rides it (its midpoint on
// the line) and scales with depth — higher up the line = smaller/further back.
let PATHS = {};
fetch('/api/paths', { cache: 'no-store' }).then(r => r.json()).then(p => { PATHS = p || {}; }).catch(() => {});
const persp = (pyN) => 0.62 + Math.max(0, Math.min(1, (pyN - 0.30) / 0.60)) * 0.56;
let _pathCache = { ref: null, built: null };
function activePath() {
  const p = PATHS[biome]; const ref = p && p.points;
  if (!ref || ref.length < 2) return null;
  if (_pathCache.ref !== ref) {
    const P = ref.map(q => ({ x: q.x * W, y: q.y * H })); const cum = [0];
    for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y));
    _pathCache = { ref, built: { P, cum, total: cum[cum.length - 1] || 1 } };
  }
  return _pathCache.built;
}
function pathAt(b, dist) {
  const d = Math.max(0, Math.min(b.total, dist));
  let i = 1; while (i < b.cum.length && b.cum[i] < d) i++;
  const a = b.P[i - 1], c = b.P[i] || a, seg = (b.cum[i] - b.cum[i - 1]) || 1, t = (d - b.cum[i - 1]) / seg;
  return { x: a.x + (c.x - a.x) * t, y: a.y + (c.y - a.y) * t, dx: c.x - a.x };
}

// ---- Decorations (hand-pixeled — simple objects, zero art budget) ------
const DECOR_ART = {
  rock: { px: 3, pal: { o: '#5a6478', d: '#3a4257', l: '#7b869e' }, map: [
    '  oool ',
    ' oooool',
    'ooooool',
    'doooooo',
    'ddooooo',
  ]},
  seaweed: { px: 3, sway: true, pal: { o: '#2f9e68', d: '#1c6b45', l: '#54c98a' }, map: [
    'l   o',
    'o  ol',
    'ol o ',
    ' o ol',
    ' olo ',
    'o  o ',
    'ol ol',
    ' o o ',
    ' olo ',
    ' oo  ',
    ' oo  ',
  ]},
  starfish: { px: 3, pal: { o: '#ff9f43', d: '#c76a1d', l: '#ffd39e' }, map: [
    '   o   ',
    '  lol  ',
    'o ooo o',
    ' ooooo ',
    '  ooo  ',
    ' oo oo ',
    'oo   oo',
  ]},
  bubbler: { px: 3, bubbles: true, pal: { o: '#6cc7d8', d: '#2b7a8c', l: '#c9f3fb' }, map: [
    '  l  ',
    ' ooo ',
    ' odo ',
    ' ooo ',
    'ddddd',
  ]},
  chest: { px: 3, sparkle: true, pal: { o: '#8a5a2b', d: '#5a3517', g: '#ffd23f' }, map: [
    'ddddddddd',
    'dooogoood',
    'dooogoood',
    'ggggggggg',
    'dooogoood',
    'ddddddddd',
  ]},
  castle: { px: 3, pal: { o: '#d9b380', d: '#8a6a3f', l: '#f0d6ab' }, map: [
    'oo oo oo oo',
    'ooooooooooo',
    'olooooooloo',
    ' ooooooooo ',
    ' oooddooo  ',
    ' oooddooo  ',
    'ooooddooooo',
    'ooooooooooo',
  ]},
};
const DECOR_SLOTS = [0.14, 0.86, 0.32, 0.68, 0.5, 0.22];

function drawMap(id, cx, bottomY) {
  const art = DECOR_ART[id]; if (!art) return;
  const rows = art.map, px = art.px || 3;
  const w = rows[0].length * px, h = rows.length * px;
  const x0 = Math.round(cx - w / 2), y0 = Math.round(bottomY - h);
  for (let r = 0; r < rows.length; r++) {
    let dx = 0;
    if (art.sway && rows.length - r > 3) dx = Math.round(Math.sin(pet.t * 0.045 + r * 0.5) * 1.6);
    for (let c = 0; c < rows[r].length; c++) {
      const ch = rows[r][c]; if (ch === ' ') continue;
      ctx.fillStyle = art.pal[ch] || art.pal.o;
      ctx.fillRect(x0 + c * px + dx, y0 + r * px, px, px);
    }
  }
  if (art.sparkle && (pet.t % 170) < 12) { ctx.fillStyle = '#fff'; ctx.fillRect(x0 + 2 * px, y0 + px, px, px); }
}

let bubblerX = null;
function drawDecorations() {
  bubblerX = null;
  if (biome !== 'aquatic') return; // current furniture is all water-tank gear
  const deco = (pet.snap && pet.snap.tank && pet.snap.tank.decorations) || [];
  const l = LX(), r = RX();
  deco.forEach((id, i) => {
    const cx = l + (DECOR_SLOTS[i % DECOR_SLOTS.length]) * (r - l);
    if (id === 'bubbler') bubblerX = cx;
    drawMap(id, cx, floorY() + 2);
  });
}

// friendly note when an unlocked habitat has no residents yet
function drawEmptyNote() {
  if (inBiome(pet.homeBiome || ART.biome)) return;                   // your creature lives here
  if (COMP.some(a => a && a.ready && inBiome(a.meta.biome))) return; // a companion lives here
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText('✨ a new habitat! ✨', W / 2, H / 2 - 8);
  ctx.fillText('no creatures live here yet…', W / 2, H / 2 + 6);
  ctx.textAlign = 'start';
}
// ---- Ambient life, kept inside the vessel interior ---------------------
let ambient = [];
function initAmbient() {
  ambient = [];
  const l = LX(), r = RX(), fy = floorY(), s = stage();
  const span = Math.max(20, r - l), n = Math.max(4, Math.round(span / 16));
  const rx = () => l + Math.random() * span;
  if (s.ambient === 'bubble') {
    const top = (s.water ? s.water.top : 0.35) * H;
    for (let i = 0; i < n; i++) ambient.push({ t: 'bubble', x: rx(), y: top + Math.random() * (fy - top), r: 1 + Math.random() * 2, sp: 0.15 + Math.random() * 0.4 });
  } else if (s.ambient === 'leaf') {
    const top = 0.28 * H;
    for (let i = 0; i < Math.round(n * 0.7); i++) ambient.push({ t: 'leaf', x: rx(), y: top + Math.random() * (fy - top), sp: 0.1 + Math.random() * 0.18, ph: Math.random() * 6 });
    for (let i = 0; i < 4; i++) ambient.push({ t: 'firefly', x: rx(), y: top + Math.random() * (fy - top - 20), vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.18, ph: Math.random() * 6 });
  } else {
    for (let i = 0; i < n; i++) ambient.push({ t: 'sand', x: rx(), y: fy - 3 - Math.random() * (fy * 0.22), sp: 0.25 + Math.random() * 0.4, ph: Math.random() * 6 });
  }
}

let particles = [];

// ---- Interactive: food pellets (feed drops real food they run to) ------
let pellets = [];
function dropPellets(n) {
  const l = LX(), r = RX();
  for (let i = 0; i < n; i++) pellets.push({ x: l + Math.random() * (r - l), y: -4 - Math.random() * 12, vy: 0.5 + Math.random() * 0.5, landed: false });
}

function updatePellets() {
  const gy = floorY() - 3;
  for (const p of pellets) if (!p.landed) { p.y += p.vy; if (p.y >= gy) { p.y = gy; p.landed = true; } }
  const landed = pellets.filter(p => p.landed);
  if (!landed.length) return;
  const eaters = [{ get x() { return pet.x; }, steer: (d) => { pet.dir = d; paused = 0; }, eat: () => { pet.hop = 4; } }];
  for (const a of COMP) if (a && a.ready) eaters.push({ get x() { return a.x; }, steer: (d) => { a.dir = d; a.paused = 0; }, eat: () => {} });
  for (const e of eaters) {
    let best = null, bd = 1e9;
    for (const p of landed) { const d = Math.abs(p.x - e.x); if (d < bd) { bd = d; best = p; } }
    if (!best) continue;
    e.steer(best.x > e.x ? 1 : -1);
    if (bd < 9) {
      pellets.splice(pellets.indexOf(best), 1);
      e.eat();
      particles.push({ icon: '✧', x: best.x, y: floorY() - 8, vx: 0, vy: -0.6, life: 20, max: 20 });
    }
  }
}
function drawPellets() {
  for (const p of pellets) {
    ctx.fillStyle = '#5a3517'; ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    ctx.fillStyle = '#8a5a2b'; ctx.fillRect(p.x - 1, p.y - 2, 2, 2);
  }
}

// ---- Interactive: bouncy ball (shop item — creatures push it around) ----
let ball = null;
function updateBall() {
  const owned = (pet.snap && pet.snap.tank && pet.snap.tank.decorations) || [];
  if (!owned.includes('ball') || biome !== 'aquatic') { ball = null; return; }
  if (!ball) ball = { x: (LX() + RX()) / 2, vx: 0 };
  ball.x += ball.vx; ball.vx *= 0.985;
  if (ball.x < LX() + 7) { ball.x = LX() + 7; ball.vx = Math.abs(ball.vx) * 0.8; }
  if (ball.x > RX() - 7) { ball.x = RX() - 7; ball.vx = -Math.abs(ball.vx) * 0.8; }
  const actors = [{ x: pet.x, hw: creatureWidthPx() * 0.3 }];
  for (const a of COMP) if (a && a.ready) actors.push({ x: a.x, hw: a.meta.frameW * (a.meta.scale || 1.7) * 0.3 });
  for (const a of actors) {
    const d = ball.x - a.x;
    if (Math.abs(d) < a.hw + 6) {
      const s = d >= 0 ? 1 : -1;
      ball.x = a.x + s * (a.hw + 6);
      ball.vx = s * Math.min(2.5, Math.abs(ball.vx) + 0.6);
    }
  }
}
function drawBall() {
  if (!ball) return;
  const y = floorY() - 5;
  ctx.fillStyle = '#8f1d1f'; ctx.beginPath(); ctx.arc(ball.x, y, 6, 0, 7); ctx.fill();
  ctx.fillStyle = '#e5484d'; ctx.beginPath(); ctx.arc(ball.x, y, 4.5, 0, 7); ctx.fill();
  const ang = ball.x * 0.25; // rolls as it moves
  ctx.fillStyle = '#fff4e0'; ctx.fillRect(ball.x + Math.cos(ang) * 3 - 1, y + Math.sin(ang) * 3 - 1, 2, 2);
}

function creatureWidthPx() {
  const rec = recFor(pet.state);
  return rec ? rec.meta.frameW * (rec.meta.scale || 2) * TANK_SCALE : 90;
}

function drawBg() {
  const s = stage();
  const bg = bgImage();
  ctx.imageSmoothingEnabled = false; // keep the vessel art crisp, like the sprites
  if (bg.ok) ctx.drawImage(bg.im, 0, 0, W, H);
  else { ctx.fillStyle = '#0a142e'; ctx.fillRect(0, 0, W, H); }

  const l = LX(), r = RX(), fy = floorY();
  const top = (s.water ? s.water.top : 0.3) * H;
  for (const a of ambient) {
    if (a.t === 'bubble') {
      ctx.fillStyle = 'rgba(200,235,255,0.35)';
      ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, 7); ctx.fill();
      a.y -= a.sp;
      if (a.y < top) { a.y = fy - 2; a.x = (bubblerX != null && Math.random() < 0.6) ? bubblerX + (Math.random() - 0.5) * 12 : l + Math.random() * (r - l); }
    } else if (a.t === 'leaf') {
      ctx.fillStyle = 'rgba(150,215,150,0.55)';
      ctx.fillRect(a.x + Math.sin(pet.t * 0.03 + a.ph) * 5, a.y, 3, 2);
      a.y += a.sp; if (a.y > fy) { a.y = top; a.x = l + Math.random() * (r - l); }
    } else if (a.t === 'firefly') {
      const glow = 0.35 + 0.6 * Math.abs(Math.sin(pet.t * 0.05 + a.ph));
      ctx.fillStyle = `rgba(255,240,140,${glow})`;
      ctx.fillRect(a.x, a.y, 2, 2);
      a.x += a.vx; a.y += a.vy;
      if (Math.random() < 0.02) { a.vx = (Math.random() - 0.5) * 0.25; a.vy = (Math.random() - 0.5) * 0.18; }
      if (a.x < l) a.x = r; if (a.x > r) a.x = l;
      if (a.y < top) a.y = top + 8; if (a.y > fy - 12) a.y = fy - 24;
    } else if (a.t === 'sand') {
      ctx.fillStyle = 'rgba(240,205,140,0.4)';
      ctx.fillRect(a.x, a.y + Math.sin(pet.t * 0.04 + a.ph) * 2, 2, 1);
      a.x -= a.sp; if (a.x < l - 2) { a.x = r + 2; a.y = fy - 3 - Math.random() * (fy * 0.22); }
    }
  }
}

// is this creature at home in the currently-shown biome?
function inBiome(b) { return (b || 'aquatic') === biome; }

function drawCreature() {
  if (!inBiome(pet.homeBiome || ART.biome)) return; // main creature only in its home biome
  const rec = recFor(pet.state);
  if (!rec) return;
  const m = rec.meta;
  const frames = m.frames || 1;
  const fw = m.frameW, fh = m.frameH;
  const onPath = pet.py != null && activePath();
  // perspective scale on a path (deeper = smaller); flat scale otherwise
  const scale = (m.scale || 2) * TANK_SCALE * (onPath ? persp(pet.py / H) : 1);
  const dw = fw * scale, dh = fh * scale;
  const bob = -Math.sin((pet.bp || 0) * Math.PI) * 5 - pet.hop; // occasional bounce, else flat
  const ox = Math.round(pet.x - dw / 2);
  // on a path the creature's MIDPOINT rides the line; otherwise feet on the floor
  const oy = Math.round((onPath ? pet.py - dh / 2 : floorY() - dh) + bob);
  const sx = (pet.frame % frames) * fw;
  // face the way it travels (along the path tangent, or by dir)
  const faceRight = onPath ? ((pet.dir > 0 ? pet.tang : -pet.tang) > 0) : (pet.dir > 0);

  ctx.save();
  ctx.imageSmoothingEnabled = !!m.smooth;
  if (faceRight) { ctx.translate(ox + dw, 0); ctx.scale(-1, 1); ctx.translate(-ox, 0); }
  ctx.drawImage(rec.img, sx, 0, fw, fh, ox, oy, dw, dh);
  ctx.restore();
  // (floating mood emote removed — a status display will return later)
}

function drawParticles() {
  particles = particles.filter(p => p.life > 0);
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.font = '12px monospace'; ctx.fillText(p.icon, p.x, p.y);
    ctx.globalAlpha = 1;
    p.x += p.vx; p.y += p.vy; p.vy += 0.03; p.life--;
  }
}

let paused = 0, lastTs = 0;
function frame(ts) {
  const dt = lastTs ? Math.min(64, ts - lastTs) : 16; lastTs = ts;
  pet.t++;
  const sleepy = pet.state === 'sleepy';
  if (paused > 0 || sleepy) { if (paused > 0) paused--; }
  else {
    const P = activePath();
    if (P) {
      // ride the drawn path (midpoint on the line); dir still steered by food/ball
      pet.dist += pet.vx * 2.4 * pet.dir;
      if (pet.dist <= 0) { pet.dist = 0; pet.dir = 1; }
      if (pet.dist >= P.total) { pet.dist = P.total; pet.dir = -1; }
      if (Math.random() < 0.006) pet.dir *= -1;
      if (Math.random() < 0.004) paused = 60 + Math.random() * 120;
      const q = pathAt(P, pet.dist);
      pet.x = q.x; pet.py = q.y; pet.tang = q.dx;
    } else {
      pet.py = null;
      const m = Math.min(creatureWidthPx() * 0.28, (RX() - LX()) * 0.3);
      const lo = LX() + m, hi = RX() - m;
      pet.x += pet.vx * pet.dir;
      if (pet.x < lo) { pet.x = lo; pet.dir = 1; }
      if (pet.x > hi) { pet.x = hi; pet.dir = -1; }
      if (Math.random() < 0.006) pet.dir *= -1;
      if (Math.random() < 0.004) paused = 60 + Math.random() * 120;
    }
  }
  if (pet.hop > 0) pet.hop = Math.max(0, pet.hop - 0.6);
  // occasional bounce for the main creature (else it walks flat)
  if (pet.bp > 0) { pet.bp -= dt / 430; if (pet.bp < 0) pet.bp = 0; }
  else if (!paused && !sleepy && Math.random() < 0.007) pet.bp = 1;

  const rec = recFor(pet.state);
  if (rec) {
    const fps = rec.meta.fps || 8;
    pet.frameClock += dt;
    if (pet.frameClock >= 1000 / fps) { pet.frameClock = 0; pet.frame = (pet.frame + 1) % (rec.meta.frames || 1); }
  }
  for (const a of COMP) updateActor(a, dt);
  updatePellets();
  updateBall();
  resolveCollisions();

  ctx.clearRect(0, 0, W, H);
  // camera: zoom into the vessel (bg + creatures transform together)
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(ZOOM, ZOOM);
  ctx.translate(-FOCUS.x * W, -FOCUS.y * H);
  drawBg();
  drawDecorations();                  // furniture behind everyone
  drawPellets();
  drawBall();
  for (const a of COMP) drawActor(a); // companions behind
  drawCreature();                     // main creature in front
  drawParticles();
  drawGlass();                        // front glass pane over everyone (look-through)
  ctx.restore();
  drawEmptyNote();                    // UI text stays unzoomed
  requestAnimationFrame(frame);
}

// ---- state sync -------------------------------------------------------
const $ = (id) => document.getElementById(id);
function setBar(key, val) {
  const el = $('bar-' + key); if (!el) return;
  el.style.width = Math.round(val) + '%';
  el.style.background = val < 25 ? '#e5484d' : val < 50 ? '#f2c94c' : '#56d364';
}

function applySnap(s) {
  if (!s.starterChosen) { location.href = '/start.html'; return; } // first run → egg screen
  pet.snap = s;
  // the FEATURED (main) creature — you can make any owned friendly your main
  const featured = s.main || s.starter;
  pet.homeBiome = (REG[featured] && REG[featured].biome) || pet.homeBiome || s.biome;
  if (featured === 'clawde') MAIN = null;                 // clawde uses the manifest mood sprites
  else ensureMain(featured, s.mainSprite);
  if (s.state !== pet.state) { pet.frame = 0; pet.frameClock = 0; pet.state = s.state; }
  // biome / tier drive which glass vessel (and its inner floor) we render
  if (!urlBiome) {
    let re = false;
    if (s.biome && STAGES[s.biome] && s.biome !== biome) { biome = s.biome; re = true; }
    if (s.tank && s.tank.tier && s.tank.tier !== tier) { tier = s.tank.tier; re = true; }
    if (re) { pet.x = (LX() + RX()) / 2; initAmbient(); }
  }
  buildCompanions(s);
  const stEl = $('statuses');
  if (stEl) stEl.innerHTML = (s.statuses || []).map(x => `<span class="schip" title="${x.desc}">${x.emoji} ${x.name}</span>`).join('');
  $('petname').textContent = s.name;
  if ($('mood')) $('mood').textContent = s.mood;
  if ($('bond')) $('bond').textContent = s.bond;
  if ($('pts')) $('pts').textContent = Math.floor(s.points || 0);
  if ($('comfort')) $('comfort').textContent = (s.comfort || 0) + '%';
  setBar('fullness', s.stats.fullness); setBar('hydration', s.stats.hydration);
  setBar('energy', s.stats.energy); setBar('happiness', s.stats.happiness);
}

let speechTimer = null;
function say(text, ms = 2600) {
  const el = $('speech'); if (!el) return;
  el.textContent = text; el.classList.remove('hidden');
  clearTimeout(speechTimer); speechTimer = setTimeout(() => el.classList.add('hidden'), ms);
}
function log(t) { if ($('log')) $('log').textContent = t; }

function burst(icon) {
  const sw = creatureWidthPx();
  for (let i = 0; i < 6; i++) particles.push({
    icon, x: pet.x + (Math.random() - 0.5) * sw, y: floorY() - 18,
    vx: (Math.random() - 0.5) * 1.5, vy: -1 - Math.random(), life: 40, max: 40,
  });
}

async function refresh() {
  try { applySnap(await (await fetch('/api/state')).json()); }
  catch { log('(offline — start the server)'); }
}

const ACTION_FX = { feed: '🍖', water: '💧', pet: '💗', play: '🎾', rest: '💤' };
async function doAction(action) {
  try {
    const s = await (await fetch('/api/action', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
    })).json();
    applySnap(s); burst(ACTION_FX[action] || '✨'); pet.hop = 6; say(s.voice, 2600);
    if (action === 'feed' && inBiome(pet.homeBiome || ART.biome)) dropPellets(4); // food rains down — they run for it
  } catch { log('(action failed — is the server running?)'); }
}

document.querySelectorAll('#controls button').forEach(b => b.addEventListener('click', () => doAction(b.dataset.action)));

// ---- Shop (spend Lab research points on upgrades) -----------------------
let TOKEN = null;
async function getToken() {
  if (!TOKEN) { try { TOKEN = (await (await fetch('/api/lab/token')).json()).token; } catch {} }
  return TOKEN;
}

async function loadShop() {
  const box = $('shopbody'); if (!box) return;
  try {
    const d = await (await fetch('/api/shop')).json();
    let html = `<div class="shopstat">🏡 Habitats — start with water, unlock the rest</div>`;
    for (const b of d.biomes) {
      html += `<div class="shopitem"><span class="si-name">${b.emoji} ${b.name} <small>${b.blurb}</small></span>` +
        (b.active ? `<span class="owned">● here</span>` :
         b.owned ? `<button class="switch" data-biome="${b.id}">visit</button>` :
         `<button class="buy" data-item="${b.id}">${b.cost} pts</button>`) + `</div>`;
    }
    html += `<div class="shopstat">🐾 Adopt — every creature is its own little agent</div>`;
    for (const c of d.creatures) {
      const stats = `v${c.stats.vigor} w${c.stats.wit} s${c.stats.speed} c${c.stats.charm} f${c.stats.focus}`;
      html += `<div class="shopitem"><span class="si-name">${c.emoji} ${c.name} <b style="color:${c.rarityColor};font-size:10px">${c.rarity}</b> <small>${c.blurb} · ${stats}</small></span>` +
        (c.owned ? `<span class="owned">✓</span>` :
         c.comingSoon ? `<span class="soon">soon</span>` :
         c.needsBiome ? `<span class="soon">needs ${c.needsBiome}</span>` :
         `<button class="buy" data-item="${c.id}">${c.cost} pts</button>`) + `</div>`;
    }
    html += `<div class="shopstat">🏠 ${d.tank.name} · ${d.tank.used}/${d.tank.slots} decor slots · comfort <b>+${d.comfort}%</b> (slower stat decay)</div>`;
    if (d.nextTank) html += `<div class="shopitem"><span class="si-name">⬆️ ${d.nextTank.name} <small>bigger world, ${d.nextTank.slots} slots</small></span><button class="buy" data-item="tank">${d.nextTank.cost} pts</button></div>`;
    else html += `<div class="shopstat">🏆 tank fully upgraded!</div>`;
    for (const it of d.decorations) {
      html += `<div class="shopitem"><span class="si-name">${it.emoji} ${it.name} <small>${it.blurb}</small></span>` +
        (it.owned ? `<span class="owned">✓</span>` : `<button class="buy" data-item="${it.id}">${it.cost} pts</button>`) + `</div>`;
    }
    box.innerHTML = html;
    box.querySelectorAll('.buy').forEach(b => b.addEventListener('click', () => buyItem(b.dataset.item)));
    box.querySelectorAll('.switch').forEach(b => b.addEventListener('click', () => switchBiome(b.dataset.biome)));
  } catch {}
}

async function buyItem(item) {
  await getToken();
  try {
    const r = await fetch('/api/shop/buy', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Lab-Token': TOKEN },
      body: JSON.stringify({ item }),
    });
    const d = await r.json();
    if (d.error) { log('⚠ ' + d.error); return; }
    log('🛒 bought: ' + d.bought + '!');
    burst('✨'); pet.hop = 6;
    loadShop(); refresh();
  } catch { log('purchase failed'); }
}

async function switchBiome(b) {
  await getToken();
  try {
    const r = await fetch('/api/shop/switch', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Lab-Token': TOKEN },
      body: JSON.stringify({ biome: b }),
    });
    const d = await r.json();
    if (d.error) { log('⚠ ' + d.error); return; }
    log('🏡 moved to the ' + b + ' tank');
    loadShop(); refresh();
  } catch { log('switch failed'); }
}

const shopEl = $('shop');
if (shopEl) $('shophead').addEventListener('click', () => shopEl.classList.toggle('open'));

initAmbient();
loadAssets();
loadSpecies();
refresh().then(() => { if (pet.snap) say(pet.snap.greeting || pet.snap.voice, 4600); });
loadShop();
setInterval(refresh, 3000);
setInterval(loadAssets, 15000);
setInterval(loadShop, 20000);
requestAnimationFrame(frame);

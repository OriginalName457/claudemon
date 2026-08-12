#!/usr/bin/env node
'use strict';
// ============================================================================
//  CLAWLAND — authoritative multiplayer server (MVP)
//  Zero-dependency. Serves the client + runs the game loop for ONE shared map.
//  Clients send inputs; the server owns all state and broadcasts area-of-interest
//  snapshots at 20 Hz. Deploy target: an Oracle Always-Free ARM box.
// ============================================================================
const http = require('http'), fs = require('fs'), path = require('path');
const { handleUpgrade } = require('./wslite');
const species = require('./species');

const PORT = Number(process.env.PORT || process.env.CLAWLAND_PORT || 4577);   // PaaS hosts (Render/Railway/etc.) inject PORT
const REALM = process.env.CLAWLAND_REALM || 'Phobos';   // realm name — run a 2nd with CLAWLAND_REALM=Deimos CLAWLAND_PORT=4578
const WEB = path.join(__dirname, '..', 'web');
const WORLD = 21000, SEED = 7777, TICKMS = 50, AOI = 1700, MAXBOTS = 28, MAXFOOD = 360;
const log = (...a) => console.error('[clawland-mp]', ...a);

// ---- terrain (MUST match web/clawland-mp.html so spawns land on real ground) ----
function mkNoise(seed) {
  const h = (x, y) => { let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 69069); n = Math.imul(n ^ n >>> 13, 1274126177); return ((n ^ n >>> 16) >>> 0) / 4294967296; };
  const s = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, tl = h(xi, yi), tr = h(xi + 1, yi), bl = h(xi, yi + 1), br = h(xi + 1, yi + 1), u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); return tl * (1 - u) * (1 - v) + tr * u * (1 - v) + bl * (1 - u) * v + br * u * v; };
  return (x, y, oct) => { let a = 0, amp = 0.5, f = 1; oct = oct || 4; for (let i = 0; i < oct; i++) { a += s(x * f, y * f) * amp; f *= 2; amp *= 0.5; } return a; };
}
const nE = mkNoise(SEED * 3 + 1), nM = mkNoise(SEED * 7 + 5), nW = mkNoise(SEED * 11 + 9), nR = mkNoise(SEED * 17 + 3), nS = mkNoise(SEED * 23 + 7);
function biome(x, y) {
  const e = nE(x / 1700, y / 1700, 5), wv = nW(x / 1150 + 80, y / 1150, 4), rv = Math.abs(nR(x / 3000, y / 3000 + 20, 3) - 0.5);
  if (e < 0.34) return 0; if (wv < 0.235) return 0; if (rv < 0.006) return 1;
  const m = nM(x / 1400 + 55, y / 1400, 4), sw = nS(x / 900 + 30, y / 900, 3);
  if (e < 0.49 && m > 0.52 && sw > 0.66) return 7;
  if (e < 0.40) return 2; if (e > 0.74) return 6; if (m < 0.37) return 5; if (m > 0.60) return 4; return 3;
}
const isLand = (x, y) => biome(x, y) >= 2;

// ---- species ----
const ALL = species.all();
const SP = {}; for (const s of ALL) SP[s.id] = s;
const ALLIES = ALL.filter((s) => s.faction === 'friendly' && s.sprite).map((s) => s.id);
const WILDS = ALL.filter((s) => s.faction === 'hostile' && s.sprite).map((s) => s.id);
const MELEE = { clawde: 'pinch', sting: 'pinch', fennette: 'slash', mantleaf: 'slash', spikelet: 'slash', mosskit: 'slash', glowbug: 'slash', dunepup: 'hook', huskcrawler: 'hook', prickuff: 'hook', gulpeel: 'bite', mirageling: 'bite', capshroom: 'bite', chompsprout: 'bite', slime: 'bite', thornmaw: 'bite', axoloom: 'bite' };
const FOODS = ['berries', 'apple', 'mushroom', 'melon'];
const ELEMCOL = { aquatic: '#8fd0ff', vivarium: '#8fd94a', desert: '#ffd23f' };

// ---- helpers ----
const rand = (a, b) => a + Math.random() * (b - a), pick = (a) => a[Math.floor(Math.random() * a.length)], clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const stat = (sp, k) => (sp.stats && sp.stats[k]) || 6;
const tierScale = (m) => 0.33 + m * 2.1;
const drawPx = (e) => 48 * tierScale(e.mass);
const radiusOf = (e) => drawPx(e) * 0.30;
function findSpawn() { for (let i = 0; i < 240; i++) { const x = rand(WORLD * 0.12, WORLD * 0.88), y = rand(WORLD * 0.12, WORLD * 0.88); if (isLand(x, y)) return { x, y }; } return { x: WORLD / 2, y: WORLD / 2 }; }
function findLandNear(cx, cy) { for (let r = 0; r < 9000; r += 220) for (let a = 0; a < 6.283; a += 0.35) { const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; if (isLand(x, y)) return { x, y }; } return { x: cx, y: cy }; }
const HUB = findLandNear(WORLD / 2, WORLD / 2);   // players spawn clustered near a central hub so the map feels alive with few players
function spawnNearHub() { for (let i = 0; i < 120; i++) { const a = rand(0, 6.283), r = rand(200, 2400), x = clamp(HUB.x + Math.cos(a) * r, 40, WORLD - 40), y = clamp(HUB.y + Math.sin(a) * r, 40, WORLD - 40); if (isLand(x, y)) return { x, y }; } return { x: HUB.x, y: HUB.y }; }

// ---- entities ----
let NID = 1;
function makeEnt(id, faction, isPlayer) {
  const sp = SP[id] || SP[ALLIES[0]], p = isPlayer ? spawnNearHub() : findSpawn();
  return { nid: NID++, id: sp.id, sp, faction, isPlayer: !!isPlayer, x: p.x, y: p.y, vx: 0, vy: 0, face: 1,
    mass: 0.02, hp: 70 + stat(sp, 'vigor') * 8, maxhp: 70 + stat(sp, 'vigor') * 8, baseSpd: 120 + stat(sp, 'speed') * 14,
    anim: Math.random() * 9, moving: false, cd: 0, hook: 1, aiT: 0, wander: { x: rand(0, WORLD), y: rand(0, WORLD) },
    aim: { x: 1, y: 0 }, input: { x: 0, y: 0 }, atk: false, name: sp.name, conn: null };
}
const players = new Map();   // Conn -> ent
let bots = [], food = [], events = [];
for (let i = 0; i < MAXBOTS; i++) bots.push(makeEnt(pick(WILDS), 'wild', false));
for (let i = 0; i < Math.floor(MAXBOTS * 0.55); i++) { const p = spawnNearHub(); bots[i].x = p.x; bots[i].y = p.y; bots[i].wander = { x: p.x, y: p.y }; }   // over half the bots patrol near the hub so there's PvE where players spawn
function seedFood() { while (food.length < MAXFOOD) { const p = findSpawn(); if (biome(p.x, p.y) >= 2 && biome(p.x, p.y) !== 6) food.push({ x: p.x, y: p.y, ty: pick(FOODS) }); } }
seedFood();

const hostile = (a, b) => a.faction !== b.faction;
function killEnt(o, by) {
  if (by) by.mass = Math.min(1, by.mass + 0.05 + o.mass * 0.15);
  const p = o.isPlayer ? spawnNearHub() : (Math.random() < 0.5 ? spawnNearHub() : findSpawn()); o.x = p.x; o.y = p.y; o.vx = 0; o.vy = 0; o.mass = 0.02;
  if (!o.isPlayer) { o.id = pick(WILDS); o.sp = SP[o.id]; o.name = o.sp.name; }
  o.maxhp = 70 + stat(o.sp, 'vigor') * 8; o.hp = o.maxhp;
  if (o.isPlayer && o.conn && o.conn.alive) o.conn.send(JSON.stringify({ t: 'died' }));
}

function applyMove(e, dt) {
  const spd = e.baseSpd * (1 - clamp(e.mass, 0, 1) * 0.32);
  e.vx += (e.input.x * spd - e.vx) * Math.min(1, dt * 9);
  e.vy += (e.input.y * spd - e.vy) * Math.min(1, dt * 9);
  e.x = clamp(e.x + e.vx * dt, 12, WORLD - 12); e.y = clamp(e.y + e.vy * dt, 12, WORLD - 12);
  e.moving = Math.hypot(e.vx, e.vy) > 18;
  if (e.input.x || e.input.y) e.face = e.input.x < 0 ? -1 : (e.input.x > 0 ? 1 : e.face);
  e.anim += dt * (e.moving ? 9 : 5);
}
function doAttack(e) {
  if (!e.atk || e.cd > 0) return; e.atk = false;
  const px = drawPx(e), aim = e.aim, reach = radiusOf(e) + px * 0.4, cx = e.x + aim.x * reach, cy = e.y + aim.y * reach, R = px * 0.55;
  const dmg = 9 * (1 + (stat(e.sp, 'vigor') - 6) * 0.03);
  for (const o of allEnts()) { if (o === e || !hostile(e, o)) continue; const dx = o.x - cx, dy = o.y - cy; if (dx * dx + dy * dy < (R + radiusOf(o)) ** 2) { o.hp -= dmg; if (o.hp <= 0) killEnt(o, e); } }
  e.cd = 0.73; e.hook = -e.hook;                                          // global attack speed matches single-player
  const el = ELEMCOL[e.sp.biome] || '#ffd7c0';
  events.push({ k: MELEE[e.id] || 'bash', x: Math.round(cx), y: Math.round(cy), r: +Math.atan2(aim.y, aim.x).toFixed(2), sc: +(px / 64 * 1.2).toFixed(2), fl: e.hook < 0 ? 1 : 0, c: '#ffffff', c2: el });
}
function ai(e, dt) {
  e.aiT -= dt; let tgt = null, bd = 1e18;
  for (const pl of players.values()) { const d = (pl.x - e.x) ** 2 + (pl.y - e.y) ** 2; if (d < bd) { bd = d; tgt = pl; } }
  let goal;
  if (tgt && bd < 720 * 720) {
    goal = tgt; const l = Math.sqrt(bd) || 1; e.aim = { x: (tgt.x - e.x) / l, y: (tgt.y - e.y) / l };
    if (bd < (radiusOf(e) + radiusOf(tgt) + drawPx(e) * 0.5) ** 2 && e.cd <= 0) e.atk = true;
  } else {
    let bf = null, fd = 620 * 620; for (const f of food) { const d = (f.x - e.x) ** 2 + (f.y - e.y) ** 2; if (d < fd) { fd = d; bf = f; } }
    if (bf) goal = bf;
    else { if ((e.wander.x - e.x) ** 2 + (e.wander.y - e.y) ** 2 < 6400 || e.aiT <= 0) { e.wander = { x: rand(0, WORLD), y: rand(0, WORLD) }; e.aiT = rand(2, 5); } goal = e.wander; }
  }
  const dx = goal.x - e.x, dy = goal.y - e.y, l = Math.hypot(dx, dy) || 1; e.input = { x: dx / l, y: dy / l };
}
function* allEntsGen() { for (const p of players.values()) yield p; for (const b of bots) yield b; }
const allEnts = () => [...allEntsGen()];

function step(dt) {
  for (const e of players.values()) { e.cd = Math.max(0, e.cd - dt); applyMove(e, dt); doAttack(e); }
  for (const e of bots) { e.cd = Math.max(0, e.cd - dt); ai(e, dt); applyMove(e, dt); doAttack(e); }
  // eating
  for (const e of allEnts()) {
    const rr = (radiusOf(e) + 10) ** 2;
    for (let i = food.length - 1; i >= 0; i--) { const f = food[i]; if ((e.x - f.x) ** 2 + (e.y - f.y) ** 2 < rr) { food.splice(i, 1); e.mass = Math.min(1, e.mass + 0.012); e.hp = Math.min(e.maxhp, e.hp + 3); } }
    // big eats small on contact
    if (e.mass > 0.14) for (const o of allEnts()) { if (o === e || !hostile(e, o)) continue; if ((e.x - o.x) ** 2 + (e.y - o.y) ** 2 < radiusOf(e) ** 2 && e.mass > o.mass * 1.7) killEnt(o, e); }
  }
  seedFood();
}
function snapEnt(o) { return [o.nid, Math.round(o.x), Math.round(o.y), o.id, +o.mass.toFixed(3), o.face, o.moving ? 1 : 0, +o.anim.toFixed(1), Math.round(o.hp), Math.round(o.maxhp), o.name, o.faction === 'wild' ? '#c25555' : '#f5793b']; }
function broadcast() {
  const ents = allEnts();
  for (const [conn, me] of players) {
    if (!conn.alive) continue;
    const e = [], f = [], fx = [];
    for (const o of ents) { if (o === me) continue; if (Math.abs(o.x - me.x) > AOI || Math.abs(o.y - me.y) > AOI) continue; e.push(snapEnt(o)); }
    for (const ff of food) { if (Math.abs(ff.x - me.x) > AOI || Math.abs(ff.y - me.y) > AOI) continue; f.push([Math.round(ff.x), Math.round(ff.y), ff.ty]); }
    for (const ev of events) { if (Math.abs(ev.x - me.x) > AOI || Math.abs(ev.y - me.y) > AOI) continue; fx.push(ev); }
    conn.send(JSON.stringify({ t: 's', me: { x: Math.round(me.x), y: Math.round(me.y), vx: Math.round(me.vx), vy: Math.round(me.vy), m: +me.mass.toFixed(3), h: Math.round(me.hp), mh: Math.round(me.maxhp), fc: me.face, sp: me.id, bs: me.baseSpd }, e, f, fx }));
  }
  events.length = 0;
}
let last = Date.now();
setInterval(() => { const now = Date.now(), dt = Math.min(0.1, (now - last) / 1000); last = now; step(dt); broadcast(); }, TICKMS);

// ---- HTTP: static client + species API ----
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const speciesPayload = JSON.stringify({ species: ALL.map((sp) => Object.assign({}, sp, { kit: species.kit(sp.id) })) });
const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/') p = '/clawland-mp.html';
  if (p === '/api/species') { res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); return res.end(speciesPayload); }
  const file = path.normalize(path.join(WEB, p));
  if (!file.startsWith(WEB)) { res.writeHead(403); return res.end('no'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});
server.on('upgrade', (req, socket) => {
  if ((req.url || '').split('?')[0] !== '/mp') { socket.destroy(); return; }
  handleUpgrade(req, socket, (conn) => {
    let ent = null;
    conn.onMessage((raw) => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (m.t === 'join' && !ent) {
        const id = ALLIES.includes(m.sp) ? m.sp : pick(ALLIES);
        ent = makeEnt(id, 'players', true); ent.conn = conn;
        ent.name = (String(m.name || 'Crab').trim() || 'Crab').slice(0, 14);
        players.set(conn, ent);
        conn.send(JSON.stringify({ t: 'welcome', id: ent.nid, seed: SEED, world: WORLD, realm: REALM }));
        log('join', ent.name, 'as', id, '| players', players.size);
      } else if (m.t === 'in' && ent) {
        if (Array.isArray(m.mv)) { const l = Math.hypot(m.mv[0], m.mv[1]); ent.input = l > 1 ? { x: m.mv[0] / l, y: m.mv[1] / l } : { x: m.mv[0] || 0, y: m.mv[1] || 0 }; }
        if (Array.isArray(m.aim)) { const l = Math.hypot(m.aim[0], m.aim[1]) || 1; ent.aim = { x: m.aim[0] / l, y: m.aim[1] / l }; }
        if (m.a) ent.atk = true;
      }
    });
    conn.onClose(() => { if (ent) { players.delete(conn); log('left', ent.name, '| players', players.size); } });
  });
});
server.listen(PORT, () => log('CLAWLAND realm "' + REALM + '" up on :' + PORT, '| allies', ALLIES.length, '| bots', bots.length));
process.on('uncaughtException', (e) => log('uncaught (kept alive):', e && e.stack || e));

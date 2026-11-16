// Fixed-step simulation (1/60 s): movement, gunplay, grenades, the charge,
// round flow and the economy. One job: advance the match one fixed step at
// a time. Rendering never touches this; it only reads the state the sim
// writes. No objects are allocated in the hot loop.
import { WEAPONS, GRENADES, isPrimary } from './weapons.js';
import { SITES, inSite, collideCircle, raySolids, hasLineOfSight } from './map.js';
import { player, aliveFighters, pushKillfeed, pushRadio, otherTeam } from './state.js';

export const DT = 1 / 60;
const EYE = 1.6;
const CROUCH_EYE = 1.1;
const RADIUS = 0.38;
const WALK_SPEED = 5.0;
const CROUCH_SPEED = 2.5;
const ACCEL = 42;

const _dir = { x: 0, y: 0, z: 0 };

// --- damage ---------------------------------------------------------------
function applyDamage(s, target, amount, headshot, attacker) {
  if (!target.alive) return;
  let dmg = amount;
  if (target.armour > 0) {
    const absorbed = Math.min(target.armour, dmg * 0.5);
    target.armour -= absorbed;
    dmg -= absorbed;
  }
  target.hp -= dmg;
  target.dmg = (target.dmg || 0) + 0; // target's dealt damage is tracked on the attacker
  if (attacker) {
    attacker.dmg += dmg;
    if (headshot) attacker.headshots += 1;
    attacker.hits += 1;
    if (target.id !== attacker.id) { target.lastDamager = attacker.id; target.lastDamageAt = s.time; }
  }
  if (target.hp <= 0) {
    target.alive = false;
    target.deaths += 1;
    target.hp = 0;
    if (attacker && attacker.id !== target.id) {
      attacker.kills += 1;
      attacker.cash += 300;
      // Assist: the last other damager within 5 s.
      if (target.lastDamager && target.lastDamager !== attacker.id) {
        const helper = s.fighters.find((f) => f.id === target.lastDamager);
        if (helper && s.time - target.lastDamageAt < 5) helper.assists += 1;
      }
      pushKillfeed(s, attacker.name, attacker.team, attacker.weaponName || 'Krait P9', target.name, headshot);
    }
  }
}

// Ray vs one fighter: body box (0.55 wide, 1.15 tall) + head box (0.34, 0.3).
// Returns {t, head} or null. Origin is the shooter's eye, dir is unit.
function rayFighter(ox, oy, oz, dx, dy, dz, f) {
  const eyeY = f.crouched ? CROUCH_EYE : EYE;
  const parts = [
    { y0: 0.35, y1: eyeY + 0.15, half: 0.30, head: false },
    { y0: eyeY + 0.15, y1: eyeY + 0.42, half: 0.19, head: true },
  ];
  let best = null;
  for (const p of parts) {
    // Slab test against the fighter's AABB.
    let tmin = 0; let tmax = 1e9; let ok = true;
    const axes = [[ox, dx, f.x - p.half, f.x + p.half], [oy, dy, p.y0, p.y1], [oz, dz, f.z - p.half, f.z + p.half]];
    for (const [o, d, lo, hi] of axes) {
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { ok = false; break; } }
      else {
        let t1 = (lo - o) / d; let t2 = (hi - o) / d;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) { ok = false; break; }
      }
    }
    if (ok && tmin >= 0 && (!best || tmin < best.t)) best = { t: tmin, head: p.head };
  }
  return best;
}

// Fire one trigger pull from `shooter` along `yaw/pitch` with spread.
// Returns {hit, head, x, y, z} of the impact point (for tracers/decals).
export function fireWeapon(s, shooter, yaw, pitch, spreadRad) {
  const w = WEAPONS[shooter.weapon];
  const eyeY = shooter.crouched ? CROUCH_EYE : EYE;
  const ox = shooter.x; const oy = eyeY; const oz = shooter.z;
  let hit = null;
  let endX = ox; let endY = oy; let endZ = oz;
  const pellets = w.pellets || 1;
  let bestT = Infinity; let bestHead = false; let bestVictim = null;
  let bestEnd = null;
  for (let p = 0; p < pellets; p += 1) {
    // Direction from yaw/pitch plus a random cone offset.
    const cy = Math.cos(yaw); const sy = Math.sin(yaw);
    const cp = Math.cos(pitch); const sp = Math.sin(pitch);
    // Base forward: (-sin yaw * cos pitch, sin pitch, -cos yaw * cos pitch).
    let dx = -sy * cp; let dy = sp; let dz = -cy * cp;
    const a = (s.rng.next() - 0.5) * 2 * spreadRad;
    const b = (s.rng.next() - 0.5) * 2 * spreadRad;
    // Perturb in the camera's right/up plane.
    const rx = cy; const rz = -sy;
    dx += rx * a; dy += b; dz += rz * a;
    const len = Math.hypot(dx, dy, dz); dx /= len; dy /= len; dz /= len;
    const wallT = raySolids(ox, oy, oz, dx, dy, dz);
    let victim = null; let vt = Infinity; let vhead = false;
    for (const f of s.fighters) {
      if (f === shooter || !f.alive || f.team === shooter.team) continue;
      const r = rayFighter(ox, oy, oz, dx, dy, dz, f);
      if (r && r.t < vt) { vt = r.t; victim = f; vhead = r.head; }
    }
    const t = Math.min(wallT, vt, 60);
    const ex = ox + dx * t; const ey = oy + dy * t; const ez = oz + dz * t;
    if (victim && vt <= wallT && vt < bestT) {
      bestT = vt; bestVictim = victim; bestHead = vhead; bestEnd = { x: ex, y: ey, z: ez };
    }
    if (p === 0) { endX = ex; endY = ey; endZ = ez; }
  }
  if (bestVictim) {
    const dist = bestT;
    let dmg = w.dmg * (dist > w.range ? 0.8 : 1);
    if (bestHead) dmg *= bestVictim.helmet ? 2 : w.headMul;
    shooter.weaponName = w.name;
    applyDamage(s, bestVictim, dmg, bestHead, shooter);
    hit = { victim: bestVictim, head: bestHead, x: bestEnd.x, y: bestEnd.y, z: bestEnd.z };
    return { hit, x: bestEnd.x, y: bestEnd.y, z: bestEnd.z };
  }
  return { hit: null, x: endX, y: endY, z: endZ };
}

// --- movement -------------------------------------------------------------
function moveFighter(s, f, fwd, strafe, dt) {
  const speed = (f.crouched ? CROUCH_SPEED : WALK_SPEED) * (f.isPlayer ? 1 : 0.84);
  const sy = Math.sin(f.yaw); const cy = Math.cos(f.yaw);
  // Forward is (-sin yaw, -cos yaw); right is (cos yaw, -sin yaw).
  const mx = (-sy * fwd + cy * strafe);
  const mz = (-cy * fwd - sy * strafe);
  const ml = Math.hypot(mx, mz);
  if (ml > 0.01) {
    f.vx += (mx / ml) * ACCEL * dt;
    f.vz += (mz / ml) * ACCEL * dt;
    f.moving = true;
  } else { f.moving = false; }
  // Friction.
  const fr = Math.max(0, 1 - 10 * dt);
  f.vx *= fr; f.vz *= fr;
  const vl = Math.hypot(f.vx, f.vz);
  if (vl > speed) { f.vx = (f.vx / vl) * speed; f.vz = (f.vz / vl) * speed; }
  f.x += f.vx * dt;
  f.z += f.vz * dt;
  collideCircle(f, RADIUS);
}

// --- grenades ---------------------------------------------------------------
function throwGrenade(s, f, kind) {
  if (f.grenades[kind] <= 0) return null;
  f.grenades[kind] -= 1;
  const g = {
    kind, x: f.x, y: EYE, z: f.z,
    vx: -Math.sin(f.yaw) * 9, vy: 3.2, vz: -Math.cos(f.yaw) * 9,
    at: s.time, owner: f.id,
  };
  s.grenades = s.grenades || [];
  s.grenades.push(g);
  return g;
}

function updateGrenades(s, dt) {
  if (!s.grenades) return;
  for (const g of s.grenades) {
    if (g.done) continue;
    g.vy -= 12 * dt;
    g.x += g.vx * dt; g.y += g.vy * dt; g.z += g.vz * dt;
    const hitGround = g.y <= 0.15;
    if (g.kind === 'frag' && (s.time - g.at > 1.5 || hitGround)) {
      g.done = true;
      const owner = s.fighters.find((f) => f.id === g.owner);
      for (const f of s.fighters) {
        if (!f.alive) continue;
        const d = Math.hypot(f.x - g.x, f.z - g.z);
        if (d < 6 && hasLineOfSight(g.x, 0.5, g.z, f.x, 1.0, f.z)) {
          applyDamage(s, f, 95 * (1 - d / 6) + 10, false, owner);
        }
      }
      s.boom = { x: g.x, y: 0.4, z: g.z, at: s.time };
    } else if (g.kind === 'flare' && hitGround) {
      g.done = true;
      s.flashes.push({ x: g.x, z: g.z, until: s.time + 2.2 });
      s.flareAt = { x: g.x, y: 0.3, z: g.z, at: s.time };
    } else if (g.kind === 'smoke' && hitGround) {
      g.done = true;
      s.smokes.push({ x: g.x, z: g.z, until: s.time + 15 });
    }
    if (hitGround && !g.done) { g.y = 0.15; g.vy = 0; g.vx *= 0.5; g.vz *= 0.5; }
  }
  s.grenades = s.grenades.filter((g) => !g.done || s.time - g.at < 0.2);
}

// --- rounds -----------------------------------------------------------------
function resetRound(s) {
  const spawnsO = [[-4, 15], [0, 16], [4, 15], [0, 13]];
  const spawnsH = [[-6, -15], [-2, -16], [2, -16], [6, -15]];
  s.fighters.forEach((f, i) => {
    const sp = f.team === 'OTTER' ? spawnsO[i % 4] : spawnsH[i % 4];
    f.x = sp[0]; f.z = sp[1];
    f.yaw = f.team === 'OTTER' ? Math.PI : 0;
    f.vx = 0; f.vz = 0;
    f.alive = true; f.hp = 100;
    if (f.isPlayer) { f.armour = f.armourKept || 0; f.helmet = !!f.helmetKept; }
    else { f.armour = 0; f.helmet = false; }
    if (f.bot) { f.bot.state = 'route'; f.bot.path = []; f.bot.plantProgress = 0; f.bot.defuseProgress = 0; }
  });
  // OTTER bot gear: one carries the charge (first alive OTTER bot).
  s.bomb = { state: 'carried', site: null, x: 0, z: 0, progress: 0, fuse: 0, carrier: 'player', planter: null };
  s.smokes = []; s.flashes = []; s.grenades = []; s.noise = [];
  s.timer = s.buyTime;
  s.phase = 'buy'; s.phaseAt = s.time;
}

export function startMatch(s) {
  s.scores = { OTTER: 0, HERON: 0 };
  s.round = 1;
  for (const f of s.fighters) {
    f.cash = 800; f.weapon = 'krait'; f.mag = 13; f.reserve = 52;
    f.owned = { krait: true };
    f.grenades = { frag: 0, flare: 0, smoke: 0 };
    f.armour = 0; f.helmet = false; f.hasDefuseKit = false;
    f.kills = 0; f.assists = 0; f.deaths = 0; f.headshots = 0; f.hits = 0; f.dmg = 0;
  }
  resetRound(s);
}

function endRound(s, winner, reason) {
  s.roundWinner = winner;
  s.scores[winner] += 1;
  const loser = otherTeam(winner);
  // Economy: winners +3250, losers +1900 (streak bonus tracked simply).
  for (const f of s.fighters) {
    if (f.team === winner) f.cash += 3250;
    else f.cash += 1900;
    if (f.team === 'OTTER' && reason === 'plant') f.cash += 0;
    f.armourKept = f.armour; f.helmetKept = f.helmet;
  }
  s.banner = winner === 'OTTER' ? 'OTTERS WIN THE ROUND' : 'HERONS WIN THE ROUND';
  s.phase = 'roundEnd'; s.phaseAt = s.time; s.roundEndAt = s.time;
  pushRadio(s, 'Match', s.banner + ' — ' + reason);
  if (s.scores[winner] >= s.winTarget || s.round >= s.maxRounds) {
    s.matchWinner = s.scores.OTTER > s.scores.HERON ? 'OTTER' : 'HERON';
    s.phase = 'matchEnd'; s.phaseAt = s.time;
  }
}

function checkRoundEnd(s) {
  if (s.phase !== 'live') return;
  const otterAlive = aliveFighters(s, 'OTTER').length;
  const heronAlive = aliveFighters(s, 'HERON').length;
  if (otterAlive === 0) { endRound(s, 'HERON', 'OTTER team eliminated'); return; }
  if (heronAlive === 0) {
    if (s.bomb.state === 'planted') { /* fuse still runs; defenders gone means it blows */ }
    else { endRound(s, 'OTTER', 'HERON team eliminated'); return; }
  }
  if (s.bomb.state === 'planted') {
    if (s.bomb.defusedBy) { endRound(s, 'HERON', 'charge defused'); return; }
    if (s.bomb.fuse <= 0) { endRound(s, 'OTTER', 'charge detonated at ' + (s.bomb.site || '')); return; }
  } else if (s.timer <= 0) {
    endRound(s, 'HERON', 'time expired, charge never armed');
  }
}

// --- the step ---------------------------------------------------------------
export function step(s, input, dt) {
  s.time += dt;
  const p = player(s);

  if (s.phase === 'buy') {
    s.timer -= dt;
    if (s.timer <= 0) { s.phase = 'live'; s.phaseAt = s.time; s.timer = s.roundTime; }
  } else if (s.phase === 'live') {
    if (s.bomb.state === 'planted') s.bomb.fuse -= dt;
    else s.timer -= dt;
    checkRoundEnd(s);
  } else if (s.phase === 'roundEnd') {
    if (s.time - s.roundEndAt > 4) {
      s.round += 1;
      resetRound(s);
    }
  }

  // Player look.
  if (input.lookDX || input.lookDY) {
    p.yaw -= input.lookDX * 0.0022;
    p.pitch -= input.lookDY * 0.0022;
    p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch));
    input.lookDX = 0; input.lookDY = 0;
  }
  p.crouched = !!input.keys.has('ControlLeft');

  // Player movement (not while the buy menu or a full overlay is open).
  if ((s.phase === 'live' || s.phase === 'buy') && !input.menuOpen) {
    const fwd = (input.keys.has('KeyW') ? 1 : 0) - (input.keys.has('KeyS') ? 1 : 0);
    const strafe = (input.keys.has('KeyD') ? 1 : 0) - (input.keys.has('KeyA') ? 1 : 0);
    moveFighter(s, p, fwd, strafe, dt);
  } else { p.vx *= 0.8; p.vz *= 0.8; }

  // Player firing.
  const w = WEAPONS[p.weapon];
  p.cooldown = (p.cooldown || 0) - dt;
  p.bloom = Math.max(0, (p.bloom || 0) - dt * 0.02);
  p.reloadAt = p.reloadAt || 0;
  if (input.firing && p.alive && (s.phase === 'live') && p.reloadAt <= s.time && p.cooldown <= 0 && !input.menuOpen) {
    if (p.mag > 0) {
      p.mag -= 1;
      p.cooldown = 60 / w.rpm;
      p.bloom = Math.min(0.03, (p.bloom || 0) + w.bloom);
      p.pitch += w.recoil * (0.7 + s.rng.next() * 0.6);
      p.yaw += (s.rng.next() - 0.5) * w.recoil * 0.6;
      const moving = Math.hypot(p.vx, p.vz) > 0.5;
      const spread = w.spread * (moving ? 2.2 : 1) * (p.crouched ? 0.7 : 1) + (p.bloom || 0);
      const res = fireWeapon(s, p, p.yaw, p.pitch, spread);
      s.lastShot = { from: p, x: res.x, y: res.y, z: res.z, at: s.time, hit: res.hit, weapon: w };
      s.noise.push({ x: p.x, z: p.z, at: s.time });
      if (res.hit) p.hitmarkAt = s.time;
      if (!w.auto) input.firing = false;
    } else {
      input.firing = false;
      p.cooldown = 0.25;
    }
  }
  // Reload.
  if (input.reload && p.alive && p.mag < w.mag && p.reserve > 0 && p.reloadAt <= s.time) {
    input.reload = false;
    p.reloadAt = s.time + 1.6;
    p.reloadWeapon = p.weapon;
  }
  if (p.reloadAt > 0 && p.reloadAt <= s.time && p.reloadWeapon) {
    const rw = WEAPONS[p.reloadWeapon];
    const need = rw.mag - p.mag;
    const take = Math.min(need, p.reserve);
    p.mag += take; p.reserve -= take;
    p.reloadWeapon = null;
  }

  // Weapon / grenade selection.
  if (input.select) {
    const sel = input.select; input.select = null;
    if (sel === '1' && p.owned.monsoon) { p.weapon = 'monsoon'; syncAmmo(s, p); }
    if (sel === '1' && !p.owned.monsoon && p.owned.cicada) { p.weapon = 'cicada'; syncAmmo(s, p); }
    if (sel === '2') { p.weapon = p.owned.lotus ? 'lotus' : 'krait'; syncAmmo(s, p); }
    if (sel === '3' && p.grenades.frag > 0) throwGrenade(s, p, 'frag');
    if (sel === '4' && p.grenades.flare > 0) throwGrenade(s, p, 'flare');
    if (sel === '5' && p.grenades.smoke > 0) throwGrenade(s, p, 'smoke');
  }

  // Plant / defuse: hold E.
  if (input.keys.has('KeyE') && p.alive && s.phase === 'live') {
    const site = inSite(p.x, p.z, SITES.A) ? SITES.A : inSite(p.x, p.z, SITES.B) ? SITES.B : null;
    if (p.team === 'OTTER' && site && s.bomb.state === 'carried' && s.bomb.carrier === 'player') {
      s.bomb.progress += dt / 3;
      if (s.bomb.progress >= 1) {
        s.bomb.state = 'planted'; s.bomb.site = site.label; s.bomb.x = p.x; s.bomb.z = p.z;
        s.bomb.fuse = s.fuseTime; s.bomb.planter = 'player';
        p.cash += 300;
        pushRadio(s, 'You', 'Charge armed at ' + site.label + ' — hold it');
      }
    } else if (p.team === 'HERON' && s.bomb.state === 'planted') {
      const d = Math.hypot(p.x - s.bomb.x, p.z - s.bomb.z);
      if (d < 2.5) {
        s.bomb.progress += dt / (p.hasDefuseKit ? 2.5 : 5);
        if (s.bomb.progress >= 1) endRound(s, 'HERON', 'charge defused');
      }
    }
  } else if (s.bomb.state === 'carried') {
    s.bomb.progress = Math.max(0, s.bomb.progress - dt / 2);
  }

  updateGrenades(s, dt);
  // Expire smoke/flash/noise.
  s.smokes = s.smokes.filter((sm) => sm.until > s.time);
  s.flashes = s.flashes.filter((fl) => fl.until > s.time);
  s.noise = s.noise.filter((n) => s.time - n.at < 2);
  if (s.boom && s.time - s.boom.at > 1.2) s.boom = null;
}

function syncAmmo(s, p) {
  const w = WEAPONS[p.weapon];
  p.mag = p['mag_' + p.weapon] ?? w.mag;
  p.reserve = p['res_' + p.weapon] ?? w.reserve;
  // Remember per-weapon ammo so switching back keeps the count.
  p['mag_' + p.weapon] = p.mag;
  p['res_' + p.weapon] = p.reserve;
}

export function buyItem(s, f, itemId) {
  const w = WEAPONS[itemId];
  const g = Object.values(GRENADES).find((x) => x.id === itemId);
  const gear = Object.values({ vest: { id: 'vest' }, vesthelm: { id: 'vesthelm' }, defuse: { id: 'defuse' } }).find((x) => x.id === itemId);
  if (w) {
    if (f.owned[itemId] || f.cash < w.price) return false;
    f.cash -= w.price;
    f.owned[itemId] = true;
    if (isPrimary(itemId)) { f.weapon = itemId; f.mag = w.mag; f.reserve = w.reserve; f['mag_' + itemId] = w.mag; f['res_' + itemId] = w.reserve; }
    else { f.weapon = itemId; f.mag = w.mag; f.reserve = w.reserve; f['mag_' + itemId] = w.mag; f['res_' + itemId] = w.reserve; }
    return true;
  }
  if (g) {
    if (f.cash < g.price) return false;
    f.cash -= g.price;
    f.grenades[itemId] += 1;
    return true;
  }
  if (itemId === 'vest' || itemId === 'vesthelm') {
    const price = itemId === 'vest' ? 650 : 1000;
    if (f.cash < price) return false;
    f.cash -= price;
    f.armour = itemId === 'vest' ? 50 : 100;
    f.helmet = itemId === 'vesthelm';
    return true;
  }
  if (itemId === 'defuse') {
    if (f.cash < 400 || f.hasDefuseKit) return false;
    f.cash -= 400;
    f.hasDefuseKit = true;
    return true;
  }
  return false;
}

// Bot brains: routes, holds, reactions. One job: decide what each bot does
// this tick. OTTER bots push a site and arm the charge; HERON bots hold the
// sites and answer a plant with a defuse. All of them see, hear and shoot.
import { WEAPONS } from './weapons.js';
import { SITES, inSite, nearestWaypoint, findPath, hasLineOfSight, WAYPOINTS, collideCircle } from './map.js';
import { player, aliveFighters, pushRadio } from './state.js';
import { fireWeapon } from './sim.js';

const EYE = 1.6;
const BOT_WEAPONS = ['monsoon', 'cicada', 'krait'];

function botWeapon(bot) {
  if (!bot.bot.weaponId) {
    bot.bot.weaponId = BOT_WEAPONS[Math.floor(Math.random() * BOT_WEAPONS.length)];
    bot.weapon = bot.bot.weaponId;
    const w = WEAPONS[bot.bot.weaponId];
    bot.mag = w.mag; bot.reserve = w.reserve;
  }
  return WEAPONS[bot.bot.weaponId];
}

// Is `target` visible to `bot` right now? Distance, field of view, a clear
// line, and not hidden behind a smoke cloud.
function canSee(s, bot, target) {
  const dx = target.x - bot.x; const dz = target.z - bot.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 42) return false;
  const angTo = Math.atan2(-dx, -dz); // yaw convention: forward is (-sin yaw, -cos yaw)
  let diff = angTo - bot.yaw;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  if (Math.abs(diff) > 1.05 && dist > 4) return false; // ~120-degree field of view
  const eyeY = target.crouched ? 1.1 : EYE;
  if (!hasLineOfSight(bot.x, EYE, bot.z, target.x, eyeY, target.z)) return false;
  for (const sm of s.smokes) {
    if (segmentHitsSphere(bot.x, EYE, bot.z, target.x, eyeY, target.z, sm.x, 1.0, sm.z, 2.2)) return false;
  }
  return true;
}

function segmentHitsSphere(x0, y0, z0, x1, y1, z1, cx, cy, cz, r) {
  const dx = x1 - x0; const dy = y1 - y0; const dz = z1 - z0;
  const len2 = dx * dx + dy * dy + dz * dz;
  let t = len2 > 0 ? ((cx - x0) * dx + (cy - y0) * dy + (cz - z0) * dz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const px = x0 + dx * t; const py = y0 + dy * t; const pz = z0 + dz * t;
  return (px - cx) * (px - cx) + (py - cy) * (py - cy) + (pz - cz) * (pz - cz) < r * r;
}

function isBlinded(s, bot) {
  if (s.time < (bot.bot.blindUntil || 0)) return true;
  for (const fl of s.flashes) {
    const d = Math.hypot(fl.x - bot.x, fl.z - bot.z);
    if (d < 14) {
      // Facing the flare blinds; looking away does not.
      const angTo = Math.atan2(-(fl.x - bot.x), -(fl.z - bot.z));
      let diff = angTo - bot.yaw;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      if (Math.abs(diff) < 1.2) { bot.bot.blindUntil = s.time + 1.6; return true; }
    }
  }
  return false;
}

function nearestEnemy(s, bot) {
  let best = null; let bd = Infinity;
  for (const f of s.fighters) {
    if (!f.alive || f.team === bot.team) continue;
    const d = Math.hypot(f.x - bot.x, f.z - bot.z);
    if (d < bd) { bd = d; best = f; }
  }
  return { enemy: best, dist: bd };
}

function setPathTo(s, bot, x, z) {
  const from = nearestWaypoint(bot.x, bot.z);
  const to = nearestWaypoint(x, z);
  bot.bot.path = findPath(from, to);
  bot.bot.pathI = 0;
}

function followPath(s, bot, dt) {
  const b = bot.bot;
  if (!b.path || b.pathI >= b.path.length) return true;
  const wp = WAYPOINTS[b.path[b.pathI]];
  const dx = wp.x - bot.x; const dz = wp.z - bot.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.6) { b.pathI += 1; return b.pathI >= b.path.length; }
  const want = Math.atan2(-dx, -dz);
  bot.yaw = turnToward(bot.yaw, want, dt * 6);
  // Walk forward along the facing.
  bot.vx += -Math.sin(bot.yaw) * 30 * dt;
  bot.vz += -Math.cos(bot.yaw) * 30 * dt;
  const sp = Math.hypot(bot.vx, bot.vz);
  const max = 4.2;
  if (sp > max) { bot.vx = (bot.vx / sp) * max; bot.vz = (bot.vz / sp) * max; }
  bot.x += bot.vx * dt; bot.z += bot.vz * dt;
  bot.moving = true;
  collideCircle(bot, 0.38);
  return false;
}

function turnToward(yaw, want, maxStep) {
  let diff = want - yaw;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  if (Math.abs(diff) <= maxStep) return want;
  return yaw + Math.sign(diff) * maxStep;
}

function aimAt(bot, target, dt) {
  const dx = target.x - bot.x; const dz = target.z - bot.z;
  const want = Math.atan2(-dx, -dz);
  bot.yaw = turnToward(bot.yaw, want, dt * 9);
  return Math.abs(want - bot.yaw) < 0.2;
}

function botShoot(s, bot, target, dt) {
  const b = bot.bot;
  const w = botWeapon(bot);
  if (s.time < b.nextShotAt) return;
  const dist = Math.hypot(target.x - bot.x, target.z - bot.z);
  const targetMoving = Math.hypot(target.vx || 0, target.vz || 0) > 0.5;
  const botMoving = Math.hypot(bot.vx, bot.vz) > 0.5;
  // Error grows with distance and movement; stopping to aim pays. Bots are
  // deliberately imperfect shots: a close-range melt would end every round
  // in seconds, so their error floor is generous.
  let err = 0.030 + dist * 0.0016 + (targetMoving ? 0.014 : 0) + (botMoving ? 0.012 : 0);
  if (target.crouched) err += 0.008;
  const res = fireWeapon(s, bot, bot.yaw, 0, err);
  bot.weaponName = w.name;
  s.lastShot = { from: bot, x: res.x, y: res.y, z: res.z, at: s.time, hit: res.hit, weapon: w };
  // Muzzle flash at the bot's gun (the renderer lights it for 60 ms).
  s.enemyFlash = { bot, at: s.time };
  s.noise.push({ x: bot.x, z: bot.z, at: s.time });
  b.burstLeft -= 1;
  if (b.burstLeft <= 0) {
    b.nextShotAt = s.time + 0.8 + s.rng.next() * 0.9;
    b.burstLeft = 3 + Math.floor(s.rng.next() * 3);
  } else {
    b.nextShotAt = s.time + 60 / w.rpm;
  }
  // Reload when the magazine runs dry.
  if (bot.mag <= 0) { bot.mag = w.mag; bot.reserve = Math.max(0, bot.reserve - w.mag); b.nextShotAt = s.time + 1.6; }
}

export function updateBot(s, bot, dt) {
  if (!bot.alive || !bot.bot) return;
  const b = bot.bot;
  const w = botWeapon(bot);
  if (bot.mag <= 0 && s.time >= (b.nextShotAt || 0)) { bot.mag = w.mag; b.nextShotAt = s.time + 1.4; }

  // Reaction: a visible enemy, or gunfire heard nearby. No fighting during
  // the buy phase — bots walk to their holds instead.
  const combat = s.phase === 'live';
  const { enemy, dist } = nearestEnemy(s, bot);
  const blinded = isBlinded(s, bot);
  let seen = null;
  if (combat && !blinded && enemy && canSee(s, bot, enemy)) seen = enemy;
  if (seen) { b.target = seen; b.reactAt = s.time; }
  else if (s.time - b.reactAt > 1.2) b.target = null;

  // Heard a shot: go look.
  if (!b.target) {
    for (const n of s.noise) {
      if (Math.hypot(n.x - bot.x, n.z - bot.z) < 26) {
        b.investigateX = n.x; b.investigateZ = n.z;
        if (b.state === 'hold') b.state = 'investigate';
      }
    }
  }

  // Fight first: if there is a target, face it and shoot.
  if (b.target && b.target.alive) {
    const aimed = aimAt(bot, b.target, dt);
    // Strafe while fighting so the bot is not a standing target.
    if (s.time > b.strafeAt) { b.strafeDir = Math.random() < 0.5 ? -1 : 1; b.strafeAt = s.time + 0.7 + Math.random() * 0.8; }
    const sy = Math.sin(bot.yaw); const cy = Math.cos(bot.yaw);
    bot.vx += cy * b.strafeDir * 14 * dt;
    bot.vz += -sy * b.strafeDir * 14 * dt;
    const sp = Math.hypot(bot.vx, bot.vz);
    if (sp > 2.2) { bot.vx = (bot.vx / sp) * 2.2; bot.vz = (bot.vz / sp) * 2.2; }
    bot.x += bot.vx * dt; bot.z += bot.vz * dt;
    bot.moving = true;
    collideCircle(bot, 0.38);
    if (aimed && dist < 38) {
      if (b.burstLeft <= 0) b.burstLeft = 3 + Math.floor(s.rng.next() * 3);
      botShoot(s, bot, b.target, dt);
    }
    return;
  }

  // No target: follow the role.
  bot.vx *= 0.85; bot.vz *= 0.85;
  if (bot.team === 'OTTER') {
    if (s.bomb.state === 'planted') {
      // Defend the planted charge from a short way off.
      if (b.state !== 'defend') { b.state = 'defend'; setPathTo(s, bot, s.bomb.x + 3, s.bomb.z + 3); }
      if (followPath(s, bot, dt)) { b.state = 'hold'; b.holdX = bot.x; b.holdZ = bot.z; }
      return;
    }
    if (b.state === 'plant') {
      // Arming the charge: stand still on the site.
      const site = inSite(bot.x, bot.z, SITES.A) ? SITES.A : inSite(bot.x, bot.z, SITES.B) ? SITES.B : null;
      if (site) {
        b.plantProgress += dt / 3;
        bot.yaw += dt * 0.4;
        if (b.plantProgress >= 1) {
          s.bomb.state = 'planted'; s.bomb.site = site.label; s.bomb.x = bot.x; s.bomb.z = bot.z;
          s.bomb.fuse = s.fuseTime; s.bomb.planter = bot.id;
          pushRadio(s, bot.name, 'Charge armed at ' + site.label + ' — hold it');
          b.state = 'defend';
        }
      } else b.state = 'route';
      return;
    }
    if (!b.site) {
      b.site = s.rng.next() < 0.5 ? 'A' : 'B';
      const t = SITES[b.site];
      setPathTo(s, bot, t.x, t.z);
      b.state = 'route';
    }
    if (b.state === 'route') {
      if (followPath(s, bot, dt)) {
        const site = SITES[b.site];
        if (inSite(bot.x, bot.z, site) && s.bomb.state === 'carried') {
          // Only the carrier arms it; the others cover.
          if (s.bomb.carrier === bot.id || s.bomb.carrier === 'player' && !player(s).alive) {
            b.state = 'plant'; b.plantProgress = 0;
            pushRadio(s, bot.name, 'Arming the charge at ' + site.label);
          } else { b.state = 'hold'; b.holdX = bot.x; b.holdZ = bot.z; }
        } else { b.state = 'hold'; b.holdX = bot.x; b.holdZ = bot.z; }
      }
    } else if (b.state === 'hold') {
      // Sweep the site.
      bot.yaw += Math.sin(s.time * 0.5 + bot.x) * dt * 0.8;
    }
  } else {
    // HERON: hold a site, rotate on a plant, defuse when it is armed.
    if (s.bomb.state === 'planted') {
      const d = Math.hypot(s.bomb.x - bot.x, s.bomb.z - bot.z);
      if (d < 2.5) {
        b.defuseProgress += dt / (bot.hasDefuseKit ? 2.5 : 5);
        if (b.defuseProgress >= 1) {
          // Defuse is resolved by the sim's round check through a flag.
          s.bomb.defusedBy = bot.id;
        }
      } else {
        if (b.state !== 'defuse') { b.state = 'defuse'; setPathTo(s, bot, s.bomb.x, s.bomb.z); }
        followPath(s, bot, dt);
      }
      return;
    }
    if (b.state === 'investigate') {
      setPathTo(s, bot, b.investigateX, b.investigateZ);
      b.state = 'route';
      return;
    }
    if (b.state === 'route') {
      if (followPath(s, bot, dt)) { b.state = 'hold'; b.holdX = bot.x; b.holdZ = bot.z; }
      return;
    }
    if (b.state === 'hold') {
      bot.yaw += Math.sin(s.time * 0.4 + bot.z) * dt * 0.9;
    }
  }
}

// Assign each HERON bot a site to hold at round start, and pick the charge
// carrier among the OTTER side (the player carries it unless dead).
export function assignRoundRoles(s) {
  const herons = s.fighters.filter((f) => f.team === 'HERON' && f.bot);
  const spots = [
    { site: 'A', x: 12, z: -7 }, { site: 'A', x: 16, z: -6 },
    { site: 'B', x: -12, z: -7 }, { site: 'B', x: -16, z: -6 },
  ];
  herons.forEach((h, i) => {
    const sp = spots[i % spots.length];
    h.bot.site = sp.site;
    h.bot.state = 'route';
    setPathTo(s, h, sp.x, sp.z);
    h.bot.holdX = sp.x; h.bot.holdZ = sp.z;
  });
  const otters = s.fighters.filter((f) => f.team === 'OTTER' && f.bot);
  otters.forEach((o) => { o.bot.site = null; o.bot.state = 'route'; o.bot.plantProgress = 0; });
  s.bomb.carrier = 'player';
}

// One place holds the whole match: every fighter, the round, the economy,
// the charge and the feeds. One job: hold the match state, in one place.
// The sim mutates it, the renderer reads it, the HUD draws it. Nothing else
// keeps match state.
import { makeRng } from './rng.js';

export const TEAMS = {
  OTTER: { name: 'OTTER', color: '#35c4b5', dark: '#1d7a70', label: 'OTTERS' },
  HERON: { name: 'HERON', color: '#e8a13a', dark: '#9a6a1d', label: 'HERONS' },
};

export const OTTER_NAMES = ['Taro', 'Nia', 'Bram'];
export const HERON_NAMES = ['Sena', 'Oka', 'Lila', 'Dewi'];

export function makeFighter(id, name, team, isPlayer, x, z, yaw) {
  return {
    id, name, team, isPlayer,
    x, z, y: 0, yaw, pitch: 0,
    vx: 0, vz: 0, moving: false, crouched: false,
    alive: true, hp: 100, armour: 0, helmet: false,
    cash: 800,
    weapon: 'krait', mag: 13, reserve: 52,
    owned: { krait: true },
    grenades: { frag: 0, flare: 0, smoke: 0 },
    hasDefuseKit: false,
    kills: 0, assists: 0, deaths: 0, headshots: 0, headHits: 0, hits: 0, dmg: 0,
    lastDamager: null, lastDamageAt: -99,
    // Bot brain state (unused for the player).
    bot: isPlayer ? null : {
      state: 'route', target: null, path: [], pathI: 0,
      holdX: 0, holdZ: 0, holdYaw: 0, site: null,
      reactAt: 0, burstLeft: 0, nextShotAt: 0, investigateX: 0, investigateZ: 0,
      plantProgress: 0, defuseProgress: 0, blindUntil: 0, strafeDir: 1, strafeAt: 0,
    },
  };
}

export function createState(seed) {
  const rng = makeRng(seed);
  const s = {
    rng, seed,
    time: 0,
    phase: 'title', // title | buy | live | roundEnd | matchEnd | paused
    phaseAt: 0,
    round: 1, maxRounds: 12, winTarget: 7,
    scores: { OTTER: 0, HERON: 0 },
    roundTime: 100, buyTime: 15, fuseTime: 40,
    timer: 15,
    banner: '',
    bomb: { state: 'carried', site: null, x: 0, z: 0, progress: 0, fuse: 0, carrier: 'player', planter: null },
    fighters: [],
    killfeed: [],
    radio: [],
    smokes: [], // {x, z, until}
    flashes: [], // {x, z, until} flare blinds
    noise: [], // {x, z, at} gunfire the bots heard
    roundWinner: null, matchWinner: null,
    roundEndAt: 0,
    playerId: 'player',
    staged: null, // 'start' | 'combat' | 'buy' | 'objective' | 'end'
    readyAt: 0,
  };
  // Player + 3 OTTER bots vs 4 HERON bots.
  s.fighters.push(makeFighter('player', 'You', 'OTTER', true, 0, 15, Math.PI));
  OTTER_NAMES.forEach((n, i) => s.fighters.push(makeFighter('otter' + i, n, 'OTTER', false, -4 + i * 4, 15, Math.PI)));
  HERON_NAMES.forEach((n, i) => s.fighters.push(makeFighter('heron' + i, n, 'HERON', false, -6 + i * 4, -15, 0)));
  return s;
}

export function player(s) { return s.fighters[0]; }
export function aliveFighters(s, team) { return s.fighters.filter((f) => f.alive && f.team === team); }
export function teamOf(s, id) { const f = s.fighters.find((x) => x.id === id); return f ? f.team : null; }

export function pushKillfeed(s, killerName, killerTeam, weaponName, victimName, headshot) {
  s.killfeed.unshift({ killerName, killerTeam, weaponName, victimName, headshot, at: s.time });
  if (s.killfeed.length > 5) s.killfeed.length = 5;
}

export function pushRadio(s, name, text) {
  s.radio.unshift({ name, text, at: s.time });
  if (s.radio.length > 3) s.radio.length = 3;
}

export function otherTeam(team) { return team === 'OTTER' ? 'HERON' : 'OTTER'; }

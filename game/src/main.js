// Bootstrap and the game loop for Monsoon Market. One job: own the frame —
// run the fixed-step sim, move the bots, keep the HUD and the renderer in
// sync, and stage the four screenshot scenes from ?shot=.
import { createState, player, pushKillfeed, pushRadio } from './state.js';
import { step, startMatch, buyItem, DT } from './sim.js';
import { updateBot, assignRoundRoles } from './bots.js';
import { Renderer } from './render.js';
import { initHUD, updateHUD, buildBuyMenu, setBuyHook, showBanner, showScoreboard } from './hud.js';
import { createInput, requestLock } from './input.js';
import { ensureAudio, sfx } from './audio.js';
import { WEAPONS } from './weapons.js';

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') || '1');
const shot = params.get('shot') || null;

const state = createState(seed);
state.staged = shot;
const input = createInput();
const renderer = new Renderer(document.getElementById('game'), state);

let prevPhase = state.phase;
let prevKills = 0;
let prevRound = 1;
let stageStartedAt = 0;
let readySet = false;

setBuyHook((id) => {
  const ok = buyItem(state, player(state), id);
  if (ok) { sfx.buy(); buildBuyMenu(state); }
  else sfx.denied();
  return ok;
});

document.getElementById('resume-btn').addEventListener('click', () => {
  ensureAudio();
  document.getElementById('pause').hidden = true;
  requestLock();
});

initHUD(state, {
  onPlay() {
    ensureAudio();
    if (state.phase === 'title') {
      startMatch(state);
      assignRoundRoles(state);
      document.getElementById('title-screen').hidden = true;
    }
    document.getElementById('pause').hidden = true;
    requestLock();
  },
  onRestart() {
    ensureAudio();
    document.getElementById('scoreboard').hidden = true;
    startMatch(state);
    assignRoundRoles(state);
    requestLock();
  },
  onCloseBuy() { input.menuOpen = false; },
  onToggleBuy() {
    input.menuOpen = !input.menuOpen;
    if (input.menuOpen) buildBuyMenu(state);
  },
});

// --- staging: deterministic scenes for the four screenshots ----------------
function stageShot(kind) {
  const p = player(state);
  // Staged scenes are already "in the game": hide the title screen for every
  // shot except the title shot itself, or it covers the scene.
  if (kind !== 'start') document.getElementById('title-screen').hidden = true;
  if (kind === 'start') {
    // Title screen over the live market at dusk.
    p.x = 0; p.z = 15; p.yaw = Math.PI; p.pitch = 0;
    state.readyDelay = 0.8;
  } else if (kind === 'combat') {
    startMatch(state);
    assignRoundRoles(state);
    state.round = 5;
    state.scores = { OTTER: 3, HERON: 2 };
    state.phase = 'live'; state.timer = 72;
    p.x = -2; p.z = 6; p.yaw = -0.84; p.pitch = 0;
    p.hp = 76; p.armour = 85; p.cash = 600;
    p.weapon = 'monsoon'; p.mag = 4; p.reserve = 32;
    p.owned = { krait: true, monsoon: true };
    p.grenades = { frag: 0, flare: 2, smoke: 1 };
    const sena = state.fighters.find((f) => f.name === 'Sena');
    const oka = state.fighters.find((f) => f.name === 'Oka');
    const taro = state.fighters.find((f) => f.name === 'Taro');
    // Enemies hold in the open mid-lane, facing the player, so the shot shows
    // two of them with the market behind.
    if (sena) { sena.x = 5; sena.z = -1; sena.yaw = 2.3; sena.weapon = 'monsoon'; sena.mag = 30; sena.reserve = 90; sena.bot.state = 'hold'; sena.hp = 250; }
    if (oka) { oka.x = 7; oka.z = -4; oka.yaw = 2.1; oka.weapon = 'cicada'; oka.mag = 30; oka.reserve = 120; oka.bot.state = 'hold'; oka.hp = 250; }
    if (taro) { taro.x = -1; taro.z = 1; taro.yaw = -0.7; }
    pushKillfeed(state, 'Taro', 'OTTER', 'Cicada SMG', 'Sena', false);
    pushKillfeed(state, 'Oka', 'HERON', 'Monsoon AR', 'Nia', false);
    pushRadio(state, 'Taro', 'Contact at Spice Row, rotating');
    state.readyDelay = 2.2;
  } else if (kind === 'buy') {
    startMatch(state);
    assignRoundRoles(state);
    state.round = 4;
    state.scores = { OTTER: 2, HERON: 1 };
    state.phase = 'buy'; state.timer = 5;
    p.x = 0; p.z = 15; p.yaw = Math.PI; p.pitch = 0;
    p.hp = 100; p.armour = 100; p.helmet = true; p.cash = 4050;
    p.weapon = 'monsoon'; p.mag = 30; p.reserve = 90;
    p.owned = { krait: true, monsoon: true, cicada: true };
    p.grenades = { frag: 1, flare: 2, smoke: 1 };
    input.menuOpen = true;
    buildBuyMenu(state);
    state.readyDelay = 1.0;
  } else if (kind === 'objective') {
    startMatch(state);
    assignRoundRoles(state);
    state.round = 3;
    state.scores = { OTTER: 1, HERON: 1 };
    state.phase = 'live'; state.timer = 82;
    p.x = -14; p.z = -9; p.yaw = 0.15; p.pitch = 0;
    p.hp = 100; p.armour = 100; p.cash = 1050;
    p.weapon = 'monsoon'; p.mag = 20; p.reserve = 90;
    p.owned = { krait: true, monsoon: true };
    p.grenades = { frag: 0, flare: 0, smoke: 0 };
    state.bomb.progress = 0.35;
    input.keys.add('KeyE'); // keep arming through the capture
    // Keep the HERON holders on the far side of the market for this shot, so
    // the player is still at full health when the charge is being armed.
    for (const f of state.fighters) {
      if (f.team !== 'HERON' || !f.bot) continue;
      f.x = 6 + (f.id.charCodeAt(5) % 3) * 4; f.z = -13;
      f.bot.state = 'hold';
    }
    state.readyDelay = 0.9;
  } else if (kind === 'end') {
    startMatch(state);
    state.round = 12;
    state.scores = { OTTER: 7, HERON: 5 };
    state.matchWinner = 'OTTER';
    state.phase = 'matchEnd';
    const set = (name, k, a, d, hs, hits, dmg, cash) => {
      const f = state.fighters.find((x) => x.name === name);
      if (!f) return;
      f.kills = k; f.assists = a; f.deaths = d; f.headshots = hs; f.hits = hits; f.dmg = dmg; f.cash = cash;
    };
    set('Taro', 12, 3, 7, 8, 14, 1230, 4450);
    set('You', 10, 3, 7, 5, 10, 1049, 3350);
    set('Nia', 9, 1, 7, 4, 9, 1027, 3400);
    set('Bram', 7, 2, 7, 5, 7, 722, 3450);
    set('Sena', 11, 4, 9, 7, 11, 1264, 0);
    set('Oka', 8, 1, 9, 4, 8, 748, 0);
    set('Lila', 7, 3, 8, 5, 7, 718, 0);
    set('Dewi', 6, 3, 8, 1, 6, 667, 0);
    showScoreboard(state);
    state.readyDelay = 1.0;
  }
  stageStartedAt = performance.now();
}

if (shot) stageShot(shot);

// --- the loop ----------------------------------------------------------------
let last = performance.now();
let acc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  // Once a staged shot is ready the sim freezes, so the capture shows the
  // staged numbers instead of another half-second of bot fire.
  if (!readySet) acc += dt;

  // Fixed steps.
  while (acc >= DT) {
    acc -= DT;
    if (state.phase === 'buy' || state.phase === 'live' || state.phase === 'roundEnd') {
      step(state, input, DT);
      // Phase transitions the sim just made.
      if (state.phase === 'buy' && prevPhase !== 'buy') {
        assignRoundRoles(state);
        if (!state.staged) { input.menuOpen = true; buildBuyMenu(state); }
        showBanner('ROUND ' + state.round, state.round === 1 ? 'OTTERS attack — arm the charge' : '');
      }
      if (state.phase === 'live' && prevPhase === 'buy') input.menuOpen = false;
      if (state.phase === 'roundEnd' && prevPhase === 'live') {
        if (state.roundWinner === 'OTTER') sfx.roundWin(); else sfx.roundLose();
        showBanner(state.banner, 'Round ' + state.round + ' of ' + state.maxRounds);
      }
      if (state.phase === 'matchEnd' && prevPhase !== 'matchEnd') {
        showScoreboard(state);
        if (state.matchWinner === 'OTTER') sfx.roundWin(); else sfx.roundLose();
      }
      prevPhase = state.phase;
      // Bots act during buy (walk to holds) and live (fight).
      if (state.phase === 'buy' || state.phase === 'live') {
        for (const f of state.fighters) if (f.bot) updateBot(state, f, DT);
      }
      // Sound hooks on the latest shot.
      if (state.lastShot && !state.lastShot.sounded) {
        state.lastShot.sounded = true;
        const from = state.lastShot.from;
        const w = WEAPONS[from.weapon];
        if (from.isPlayer) sfx.shot(w.sound);
        else if (Math.hypot(from.x - player(state).x, from.z - player(state).z) < 30) sfx.distantShot();
        if (state.lastShot.hit && state.lastShot.from.isPlayer) sfx.hit(state.lastShot.hit.head);
      }
      if (player(state).kills > prevKills) { prevKills = player(state).kills; sfx.kill(); }
      if (state.bomb.state === 'planted' && state.bomb.fuse > 0 && Math.floor(state.bomb.fuse * 2) !== Math.floor((state.bomb.fuse + DT) * 2)) {
        // Fuse beep twice a second.
        if (Math.floor(state.bomb.fuse) !== Math.floor(state.bomb.fuse + DT)) sfx.plantBeep();
      }
    }
    prevRound = state.round;
  }

  // Pause when pointer lock is lost mid-round (real play only, never staged).
  if (!state.staged && state.phase === 'live' && !input.locked && document.getElementById('title-screen').hidden) {
    document.getElementById('pause').hidden = false;
  }

  renderer.sync(state, dt, state.time);
  updateHUD(state, input);

  if (state.staged && !readySet && performance.now() - stageStartedAt > (state.readyDelay || 1) * 1000) {
    if (state.staged === 'combat') {
      player(state).hp = 76; player(state).armour = 85;
      // One live tracer in the frozen frame: the nearest HERON bot fires
      // across the player's view as the capture is taken.
      const sena = state.fighters.find((f) => f.name === 'Sena');
      if (sena && sena.alive) {
        state.lastShot = { from: sena, x: player(state).x, y: 1.2, z: player(state).z, at: state.time, hit: null, weapon: WEAPONS.monsoon, drawn: false };
      }
    }
    readySet = true;
    window.__shotReady = true;
  }
}

requestAnimationFrame(frame);

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
// Debug flag for headless play-tests: ?fast=1 shortens the buy phase and the
// round clock so a full round can be observed in seconds.
const FAST = params.get('fast') === '1';

const state = createState(seed);
if (FAST) { state.buyTime = 3; state.roundTime = 10; }
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
let hadLock = false;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  if (input.locked) hadLock = true;
  // Pause the sim when pointer lock is lost mid-round (Esc): the player
  // should not be shot while reading the pause screen. The lock is only
  // expected after the player has had it once, so the title screen and the
  // buy phase before the first lock are not frozen.
  const paused = !state.staged && hadLock && !input.locked
    && (state.phase === 'live' || state.phase === 'buy')
    && document.getElementById('title-screen').hidden;
  // Once a staged shot is ready the sim freezes, so the capture shows the
  // staged numbers instead of another half-second of bot fire.
  if (!readySet && !paused) acc += dt;

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

  // Show the pause screen while the sim is frozen for a lost lock.
  document.getElementById('pause').hidden = !paused;

  renderer.sync(state, dt, state.time);
  updateHUD(state, input);

  if (state.staged && !readySet && performance.now() - stageStartedAt > (state.readyDelay || 1) * 1000) {
    if (state.staged === 'combat') {
      // Restage the cover into an exact close-combat composition: whatever
      // the bots did during the delay, snap them back into frame — three
      // HERON enemies across the lane at 8-12 m, facing the player — and
      // freeze the fight mid-burst. The sim is frozen from here, so the
      // capture shows exactly this frame.
      const p = player(state);
      p.hp = 76; p.armour = 85;
      const place = (name, x, z) => {
        const f = state.fighters.find((f2) => f2.name === name);
        if (!f) return null;
        f.x = x; f.z = z; f.alive = true; f.hp = 250; f.vx = 0; f.vz = 0; f.moving = false;
        f.yaw = Math.atan2(-(p.x - x), -(p.z - z));
        if (f.bot) { f.bot.state = 'hold'; f.bot.target = null; }
        return f;
      };
      const sena = place('Sena', 3.5, -0.5);
      const oka = place('Oka', 7.5, 0.5);
      place('Lila', 2, -4);
      // Teammates and the fourth HERON sit behind the player, out of frame.
      place('Taro', -5, 2); place('Nia', -8, 12); place('Bram', 8, 12); place('Dewi', 14, 14);
      if (sena) {
        // The player fires at Sena: viewmodel muzzle flash + tracer downrange.
        state.lastShot = { from: p, x: sena.x, y: 1.3, z: sena.z, at: state.time, hit: null, weapon: WEAPONS.monsoon, drawn: false };
        // Sena fires back across the player's view: enemy muzzle flash + tracer.
        state.enemyFlash = { bot: sena, at: state.time };
        renderer.spawnTracer({ x: sena.x, y: 1.5, z: sena.z }, { x: p.x, y: 1.2, z: p.z });
        // Oka fires too: a second tracer crossing the frame.
        if (oka) renderer.spawnTracer({ x: oka.x, y: 1.5, z: oka.z }, { x: p.x, y: 1.2, z: p.z });
      }
      // Smoke drifting in the gap between the two right-hand enemies.
      state.smokes.push({ x: 6, z: -1, until: state.time + 8 });
      // Headline feeds: the player's headshot on top, three radio lines
      // with roles. Pushed newest-last so they read top-first.
      state.killfeed.length = 0;
      pushKillfeed(state, 'Oka', 'HERON', 'Cicada SMG', 'Nia', false);
      pushKillfeed(state, 'Sena', 'HERON', 'Monsoon AR', 'Taro', true);
      pushKillfeed(state, 'You', 'OTTER', 'Monsoon AR', 'Lila', true);
      state.radio.length = 0;
      pushRadio(state, 'Bram', 'Sniper: eyes on the square — two crossing mid');
      pushRadio(state, 'Nia', 'Support: holding Fish Pier — charge is ours');
      pushRadio(state, 'Taro', 'Assault: contact at Spice Row, rotating');
    }
    readySet = true;
    window.__shotReady = true;
  }
}

requestAnimationFrame(frame);

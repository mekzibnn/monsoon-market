// The HUD: every DOM panel the player sees — minimap, scores, timer,
// kill feed, radio, health/ammo, buy menu, scoreboard and title screen.
// One job: draw the state. It never writes match state except through the
// buy callback the main module hands it.
import { BUY_CATEGORIES, WEAPONS } from './weapons.js';
import { SOLIDS, SITES, BOUNDS, zoneAt, hasLineOfSight } from './map.js';
import { TEAMS, player, aliveFighters } from './state.js';

const $ = (id) => document.getElementById(id);
const seenAt = new Map();
let lastHp = 100;
let lastKills = 0;

function fmtTime(sec) {
  const t = Math.max(0, Math.ceil(sec));
  return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
}

function teamPips(el, wins) {
  let html = '';
  for (let i = 0; i < 7; i += 1) html += `<i class="${i < wins ? 'on' : ''}"></i>`;
  el.innerHTML = html;
}

export function initHUD(state, cb) {
  $('play-btn').addEventListener('click', () => cb.onPlay());
  $('restart-btn').addEventListener('click', () => cb.onRestart());
  $('buy-close').addEventListener('click', () => cb.onCloseBuy());
  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyB' && (state.phase === 'buy' || state.phase === 'live')) cb.onToggleBuy();
    if (e.code === 'Enter' && state.phase === 'matchEnd') cb.onRestart();
  });
}

export function buildBuyMenu(state) {
  const p = player(state);
  $('buy-cash').textContent = '$' + p.cash.toLocaleString();
  const grid = $('buy-grid');
  grid.innerHTML = '';
  for (const cat of BUY_CATEGORIES) {
    const col = document.createElement('div');
    col.className = 'buy-col';
    col.innerHTML = `<h3><span>${cat.key}</span> ${cat.title}</h3>`;
    for (const item of cat.items) {
      const owned = item.id in (p.owned || {}) || (item.id === 'vest' && p.armour >= 50 && !p.helmet) || (item.id === 'vesthelm' && p.helmet) || (item.id === 'defuse' && p.hasDefuseKit);
      const teamLocked = item.team && item.team !== p.team;
      const afford = p.cash >= item.price;
      const tooExp = !owned && !afford && !teamLocked;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'buy-item' + (owned ? ' owned' : '') + ((!afford || teamLocked) && !owned ? ' poor' : '');
      card.innerHTML = `<b>${item.name}</b><span class="price">${owned ? 'Owned' : '$' + item.price}</span><span class="blurb${tooExp ? ' too-exp' : ''}">${teamLocked ? item.team + ' only' : tooExp ? 'Too expensive' : item.blurb}</span>`;
      if (!owned && afford && !teamLocked) {
        card.addEventListener('click', () => { if (cbBuy(item.id)) buildBuyMenu(state); });
      }
      col.appendChild(card);
    }
    grid.appendChild(col);
  }
  // Grenade counts on the owned cards are shown in the ammo panel; the buy
  // callback lives on the module scope so the menu can refresh itself.
  function cbBuy(id) { return buyHook ? buyHook(id) : false; }
}
let buyHook = null;
export function setBuyHook(fn) { buyHook = fn; }

export function showBanner(text, sub) {
  const b = $('banner');
  b.querySelector('b').textContent = text;
  b.querySelector('span').textContent = sub || '';
  b.classList.add('show');
  clearTimeout(showBanner._t);
  showBanner._t = setTimeout(() => b.classList.remove('show'), 2600);
}

export function showScoreboard(state) {
  const sb = $('scoreboard');
  const won = state.matchWinner === 'OTTER';
  $('sb-title').textContent = won ? 'VICTORY' : 'DEFEAT';
  $('sb-title').className = won ? 'win' : 'lose';
  $('sb-sub').textContent = `Monsoon Market · ${state.scores.OTTER} : ${state.scores.HERON} · Enter for a new match`;
  for (const team of ['OTTER', 'HERON']) {
    const rows = state.fighters.filter((f) => f.team === team)
      .sort((a, b) => b.kills - a.kills || b.dmg - a.dmg);
    const body = $(team === 'OTTER' ? 'sb-otters' : 'sb-herons');
    body.innerHTML = rows.map((f) => {
      const hs = f.hits > 0 ? Math.round((f.headshots / f.hits) * 100) : 0;
      return `<tr class="${f.isPlayer ? 'you' : ''}"><td>${f.name}</td><td>${f.kills}</td><td>${f.assists}</td><td>${f.deaths}</td><td>${hs}%</td><td>${Math.round(f.dmg)}</td><td>${f.team === 'OTTER' ? '$' + f.cash.toLocaleString() : '—'}</td></tr>`;
    }).join('');
    $(team === 'OTTER' ? 'sb-otter-score' : 'sb-heron-score').textContent = state.scores[team];
  }
  sb.hidden = false;
}

function drawMinimap(state) {
  const cv = $('minimap');
  const g = cv.getContext('2d');
  const W = cv.width; const H = cv.height;
  const px = (x) => ((x - BOUNDS.x0) / (BOUNDS.x1 - BOUNDS.x0)) * W;
  const pz = (z) => ((z - BOUNDS.z0) / (BOUNDS.z1 - BOUNDS.z0)) * H;
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(20,18,26,0.85)';
  g.fillRect(0, 0, W, H);
  // Water.
  g.fillStyle = 'rgba(38,90,110,0.8)';
  g.fillRect(0, 0, px(-20.5), H);
  // Solids.
  g.fillStyle = 'rgba(160,150,135,0.9)';
  for (const s of SOLIDS) g.fillRect(px(s.x0), pz(s.z0), px(s.x1) - px(s.x0), pz(s.z1) - pz(s.z0));
  // Sites.
  for (const key of ['A', 'B']) {
    const site = SITES[key];
    const planted = state.bomb.state === 'planted' && state.bomb.site === site.label;
    g.fillStyle = planted ? '#ff5a3a' : 'rgba(232,161,58,0.9)';
    g.fillRect(px(site.x0), pz(site.z0), px(site.x1) - px(site.x0), pz(site.z1) - pz(site.z0));
    g.fillStyle = '#14121a';
    g.font = 'bold 11px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(key, px(site.x), pz(site.z));
  }
  const p = player(state);
  // Enemies the player has seen recently.
  for (const f of state.fighters) {
    if (!f.alive || f.team === p.team || f.isPlayer) continue;
    if (hasLineOfSight(p.x, 1.6, p.z, f.x, 1.4, f.z)) seenAt.set(f.id, state.time);
    if (state.time - (seenAt.get(f.id) || -99) < 3) {
      g.fillStyle = '#ff5a3a';
      g.beginPath(); g.arc(px(f.x), pz(f.z), 3.5, 0, Math.PI * 2); g.fill();
    }
  }
  // Teammates.
  for (const f of aliveFighters(state, 'OTTER')) {
    if (f.isPlayer) continue;
    g.fillStyle = TEAMS.OTTER.color;
    g.beginPath(); g.arc(px(f.x), pz(f.z), 3, 0, Math.PI * 2); g.fill();
  }
  // Player arrow.
  g.save();
  g.translate(px(p.x), pz(p.z));
  g.rotate(Math.atan2(-Math.sin(p.yaw), -Math.cos(p.yaw)) + Math.PI / 2);
  g.fillStyle = '#ffffff';
  g.beginPath(); g.moveTo(0, -6); g.lineTo(4.5, 5); g.lineTo(-4.5, 5); g.closePath(); g.fill();
  g.restore();
}

export function updateHUD(state, input) {
  const p = player(state);
  // Top bar.
  $('score-otter').textContent = state.scores.OTTER;
  $('score-heron').textContent = state.scores.HERON;
  teamPips($('pips-otter'), state.scores.OTTER);
  teamPips($('pips-heron'), state.scores.HERON);
  $('round-label').textContent = 'ROUND ' + state.round + ' OF ' + state.maxRounds;
  const fuse = state.bomb.state === 'planted';
  $('round-timer').textContent = fmtTime(fuse ? state.bomb.fuse : state.timer);
  $('round-timer').classList.toggle('fuse', fuse);
  $('phase-label').textContent = state.phase === 'buy' ? 'BUY' : fuse ? 'CHARGE ARMED' : state.phase === 'live' ? 'LIVE' : state.phase.toUpperCase();
  // Minimap + zone.
  drawMinimap(state);
  $('zone-label').textContent = zoneAt(p.x, p.z);
  // Kill feed.
  const kf = $('killfeed');
  kf.innerHTML = state.killfeed.map((k) => {
    const kc = k.killerTeam === 'OTTER' ? 'color:#35c4b5' : 'color:#e8a13a';
    return `<div><span style="${kc}">${k.killerName}</span> <span class="w">${k.weaponName}</span>${k.headshot ? ' <span class="hs">HS</span>' : ''} <span>${k.victimName}</span></div>`;
  }).join('');
  // Radio.
  $('radio').innerHTML = state.radio.map((r) => `<div><b>${r.name}</b> ${r.text}</div>`).join('');
  // Bottom left.
  $('health').textContent = Math.ceil(p.hp);
  $('health').parentElement.classList.toggle('low', p.hp <= 30);
  $('armour').textContent = Math.ceil(p.armour) + (p.helmet ? '+H' : '');
  $('cash').textContent = '$' + p.cash.toLocaleString();
  // Bottom right.
  const w = WEAPONS[p.weapon];
  $('weapon-name').textContent = w.name.toUpperCase();
  $('ammo-mag').textContent = p.mag;
  $('ammo-reserve').textContent = '/ ' + p.reserve;
  $('ammo').classList.toggle('empty', p.mag === 0);
  $('grenades').innerHTML =
    `<span>3 Frag ${p.grenades.frag}</span><span>4 Flare ${p.grenades.flare}</span><span>5 Smoke ${p.grenades.smoke}</span>` +
    (state.bomb.state === 'carried' && state.bomb.carrier === 'player' ? '<span class="charge">Charge</span>' : '');
  // Crosshair spread follows movement and bloom.
  const moving = Math.hypot(p.vx, p.vz) > 0.5;
  const gap = 5 + (moving ? 7 : 0) + Math.min(10, (p.bloom || 0) * 300);
  document.documentElement.style.setProperty('--xgap', gap + 'px');
  // Hitmarker.
  $('hitmarker').classList.toggle('on', state.time - (p.hitmarkAt || -9) < 0.12);
  // Damage vignette.
  if (p.hp < lastHp) $('damage').classList.add('show');
  if (p.hp > lastHp) $('damage').classList.remove('show');
  lastHp = p.hp;
  setTimeout(() => $('damage').classList.remove('show'), 350);
  // Plant / defuse progress.
  const site = state.bomb.state === 'carried' && state.bomb.progress > 0.01;
  const defusing = state.bomb.state === 'planted' && state.bomb.progress > 0.01;
  $('plant-bar').hidden = !(site || defusing);
  if (site || defusing) {
    $('plant-fill').style.width = Math.round(state.bomb.progress * 100) + '%';
    $('plant-label').textContent = defusing ? 'Defusing the charge' : 'Arming the charge';
    $('plant-hint').innerHTML = defusing ? 'Hold <b>E</b> to defuse the charge' : 'Hold <b>E</b> to arm the charge';
  }
  // Buy menu state.
  $('buy-menu').hidden = !input.menuOpen;
  if (input.menuOpen) $('buy-timer').textContent = Math.max(0, Math.ceil(state.timer)) + ' S LEFT';
  // Kill sound hook: the main loop watches kills itself; the HUD only draws.
  if (p.kills > lastKills) lastKills = p.kills;
}

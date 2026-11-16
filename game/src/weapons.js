// Weapon, gear and grenade catalogue for Monsoon Market. One job: the
// numbers the buy menu and the gunplay both read, so the two can never drift
// apart. All names are original; nothing here copies a commercial game.
export const WEAPONS = {
  krait: {
    id: 'krait', name: 'Krait P9', cat: 'sidearm', price: 300,
    dmg: 26, headMul: 4, rpm: 400, mag: 13, reserve: 52, auto: false,
    spread: 0.011, bloom: 0.004, recoil: 0.010, range: 28, pellets: 1,
    sound: 'pistol', blurb: '26 dmg · 400 rpm · 13/52',
  },
  lotus: {
    id: 'lotus', name: 'Lotus .44', cat: 'sidearm', price: 700,
    dmg: 53, headMul: 4, rpm: 180, mag: 6, reserve: 30, auto: false,
    spread: 0.008, bloom: 0.006, recoil: 0.024, range: 30, pellets: 1,
    sound: 'heavy', blurb: '53 dmg · 180 rpm · 6/30',
  },
  cicada: {
    id: 'cicada', name: 'Cicada SMG', cat: 'close', price: 1200,
    dmg: 24, headMul: 3.5, rpm: 780, mag: 30, reserve: 120, auto: true,
    spread: 0.015, bloom: 0.003, recoil: 0.007, range: 22, pellets: 1,
    sound: 'smg', blurb: '24 dmg · 780 rpm · 30/120 · auto',
  },
  tide: {
    id: 'tide', name: 'Tide 12', cat: 'close', price: 1400,
    dmg: 9, headMul: 3, rpm: 70, mag: 6, reserve: 30, auto: false,
    spread: 0.055, bloom: 0.010, recoil: 0.038, range: 14, pellets: 8,
    sound: 'shotgun', blurb: '8x9 dmg · 70 rpm · 6/30',
  },
  monsoon: {
    id: 'monsoon', name: 'Monsoon AR', cat: 'rifle', price: 2700,
    dmg: 33, headMul: 4, rpm: 600, mag: 30, reserve: 90, auto: true,
    spread: 0.010, bloom: 0.003, recoil: 0.011, range: 40, pellets: 1,
    sound: 'rifle', blurb: '33 dmg · 600 rpm · 30/90 · auto',
  },
  egret: {
    id: 'egret', name: 'Egret DMR', cat: 'rifle', price: 4200,
    dmg: 88, headMul: 4, rpm: 48, mag: 5, reserve: 25, auto: false,
    spread: 0.002, bloom: 0.008, recoil: 0.030, range: 60, pellets: 1,
    sound: 'dmr', zoom: 2.4, blurb: '88 dmg · 48 rpm · 5/25 · scope',
  },
};

export const GEAR = {
  vest: { id: 'vest', name: 'Kevlar vest', price: 650, armour: 50, blurb: 'Body armour 50' },
  vesthelm: { id: 'vesthelm', name: 'Vest + helmet', price: 1000, armour: 100, helmet: true, blurb: 'Armour 100 and a helmet' },
  defuse: { id: 'defuse', name: 'Defuse kit', price: 400, team: 'HERON', blurb: 'Defuse in 2.5 s instead of 5' },
};

export const GRENADES = {
  frag: { id: 'frag', name: 'Frag', price: 300, blurb: 'Blast up to 6 m' },
  flare: { id: 'flare', name: 'Flare', price: 200, blurb: 'Blinds whoever faces it' },
  smoke: { id: 'smoke', name: 'Smoke', price: 300, blurb: '15 s cloud that blocks sight' },
};

// Buy-menu layout: five categories, the order the HUD shows them in.
export const BUY_CATEGORIES = [
  { key: '1', title: 'SIDEARMS', items: [WEAPONS.krait, WEAPONS.lotus] },
  { key: '2', title: 'CLOSE RANGE', items: [WEAPONS.cicada, WEAPONS.tide] },
  { key: '3', title: 'RIFLES', items: [WEAPONS.monsoon, WEAPONS.egret] },
  { key: '4', title: 'GEAR', items: [GEAR.vest, GEAR.vesthelm, GEAR.defuse] },
  { key: '5', title: 'GRENADES', items: [GRENADES.frag, GRENADES.flare, GRENADES.smoke] },
];

export function isRifle(id) { return WEAPONS[id] && WEAPONS[id].cat === 'rifle'; }
export function isPrimary(id) { return WEAPONS[id] && (WEAPONS[id].cat === 'close' || WEAPONS[id].cat === 'rifle'); }

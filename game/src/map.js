// Monsoon Market: a rain-slick night market on stilts over a river at dusk.
// One job: the map's facts — solids, sites, spawns, waypoints and zone names —
// shared by the sim (collision, sight, routes), the renderer and the minimap.
// North is -z: HERON defends the north sites, OTTER attacks from the south.

export const BOUNDS = { x0: -23, x1: 23, z0: -19, z1: 19 };

export const SITES = {
  A: { key: 'A', label: 'SPICE ROW', x: 14, z: -9, x0: 9, x1: 19, z0: -13, z1: -5 },
  B: { key: 'B', label: 'FISH PIER', x: -14, z: -9, x0: -19, x1: -9, z0: -13, z1: -5 },
};

export const SPAWNS = {
  OTTER: [{ x: -4, z: 15 }, { x: 0, z: 16 }, { x: 4, z: 15 }, { x: 0, z: 13 }],
  HERON: [{ x: -6, z: -15 }, { x: -2, z: -16 }, { x: 2, z: -16 }, { x: 6, z: -15 }],
};

// Solids: axis-aligned boxes. h > 1.5 blocks sight and bullets at eye height;
// anything blocks movement. {x0,z0,x1,z1,h}
export const SOLIDS = [];
function solid(cx, cz, w, d, h) {
  SOLIDS.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, h });
}
// Perimeter walls.
solid(0, -19.5, 48, 1, 3.5); solid(0, 19.5, 48, 1, 3.5);
solid(-23.5, 0, 1, 40, 3.5); solid(23.5, 0, 1, 40, 3.5);
// Market stalls (counter + awning read as one solid block).
const STALLS = [
  { x: -8, z: -4, rot: 0, awning: 'red' }, { x: -4, z: -4, rot: 0, awning: 'teal' },
  { x: 4, z: -4, rot: 0, awning: 'amber' }, { x: 8, z: -4, rot: 0, awning: 'red' },
  { x: -8, z: 4, rot: 0, awning: 'teal' }, { x: -4, z: 4, rot: 0, awning: 'amber' },
  { x: 4, z: 4, rot: 0, awning: 'red' }, { x: 8, z: 4, rot: 0, awning: 'teal' },
  { x: -12, z: 8, rot: 0, awning: 'amber' }, { x: -6, z: 8, rot: 0, awning: 'red' },
  { x: 6, z: 8, rot: 0, awning: 'teal' }, { x: 12, z: 8, rot: 0, awning: 'amber' },
  { x: 11, z: -12, rot: 0, awning: 'red' }, { x: 16, z: -12, rot: 0, awning: 'amber' },
  { x: 17, z: -7, rot: 0, awning: 'teal' },
  { x: -11, z: -12, rot: 0, awning: 'teal' }, { x: -16, z: -12, rot: 0, awning: 'red' },
  { x: -17, z: -7, rot: 0, awning: 'amber' },
];
for (const st of STALLS) solid(st.x, st.z, 2.6, 1.4, 2.2);
// Crates (low cover: block movement, not sight).
const CRATES = [
  { x: 12, z: -2, s: 1.1 }, { x: -12, z: -2, s: 1.1 }, { x: 6, z: 10, s: 1 },
  { x: -6, z: 10, s: 1 }, { x: 16, z: 2, s: 1.2 }, { x: -16, z: 2, s: 1.2 },
  { x: 2, z: -12, s: 1 }, { x: -2, z: -12, s: 1 }, { x: 10, z: -6, s: 1 },
  { x: -10, z: -6, s: 1 }, { x: 18, z: -11, s: 1 }, { x: -18, z: -11, s: 1 },
  { x: 0, z: -8, s: 1.3 }, { x: 20, z: 12, s: 1 }, { x: -20, z: 12, s: 1 },
];
for (const c of CRATES) solid(c.x, c.z, c.s, c.s, 1.0);
// Central fountain.
solid(0, 0, 3.2, 3.2, 1.0);
// Gate pillars at the lane mouths.
solid(-14, -14, 0.8, 0.8, 3.0); solid(14, -14, 0.8, 0.8, 3.0);

// Lantern posts (visual only, thin enough to walk past).
export const LANTERNS = [
  { x: -10, z: 0 }, { x: 10, z: 0 }, { x: 0, z: -8 }, { x: 0, z: 8 },
  { x: -18, z: -8 }, { x: 18, z: -8 }, { x: -18, z: 12 }, { x: 18, z: 12 },
  { x: 14, z: -9 }, { x: -14, z: -9 }, { x: 0, z: -15 }, { x: 0, z: 15 },
];
// Water: the canal along the west edge and the river under the fish pier.
export const WATER = [
  { x0: -23, x1: -20.5, z0: -19, z1: 19 },
  { x0: -19, x1: -9, z0: -13.5, z1: -12.5 },
];

// Waypoint graph the bots route on. Nodes are open ground; edges are walks.
export const WAYPOINTS = [
  { id: 0, x: 0, z: 15 }, { id: 1, x: 0, z: 10 }, { id: 2, x: -6, z: 12 },
  { id: 3, x: 6, z: 12 }, { id: 4, x: -18, z: 12 }, { id: 5, x: 18, z: 12 },
  { id: 6, x: -18, z: 4 }, { id: 7, x: 18, z: 4 }, { id: 8, x: -10, z: 4 },
  { id: 9, x: 10, z: 4 }, { id: 10, x: 0, z: 4 }, { id: 11, x: 0, z: 0 },
  { id: 12, x: -8, z: 0 }, { id: 13, x: 8, z: 0 }, { id: 14, x: -18, z: -4 },
  { id: 15, x: 18, z: -4 }, { id: 16, x: -10, z: -6 }, { id: 17, x: 10, z: -6 },
  { id: 18, x: -14, z: -9 }, { id: 19, x: 14, z: -9 }, { id: 20, x: -8, z: -12 },
  { id: 21, x: 8, z: -12 }, { id: 22, x: 0, z: -12 }, { id: 23, x: 0, z: -15 },
  { id: 24, x: -6, z: -15 }, { id: 25, x: 6, z: -15 }, { id: 26, x: -12, z: -12 },
  { id: 27, x: 12, z: -12 }, { id: 28, x: -18, z: -12 }, { id: 29, x: 18, z: -12 },
];
export const EDGES = [
  [0, 1], [0, 2], [0, 3], [1, 10], [2, 4], [3, 5], [4, 6], [5, 7],
  [6, 12], [7, 13], [8, 12], [9, 13], [8, 10], [9, 10], [10, 11],
  [11, 12], [11, 13], [12, 14], [13, 15], [14, 16], [15, 17],
  [16, 18], [17, 19], [16, 20], [17, 21], [18, 20], [19, 21],
  [20, 22], [21, 22], [22, 23], [23, 24], [23, 25], [20, 26],
  [21, 27], [26, 28], [27, 29], [14, 28], [15, 29], [2, 8], [3, 9],
  [4, 2], [5, 3], [6, 8], [7, 9], [1, 2], [1, 3], [12, 16], [13, 17],
];
export const ADJ = WAYPOINTS.map(() => []);
for (const [a, b] of EDGES) { ADJ[a].push(b); ADJ[b].push(a); }

export function nearestWaypoint(x, z) {
  let best = 0; let bd = Infinity;
  for (const w of WAYPOINTS) {
    const d = (w.x - x) * (w.x - x) + (w.z - z) * (w.z - z);
    if (d < bd) { bd = d; best = w.id; }
  }
  return best;
}

// Breadth-first route between waypoints; returns a list of node ids.
export function findPath(fromId, toId) {
  if (fromId === toId) return [toId];
  const prev = new Array(WAYPOINTS.length).fill(-1);
  const q = [fromId]; prev[fromId] = fromId;
  while (q.length) {
    const n = q.shift();
    for (const m of ADJ[n]) {
      if (prev[m] === -1) { prev[m] = n; if (m === toId) { const p = [m]; let c = m; while (c !== fromId) { c = prev[c]; p.unshift(c); } return p; } q.push(m); }
    }
  }
  return [toId];
}

export function inSite(x, z, site) {
  return x >= site.x0 && x <= site.x1 && z >= site.z0 && z <= site.z1;
}

export function zoneAt(x, z) {
  if (inSite(x, z, SITES.A)) return 'SPICE ROW';
  if (inSite(x, z, SITES.B)) return 'FISH PIER';
  if (Math.abs(x) < 6 && Math.abs(z) < 6) return 'LANTERN SQUARE';
  if (x < -14) return 'WEST LANE';
  if (x > 14) return 'EAST LANE';
  if (z > 12) return 'OTTER DOCKS';
  if (z < -12) return 'HERON GATE';
  return 'MARKET ROW';
}

// Segment (x0,y0,z0)->(x1,y1,z1) vs solids. Returns the smallest t in [0,1]
// where the segment enters a solid tall enough to matter, or Infinity.
export function raySolids(x0, y0, z0, dx, dy, dz) {
  let best = Infinity;
  for (const s of SOLIDS) {
    if (s.h < y0 && s.h < y0 + dy) continue; // segment flies above this solid
    // Slab test in 3D; solids are axis-aligned boxes from y=0 to y=h.
    let tmin = 0; let tmax = 1; let ok = true;
    const axes = [[x0, dx, s.x0, s.x1], [y0, dy, 0, s.h], [z0, dz, s.z0, s.z1]];
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
    if (ok && tmin < best && tmin >= 0) best = tmin;
  }
  return best;
}

// True when a straight line between two eye points is unobstructed.
export function hasLineOfSight(x0, y0, z0, x1, y1, z1) {
  const dx = x1 - x0; const dy = y1 - y0; const dz = z1 - z0;
  return raySolids(x0, y0, z0, dx, dy, dz) >= 1;
}

// Circle (radius r) vs solids: push the circle out of any solid it overlaps.
export function collideCircle(p, r) {
  for (const s of SOLIDS) {
    if (s.h < 0.9) continue;
    const cx = Math.max(s.x0, Math.min(p.x, s.x1));
    const cz = Math.max(s.z0, Math.min(p.z, s.z1));
    const ddx = p.x - cx; const ddz = p.z - cz;
    const d2 = ddx * ddx + ddz * ddz;
    if (d2 < r * r) {
      if (d2 < 1e-9) { p.x += r; continue; }
      const d = Math.sqrt(d2);
      p.x = cx + (ddx / d) * r;
      p.z = cz + (ddz / d) * r;
    }
  }
  p.x = Math.max(BOUNDS.x0 + 0.4, Math.min(BOUNDS.x1 - 0.4, p.x));
  p.z = Math.max(BOUNDS.z0 + 0.4, Math.min(BOUNDS.z1 - 0.4, p.z));
}

export { STALLS, CRATES };

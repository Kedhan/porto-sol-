// Cinder Bay city: roads, blocks, buildings, beach, park and landmarks.
// Builds a fixed 3600 x 2600 open world with a road grid, a harbour beach
// along the south edge, a central park and named districts.
import { mulberry32, pick } from './util.js';

export const WORLD_W = 3600;
export const WORLD_H = 2600;
export const ROAD_W = 96;

const DISTRICTS = [
  { name: 'Old Pier', x: 0, y: 1900, w: 900, h: 700, tint: '#c98f4e' },
  { name: 'Downtown', x: 900, y: 300, w: 1100, h: 900, tint: '#7fa8c9' },
  { name: 'Harbour Heights', x: 2000, y: 300, w: 900, h: 900, tint: '#8fc98f' },
  { name: 'Voss Quarter', x: 900, y: 1200, w: 1100, h: 700, tint: '#c9a87f' },
  { name: 'Ashford Row', x: 2000, y: 1200, w: 900, h: 700, tint: '#b08fc9' },
  { name: 'Cinder Beach', x: 0, y: 2300, w: 3600, h: 300, tint: '#e8c87a' },
];

export function buildCity() {
  const rnd = mulberry32(20261121);
  const roadsV = []; for (let x = 240; x < WORLD_W; x += 420) roadsV.push(x);
  const roadsH = []; for (let y = 240; y < 2350; y += 420) roadsH.push(y);
  const buildings = [];
  const palettes = ['#5b7a9e', '#8a6f5c', '#6e8a6a', '#9e7a5b', '#7a6a9e', '#a05c5c', '#4f7a7a', '#b08a3e'];
  // Buildings fill the blocks between roads.
  for (let ix = 0; ix < roadsV.length - 1; ix++) {
    for (let iy = 0; iy < roadsH.length - 1; iy++) {
      const bx = roadsV[ix] + ROAD_W / 2 + 14, by = roadsH[iy] + ROAD_W / 2 + 14;
      const bw = roadsV[ix + 1] - roadsV[ix] - ROAD_W - 28, bh = roadsH[iy + 1] - roadsH[iy] - ROAD_W - 28;
      if (bw < 60 || bh < 60) continue;
      // Central park block stays green.
      if (ix === 3 && iy === 2) continue;
      const n = 1 + Math.floor(rnd() * 2);
      for (let k = 0; k < n; k++) {
        const w = bw / n - 12, h = bh - 20;
        const x = bx + k * (bw / n) + 6, y = by + 10;
        buildings.push({ x, y, w, h, color: pick(palettes, rnd), roof: pick(['#3a4a5a', '#5a3a3a', '#2f4a3a'], rnd), height: 20 + rnd() * 46 });
      }
    }
  }
  const landmarks = [
    { name: 'MARA\'S GARAGE', x: 560, y: 560, w: 150, h: 110, color: '#ff9d45' },
    { name: 'CINDER CLINIC', x: 2980, y: 560, w: 150, h: 110, color: '#e8e8e8' },
    { name: 'HARBOUR BANK', x: 1560, y: 1400, w: 170, h: 120, color: '#ffd166' },
    { name: 'ASHFORD TOWER', x: 2560, y: 1400, w: 170, h: 130, color: '#3a3a5a' },
    { name: 'OLD PIER', x: 300, y: 2140, w: 220, h: 90, color: '#c98f4e' },
  ];
  return { roadsV, roadsH, buildings, landmarks, districts: DISTRICTS, park: { x: 1500, y: 1080, w: 300, h: 300 } };
}

export function isOnRoad(city, x, y) {
  if (y > 2320) return false;
  for (const rx of city.roadsV) if (Math.abs(x - rx) < ROAD_W / 2) return true;
  for (const ry of city.roadsH) if (Math.abs(y - ry) < ROAD_W / 2) return true;
  return false;
}
export function buildingAt(city, x, y) {
  for (const b of city.buildings) if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return b;
  for (const l of city.landmarks) if (x > l.x && x < l.x + l.w && y > l.y && y < l.y + l.h) return l;
  return null;
}
// Push a circle out of solid buildings; returns true when a hit happened.
export function resolveBuildingCollision(city, e, r) {
  let hit = false;
  const solids = [...city.buildings, ...city.landmarks];
  for (const b of solids) {
    const cx = Math.max(b.x, Math.min(e.x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(e.y, b.y + b.h));
    const dx = e.x - cx, dy = e.y - cy, d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      hit = true;
      if (d2 < 0.01) { e.y = b.y - r; continue; }
      const d = Math.sqrt(d2); e.x = cx + (dx / d) * r; e.y = cy + (dy / d) * r;
    }
  }
  e.x = Math.max(20, Math.min(WORLD_W - 20, e.x));
  e.y = Math.max(20, Math.min(WORLD_H - 20, e.y));
  return hit;
}

export function drawCity(ctx, city, cam, timeMin) {
  const { x: cx, y: cy, w: vw, h: vh } = cam;
  const night = timeMin > 1140 || timeMin < 360;
  // Ground
  ctx.fillStyle = night ? '#1c2b1a' : '#4a7a3d'; ctx.fillRect(cx - 20, cy - 20, vw + 40, vh + 40);
  // Beach + sea
  ctx.fillStyle = '#e8c87a'; ctx.fillRect(cx - 20, 2320, vw + 40, 280);
  ctx.fillStyle = '#2a7ab8'; ctx.fillRect(cx - 20, 2480, vw + 40, 140);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(cx - 20, 2472, vw + 40, 8);
  // Park
  ctx.fillStyle = '#2f6b2f'; ctx.fillRect(city.park.x, city.park.y, city.park.w, city.park.h);
  ctx.fillStyle = '#3f8a4f';
  for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.arc(city.park.x + 30 + (i % 4) * 80, city.park.y + 40 + Math.floor(i / 4) * 200, 26, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif'; ctx.fillText('CINDER PARK', city.park.x + 90, city.park.y + 155);
  // Roads
  ctx.fillStyle = night ? '#2a2a30' : '#3a3a42';
  for (const rx of city.roadsV) ctx.fillRect(rx - ROAD_W / 2, 0, ROAD_W, 2350);
  for (const ry of city.roadsH) ctx.fillRect(0, ry - ROAD_W / 2, WORLD_W, ROAD_W);
  // Road markings
  ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 3; ctx.setLineDash([22, 26]);
  ctx.beginPath();
  for (const rx of city.roadsV) { ctx.moveTo(rx, 0); ctx.lineTo(rx, 2350); }
  for (const ry of city.roadsH) { ctx.moveTo(0, ry); ctx.lineTo(WORLD_W, ry); }
  ctx.stroke(); ctx.setLineDash([]);
  // Buildings
  for (const b of city.buildings) {
    if (b.x > cx + vw || b.x + b.w < cx || b.y > cy + vh || b.y + b.h < cy) continue;
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
    ctx.fillStyle = b.color; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof; ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
    ctx.fillStyle = night ? '#ffd166' : '#dfeaff';
    const cols = Math.max(2, Math.floor(b.w / 34)), rows = Math.max(2, Math.floor(b.h / 34));
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      if ((i * 7 + j * 3) % 3 === 0) ctx.fillRect(b.x + 10 + i * 30, b.y + 10 + j * 30, 12, 14);
    }
  }
  // Landmarks
  for (const l of city.landmarks) {
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(l.x + 5, l.y + 6, l.w, l.h);
    ctx.fillStyle = l.color; ctx.fillRect(l.x, l.y, l.w, l.h);
    ctx.fillStyle = '#111'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(l.name, l.x + l.w / 2, l.y + l.h / 2 + 4); ctx.textAlign = 'left';
  }
  // District labels
  ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = 'bold 22px sans-serif';
  for (const d of city.districts) { if (d.name !== 'Cinder Beach') ctx.fillText(d.name.toUpperCase(), d.x + 24, d.y + 40); }
}

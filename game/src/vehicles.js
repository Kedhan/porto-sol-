// Cinder Bay vehicles: player driving physics, traffic AI and parked cars.
import { clamp, angleDiff, pick, mulberry32 } from './util.js';
import { isOnRoad, resolveBuildingCollision } from './city.js';

const COLORS = ['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#ecf0f1', '#2ecc71', '#ff6b9d'];
const MODELS = [
  { name: 'Sunset Coupe', max: 420, accel: 260 },
  { name: 'Harbour Sedan', max: 360, accel: 220 },
  { name: 'Pier Pickup', max: 340, accel: 210 },
  { name: 'Voss Cruiser', max: 460, accel: 280 },
  { name: 'Beach Van', max: 300, accel: 180 },
];

export function makeCar(x, y, angle, opts) {
  const rnd = mulberry32((x | 0) * 31 + (y | 0));
  const model = (opts && opts.model) || pick(MODELS, rnd);
  return {
    x, y, angle, speed: 0, color: (opts && opts.color) || pick(COLORS, rnd),
    model, traffic: !!(opts && opts.traffic), police: !!(opts && opts.police),
    parked: !!(opts && opts.parked), route: (opts && opts.route) || 0,
    targetAngle: angle, w: 46, h: 22, dead: false,
  };
}
export function spawnParkedCars(city, count) {
  const rnd = mulberry32(777);
  const cars = [];
  for (let i = 0; i < count; i++) {
    const road = city.roadsV[Math.floor(rnd() * city.roadsV.length)];
    const y = 300 + rnd() * 1900;
    // Parked at the curb (just off the road centre, clear of buildings)
    // and facing along the road, so a stolen car can actually drive away.
    const x = road + (rnd() > 0.5 ? 30 : -30);
    cars.push(makeCar(x, y, rnd() > 0.5 ? Math.PI / 2 : -Math.PI / 2, { parked: true }));
  }
  return cars;
}
export function spawnTraffic(city, count) {
  const rnd = mulberry32(4242);
  const cars = [];
  for (let i = 0; i < count; i++) {
    const vertical = rnd() > 0.5;
    const x = vertical ? city.roadsV[Math.floor(rnd() * city.roadsV.length)] : 300 + rnd() * 3000;
    const y = vertical ? 300 + rnd() * 1900 : city.roadsH[Math.floor(rnd() * city.roadsH.length)];
    const c = makeCar(x, y, vertical ? (rnd() > 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rnd() > 0.5 ? 0 : Math.PI), { traffic: true });
    c.speed = 90 + rnd() * 70; cars.push(c);
  }
  return cars;
}
// Arcade player driving: W/S accelerate & brake, A/D steer by speed.
export function updatePlayerCar(car, input, dt, city) {
  const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  const accel = (input.up ? 1 : 0) - (input.down ? 0.7 : 0);
  car.speed += accel * car.model.accel * dt * (input.boost ? 1.35 : 1);
  car.speed -= car.speed * 0.55 * dt;
  if (!input.up && !input.down) car.speed -= Math.sign(car.speed) * 60 * dt;
  car.speed = clamp(car.speed, -140, car.model.max);
  car.angle += steer * clamp(Math.abs(car.speed) / 120, 0, 1) * 2.4 * dt * (car.speed < 0 ? -1 : 1);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  if (resolveBuildingCollision(city, car, 24)) car.speed *= 0.55;
  return car;
}
export function updateTrafficCar(car, dt, city, others) {
  // Follow the road grid: keep to a road, turn at intersections.
  const onV = city.roadsV.reduce((best, rx) => Math.abs(car.x - rx) < Math.abs(car.x - best) ? rx : best, city.roadsV[0]);
  const onH = city.roadsH.reduce((best, ry) => Math.abs(car.y - ry) < Math.abs(car.y - best) ? ry : best, city.roadsH[0]);
  const nearV = Math.abs(car.x - onV) < 12, nearH = Math.abs(car.y - onH) < 12;
  let desired = car.angle;
  if (nearV && nearH && Math.random() < 0.01) {
    desired = pick([0, Math.PI / 2, Math.PI, -Math.PI / 2], Math.random);
  } else if (nearV && Math.abs(Math.sin(car.angle)) > 0.7) {
    desired = car.angle > 0 ? Math.PI / 2 : -Math.PI / 2; car.x += (onV - car.x) * 0.05;
  } else if (nearH && Math.abs(Math.cos(car.angle)) > 0.7) {
    desired = Math.cos(car.angle) > 0 ? 0 : Math.PI; car.y += (onH - car.y) * 0.05;
  }
  car.angle += angleDiff(car.angle, desired) * 2 * dt;
  // Slow for the car ahead.
  let slow = false;
  for (const o of others) { if (o !== car && !o.dead) { const dx = o.x - car.x, dy = o.y - car.y; const d = Math.hypot(dx, dy); if (d < 70 && Math.cos(car.angle) * dx + Math.sin(car.angle) * dy > 0) slow = true; } }
  const target = slow ? 0 : 130;
  car.speed += (target - car.speed) * dt;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  if (!isOnRoad(city, car.x, car.y)) { car.x -= Math.cos(car.angle) * car.speed * dt; car.y -= Math.sin(car.angle) * car.speed * dt; car.angle += Math.PI / 2 * dt * 4; }
  resolveBuildingCollision(city, car, 24);
}
export function drawCar(ctx, car, cam) {
  ctx.save(); ctx.translate(car.x - cam.x, car.y - cam.y); ctx.rotate(car.angle);
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(-24, -10, 48, 24);
  ctx.fillStyle = car.police ? '#1a1a2e' : car.color;
  ctx.beginPath(); ctx.roundRect(-24, -11, 48, 22, 6); ctx.fill();
  ctx.fillStyle = car.police ? '#ffffff' : 'rgba(0,0,0,.35)';
  ctx.fillRect(-6, -11, 12, 22);
  ctx.fillStyle = '#bfe8ff'; ctx.fillRect(6, -8, 10, 16);
  ctx.fillStyle = '#222'; ctx.fillRect(-18, -13, 8, 4); ctx.fillRect(-18, 9, 8, 4); ctx.fillRect(12, -13, 8, 4); ctx.fillRect(12, 9, 8, 4);
  if (car.police) { ctx.fillStyle = '#ff2222'; ctx.fillRect(-14, -11, 6, 5); ctx.fillStyle = '#2266ff'; ctx.fillRect(-14, 6, 6, 5); ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('PD', 0, 3); ctx.textAlign = 'left'; }
  ctx.fillStyle = '#ffe9a8'; ctx.fillRect(22, -7, 3, 5); ctx.fillRect(22, 2, 3, 5);
  ctx.restore();
}

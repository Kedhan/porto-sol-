// Cinder Bay PD: wanted stars, pursuit cars, heat decay and busted/wasted.
import { clamp, angleDiff } from './util.js';
import { makeCar } from './vehicles.js';

export class PoliceManager {
  constructor() { this.wanted = 0; this.heat = 0; this.cars = []; this.spawnTimer = 0; this.calmTimer = 0; }
  addHeat(n, reason) { this.heat = clamp(this.heat + n, 0, 100); this.updateWanted(); return reason; }
  updateWanted() {
    const w = this.heat < 8 ? 0 : this.heat < 22 ? 1 : this.heat < 40 ? 2 : this.heat < 60 ? 3 : this.heat < 82 ? 4 : 5;
    if (w !== this.wanted) this.wanted = w;
  }
  wantedStars() { return '★'.repeat(this.wanted) + '☆'.repeat(5 - this.wanted); }
  update(dt, player, city, audio) {
    // Heat cools when the player stays clean and out of sight.
    this.calmTimer += dt;
    if (this.calmTimer > 1) { this.calmTimer = 0; if (this.wanted > 0) { this.heat = Math.max(0, this.heat - 0.7); this.updateWanted(); } }
    const want = this.wanted === 0 ? 0 : this.wanted + 1;
    // Spawn pursuit cars up to the wanted cap.
    this.spawnTimer -= dt;
    if (this.cars.length < want && this.spawnTimer <= 0) {
      this.spawnTimer = 1.2;
      const a = Math.random() * Math.PI * 2;
      const c = makeCar(player.x + Math.cos(a) * 620, player.y + Math.sin(a) * 620, a, { police: true });
      c.speed = 200; this.cars.push(c);
    }
    // Pursuit: steer toward the player, ram, and slow them down.
    for (const car of this.cars) {
      const target = Math.atan2(player.y - car.y, player.x - car.x);
      car.angle += angleDiff(car.angle, target) * 2.2 * dt;
      const cruise = 240 + this.wanted * 45;
      car.speed += (cruise - car.speed) * 0.5 * dt;
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      const d = Math.hypot(player.x - car.x, player.y - car.y);
      if (d < 46) {
        if (player.car) { player.car.speed *= 0.55; if (audio) audio.crash(); }
        else { player.health -= 18 * dt * 4; }
        car.speed *= 0.5;
      }
      // Give up far away.
      if (d > 1600) car.dead = true;
    }
    this.cars = this.cars.filter((c) => !c.dead);
    if (audio) audio.siren(this.wanted > 0);
  }
  clear() { this.cars = []; this.wanted = 0; this.heat = 0; if (typeof window !== 'undefined' && window.__cinderAudio) window.__cinderAudio.siren(false); }
}
export function bustedCheck(player, police) {
  // Busted when surrounded on foot at high wanted, or wasted at 0 health.
  if (player.health <= 0) return 'wasted';
  if (!player.car && police.wanted >= 3) {
    let near = 0;
    for (const c of police.cars) if (Math.hypot(player.x - c.x, player.y - c.y) < 90) near++;
    if (near >= 2 && player.speed < 40) return 'busted';
  }
  return null;
}

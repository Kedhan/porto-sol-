// Dante Cole on foot: movement, sprint, shooting and drawing.
import { clamp } from './util.js';
import { resolveBuildingCollision } from './city.js';

export function createPlayer(x, y) {
  return {
    x, y, angle: 0, health: 100, cash: 0, speed: 0,
    car: null, ammo: 12, reloadTimer: 0, shootCooldown: 0,
    walkPhase: 0, name: 'Dante Cole',
  };
}
export function updatePlayerOnFoot(p, input, dt, city) {
  const sprint = input.boost ? 1.55 : 1;
  const spd = 230 * sprint;
  let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const len = Math.hypot(dx, dy);
  if (len > 0) { dx /= len; dy /= len; p.walkPhase += dt * 11; }
  p.x += dx * spd * dt; p.y += dy * spd * dt;
  p.speed = len > 0 ? spd : 0;
  p.angle = Math.atan2(input.mouseY - (p.y), input.mouseX - (p.x));
  if (resolveBuildingCollision(city, p, 16)) { /* bumped a wall */ }
  p.shootCooldown = Math.max(0, p.shootCooldown - dt);
  p.reloadTimer = Math.max(0, p.reloadTimer - dt);
  if (p.reloadTimer === 0 && p.ammo === 0) { p.ammo = 12; }
  return p;
}
export function drawPlayer(ctx, p, cam) {
  const x = p.x - cam.x, y = p.y - cam.y;
  ctx.save(); ctx.translate(x, y);
  // Shadow + body
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(0, 10, 13, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(p.angle);
  const bob = Math.sin(p.walkPhase) * 1.5;
  ctx.fillStyle = '#2b2b3a'; ctx.fillRect(-8, -9 + bob * 0.2, 16, 18); // jacket
  ctx.fillStyle = '#e8b98a'; ctx.beginPath(); ctx.arc(8, 0, 7, 0, Math.PI * 2); ctx.fill(); // head
  ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(9, -3, 6, Math.PI, Math.PI * 2); ctx.fill(); // hair
  ctx.fillStyle = '#333'; ctx.fillRect(10, -3, 14, 5); // pistol
  ctx.fillStyle = '#ffd166'; ctx.fillRect(10, -3, 3, 5);
  ctx.restore();
  // Aim line (short, subtle)
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(p.angle) * 42, y + Math.sin(p.angle) * 42); ctx.stroke();
}
export function drawEnemy(ctx, e, cam) {
  const x = e.x - cam.x, y = e.y - cam.y;
  ctx.save(); ctx.translate(x, y); ctx.rotate(e.angle);
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(0, 10, 13, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#7a1f1f'; ctx.fillRect(-8, -9, 16, 18);
  ctx.fillStyle = '#d8a070'; ctx.beginPath(); ctx.arc(8, 0, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111'; ctx.fillRect(10, -3, 13, 5);
  ctx.restore();
  // Health bar
  ctx.fillStyle = '#000'; ctx.fillRect(x - 14, y - 24, 28, 5);
  ctx.fillStyle = '#ff4444'; ctx.fillRect(x - 14, y - 24, 28 * Math.max(0, e.health / 60), 5);
}

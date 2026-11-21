// Cinder Bay HUD: DOM readouts and the live minimap canvas.
import { fmtCash, fmtClock, clamp } from './util.js';
import { WORLD_W, WORLD_H } from './city.js';

export function updateHud(state) {
  const $ = (id) => document.getElementById(id);
  $('hudCash').textContent = fmtCash(state.player.cash);
  $('hudHealth').textContent = state.player.name.toUpperCase() + (state.player.car ? ' · ' + state.player.car.model.name.toUpperCase() : '');
  $('healthFill').style.width = clamp(state.player.health, 0, 100) + '%';
  $('healthFill').style.background = state.player.health > 50 ? 'linear-gradient(90deg,#37e05a,#a8ff6a)' : state.player.health > 25 ? 'linear-gradient(90deg,#ffb347,#ffd166)' : 'linear-gradient(90deg,#ff5252,#ff8a80)';
  $('hudAmmo').textContent = state.player.car ? 'IN CAR · E TO EXIT' : `PISTOL ${state.player.reloadTimer > 0 ? 'RELOADING…' : state.player.ammo + ' / 12'} · R RELOAD`;
  $('hudStars').textContent = state.police.wantedStars();
  $('hudStars').style.color = state.police.wanted > 0 ? '#ffd166' : '#fff';
  $('hudClock').textContent = fmtClock(state.timeMin) + ' · DAY ' + state.day;
  const m = state.missionState ? state.missionState.mission : null;
  $('hudMissionTitle').textContent = m ? `JOB ${m.id} · ${m.title}` : 'CINDER BAY — FREE ROAM';
  $('hudMissionText').textContent = m ? m.objective + (state.missionHint ? ' — ' + state.missionHint : '') : 'All jobs done! Free roam, steal cars, explore Cinder Bay.';
  const speed = state.player.car ? Math.abs(Math.round(state.player.car.speed * 0.35)) : Math.round(state.player.speed * 0.35);
  $('hudSpeedNum').textContent = speed;
  $('hudSpeedLabel').textContent = state.player.car ? state.player.car.model.name.toUpperCase() + ' · km/h' : 'ON FOOT · km/h';
}
let toastTimer = null;
export function showToast(text, ms) {
  const el = document.getElementById('toast');
  el.textContent = text; el.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.opacity = '0'; }, ms || 2600);
}
export function drawMinimap(state) {
  const c = document.getElementById('minimap');
  const ctx = c.getContext('2d');
  const sx = c.width / WORLD_W, sy = c.height / WORLD_H;
  ctx.fillStyle = '#12351f'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#e8c87a'; ctx.fillRect(0, 132, c.width, 18);
  ctx.fillStyle = '#2a7ab8'; ctx.fillRect(0, 142, c.width, 8);
  ctx.strokeStyle = '#5a5a66'; ctx.lineWidth = 3;
  for (const rx of state.city.roadsV) { ctx.beginPath(); ctx.moveTo(rx * sx, 0); ctx.lineTo(rx * sx, 135); ctx.stroke(); }
  for (const ry of state.city.roadsH) { ctx.beginPath(); ctx.moveTo(0, ry * sy); ctx.lineTo(c.width, ry * sy); ctx.stroke(); }
  ctx.fillStyle = '#2f6b2f'; ctx.fillRect(state.city.park.x * sx, state.city.park.y * sy, state.city.park.w * sx, state.city.park.h * sy);
  const dot = (x, y, color, r) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x * sx, y * sy, r, 0, Math.PI * 2); ctx.fill(); };
  if (state.missionState && state.missionState.mission) {
    const t = state.missionState.mission.target;
    const pulse = 5 + Math.sin(performance.now() / 200) * 2;
    dot(t.x, t.y, '#ffd166', pulse);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(t.x * sx, t.y * sy, pulse + 3, 0, Math.PI * 2); ctx.stroke();
  }
  for (const car of state.traffic) dot(car.x, car.y, '#9db8d8', 2);
  for (const car of state.police.cars) dot(car.x, car.y, '#3a7bff', 3.5);
  for (const e of state.enemies) dot(e.x, e.y, '#ff4444', 3);
  for (const p of state.pedestrians) dot(p.x, p.y, '#cfe8c0', 1.5);
  const px = state.player.x * sx, py = state.player.y * sy;
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff5e62'; ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
  // Viewport box
  ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1;
  ctx.strokeRect(state.cam.x * sx, state.cam.y * sy, state.cam.w * sx, state.cam.h * sy);
}

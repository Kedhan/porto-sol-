// Cinder Bay — boot, game loop, input, combat, pedestrians and mission flow.
import { clamp, mulberry32, pick, angleTo, dist2 } from './util.js';
import { buildCity, drawCity, resolveBuildingCollision, WORLD_W, WORLD_H } from './city.js';
import { AudioEngine } from './audio.js';
import { createPlayer, updatePlayerOnFoot, drawPlayer, drawEnemy } from './player.js';
import { makeCar, spawnParkedCars, spawnTraffic, updatePlayerCar, updateTrafficCar, drawCar } from './vehicles.js';
import { PoliceManager, bustedCheck } from './police.js';
import { MISSIONS, missionByIndex, missionListText, createMissionState, missionProgressText } from './missions.js';
import { updateHud, drawMinimap, showToast } from './hud.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const audio = new AudioEngine();
window.__cinderAudio = audio;

const SAVE_KEY = 'cinder-bay-save-v1';
const city = buildCity();
const state = {
  mode: 'menu', // menu | playing | paused | over
  player: createPlayer(635, 700),
  city, police: new PoliceManager(),
  parked: spawnParkedCars(city, 16),
  traffic: spawnTraffic(city, 14),
  pedestrians: [], enemies: [], bullets: [], enemyBullets: [], particles: [],
  missionIndex: 0, missionState: null, missionHint: '',
  timeMin: 624, day: 1, cash: 0,
  cam: { x: 0, y: 0, w: 1280, h: 720 },
  input: { up: false, down: false, left: false, right: false, boost: false, mouseX: 0, mouseY: 0, mouseDown: false },
  overKind: null, overTimer: 0,
};
const input = state.input;
window.__cinderState = state; // exposed for play-testing / screenshots

function resize() {
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  state.cam.w = canvas.width; state.cam.h = canvas.height;
}
window.addEventListener('resize', resize); resize();

function spawnPedestrians() {
  const rnd = mulberry32(99);
  state.pedestrians = [];
  for (let i = 0; i < 26; i++) {
    const road = city.roadsV[Math.floor(rnd() * city.roadsV.length)];
    state.pedestrians.push({
      x: road + (rnd() > 0.5 ? 58 : -58), y: 300 + rnd() * 1900,
      angle: rnd() * Math.PI * 2, speed: 35 + rnd() * 30,
      color: pick(['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#1abc9c', '#ecf0f1'], rnd),
      flee: 0,
    });
  }
}
function spawnEnemies(n, cx, cy) {
  const rnd = mulberry32(Date.now() % 100000);
  for (let i = 0; i < n; i++) {
    state.enemies.push({
      x: cx + (rnd() - 0.5) * 320, y: cy + (rnd() - 0.5) * 320,
      angle: 0, health: 60, shootTimer: 1 + rnd() * 2, speed: 120,
    });
  }
}
function startMission(i) {
  const m = missionByIndex(i);
  if (!m) { state.missionState = null; state.missionHint = ''; showToast('ALL JOBS DONE — Cinder Bay is yours, Dante!'); return; }
  state.missionState = createMissionState(m);
  state.missionHint = missionProgressText(state.missionState);
  if (m.kind === 'defeat') spawnEnemies(m.count, m.target.x, m.target.y);
  if (m.kind === 'finale') spawnEnemies(0, m.target.x, m.target.y);
  showToast(`JOB ${m.id}: ${m.title} — ${m.brief}`);
  document.getElementById('menuMissions').innerHTML = missionListText(i);
}
function completeMission() {
  const ms = state.missionState; if (!ms) return;
  state.player.cash += ms.mission.reward;
  audio.cash();
  showToast(`JOB COMPLETE: ${ms.mission.title} — +$${ms.mission.reward.toLocaleString()}`, 3400);
  state.missionIndex++;
  state.missionState = null; state.enemies = [];
  saveGame();
  setTimeout(() => startMission(state.missionIndex), 1200);
}
function saveGame() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ cash: state.player.cash, missionIndex: state.missionIndex, day: state.day })); } catch { /* storage unavailable */ }
}
function loadSave() {
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return s && typeof s.cash === 'number' ? s : null; } catch { return null; }
}
function newGame(fromSave) {
  const s = fromSave ? loadSave() : null;
  state.player = createPlayer(635, 700);
  state.player.cash = s ? s.cash : 0;
  state.missionIndex = s ? s.missionIndex : 0;
  state.day = s ? (s.day || 1) : 1;
  state.police.clear(); state.enemies = []; state.bullets = []; state.enemyBullets = []; state.particles = [];
  state.parked = spawnParkedCars(city, 16); state.traffic = spawnTraffic(city, 14);
  spawnPedestrians();
  state.timeMin = 624; state.mode = 'playing';
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('pauseMenu').classList.add('hidden');
  document.getElementById('wasted').style.display = 'none';
  audio.ensure();
  startMission(state.missionIndex);
}
function respawn() {
  state.player.health = 100; state.player.x = 3055; state.player.y = 680; state.player.car = null;
  state.player.cash = Math.max(0, state.player.cash - 200);
  state.police.clear(); state.enemies = [];
  document.getElementById('wasted').style.display = 'none';
  state.mode = 'playing'; state.overKind = null;
  showToast('Clinic patched you up. -$200 bail. Mara is waiting.');
}

// --- Input ---
const KEYMAP = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', ShiftLeft: 'boost', ShiftRight: 'boost' };
window.addEventListener('keydown', (e) => {
  audio.ensure();
  if (e.code in KEYMAP) { input[KEYMAP[e.code]] = true; e.preventDefault(); }
  if (e.code === 'KeyM') audio.setMuted(!audio.muted);
  if (e.code === 'KeyR' && state.mode === 'playing' && !state.player.car) { state.player.ammo = 0; state.player.reloadTimer = 0.6; audio.blip(300, 0.1, 'square', 0.08); }
  if (e.code === 'KeyE' && state.mode === 'playing') tryEnterExitCar();
  if ((e.code === 'KeyP' || e.code === 'Escape') && (state.mode === 'playing' || state.mode === 'paused')) togglePause();
  if (e.code === 'Enter' && state.mode === 'over') respawn();
});
window.addEventListener('keyup', (e) => { if (e.code in KEYMAP) input[KEYMAP[e.code]] = false; });
canvas.addEventListener('mousemove', (e) => { input.mouseX = e.clientX + state.cam.x; input.mouseY = e.clientY + state.cam.y; });
canvas.addEventListener('mousedown', (e) => { audio.ensure(); if (e.button === 0) input.mouseDown = true; });
window.addEventListener('mouseup', () => { input.mouseDown = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function togglePause() {
  if (state.mode === 'playing') {
    state.mode = 'paused';
    document.getElementById('pauseStats').textContent = `Cash $${state.player.cash.toLocaleString()} · Missions ${state.missionIndex}/5 complete · Wanted ${state.police.wantedStars()}`;
    document.getElementById('pauseMenu').classList.remove('hidden');
  } else if (state.mode === 'paused') {
    state.mode = 'playing'; document.getElementById('pauseMenu').classList.add('hidden');
  }
}
function tryEnterExitCar() {
  const p = state.player;
  if (p.car) { // exit
    const car = p.car; p.car = null;
    p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 40; p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 40;
    resolveBuildingCollision(city, p, 16);
    return;
  }
  const all = [...state.parked, ...state.traffic, ...state.police.cars];
  let best = null, bestD = 70;
  for (const c of all) { const d = Math.hypot(c.x - p.x, c.y - p.y); if (d < bestD) { best = c; bestD = d; } }
  if (!best) { showToast('No car close enough — walk to a parked car.'); return; }
  if (best.police) { state.police.addHeat(12, 'stole a police car'); showToast('You stole a PD cruiser! Wanted up!'); }
  else if (best.parked) { state.police.addHeat(6, 'car theft'); showToast(`Stole a ${best.model.name} — the owner will notice.`); audio.horn(); }
  else { state.police.addHeat(10, 'carjacking'); showToast(`Carjacked a ${best.model.name}!`); }
  best.parked = false; best.traffic = false;
  state.parked = state.parked.filter((c) => c !== best);
  state.traffic = state.traffic.filter((c) => c !== best);
  p.car = best; p.x = best.x; p.y = best.y;
}
function shoot() {
  const p = state.player;
  if (p.car || p.shootCooldown > 0 || p.reloadTimer > 0) return;
  if (p.ammo <= 0) { p.reloadTimer = 0.6; return; }
  p.ammo--; p.shootCooldown = 0.22; audio.shoot();
  const a = Math.atan2(input.mouseY - p.y, input.mouseX - p.x);
  state.bullets.push({ x: p.x + Math.cos(a) * 22, y: p.y + Math.sin(a) * 22, vx: Math.cos(a) * 900, vy: Math.sin(a) * 900, life: 0.7 });
  // Fleeing pedestrians + heat for shooting in public
  for (const ped of state.pedestrians) if (dist2(ped.x, ped.y, p.x, p.y) < 300 * 300) ped.flee = 3;
}
function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) state.particles.push({ x, y, vx: (Math.random() - 0.5) * 260, vy: (Math.random() - 0.5) * 260, life: 0.5 + Math.random() * 0.4, color });
}

// --- Update ---
function update(dt) {
  const p = state.player;
  state.timeMin += dt * 0.6;
  if (state.timeMin >= 1440) { state.timeMin -= 1440; state.day++; }
  // Player
  if (p.car) {
    updatePlayerCar(p.car, input, dt, city);
    p.x = p.car.x; p.y = p.car.y; p.angle = p.car.angle; p.speed = Math.abs(p.car.speed);
    audio.setEngine(Math.abs(p.car.speed) / p.car.model.max);
    if (Math.abs(p.car.speed) > 300) state.police.addHeat(0.02, '');
  } else {
    updatePlayerOnFoot(p, input, dt, city);
    audio.setEngine(0);
    if (input.mouseDown) shoot();
  }
  // Traffic + parked
  const allCars = [...state.traffic, ...state.parked, ...state.police.cars];
  for (const c of state.traffic) updateTrafficCar(c, dt, city, allCars);
  state.police.update(dt, p, city, audio);
  // Pedestrians
  for (const ped of state.pedestrians) {
    if (ped.flee > 0) { ped.flee -= dt; const a = Math.atan2(ped.y - p.y, ped.x - p.x); ped.x += Math.cos(a) * 170 * dt; ped.y += Math.sin(a) * 170 * dt; }
    else { ped.x += Math.cos(ped.angle) * ped.speed * dt; ped.y += Math.sin(ped.angle) * ped.speed * dt; if (Math.random() < 0.005) ped.angle += (Math.random() - 0.5) * 2; }
    resolveBuildingCollision(city, ped, 10);
    if (p.car && Math.hypot(ped.x - p.x, ped.y - p.y) < 30 && Math.abs(p.car.speed) > 60) {
      ped.flee = 3; state.police.addHeat(14, 'hit a pedestrian'); burst(ped.x, ped.y, '#ff6666', 8); audio.crash();
    }
  }
  // Enemies
  for (const e of state.enemies) {
    const d = Math.hypot(p.x - e.x, p.y - e.y);
    e.angle = Math.atan2(p.y - e.y, p.x - e.x);
    if (d > 260) { e.x += Math.cos(e.angle) * e.speed * dt; e.y += Math.sin(e.angle) * e.speed * dt; }
    e.shootTimer -= dt;
    if (e.shootTimer <= 0 && d < 520) {
      e.shootTimer = 1.4 + Math.random();
      state.enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(e.angle) * 620, vy: Math.sin(e.angle) * 620, life: 1 });
      audio.enemyShoot();
    }
    resolveBuildingCollision(city, e, 14);
  }
  // Bullets
  for (const b of state.bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    for (const e of state.enemies) {
      if (Math.hypot(e.x - b.x, e.y - b.y) < 18) { e.health -= 34; b.life = 0; burst(b.x, b.y, '#ffcc44', 6); if (e.health <= 0) { burst(e.x, e.y, '#ff4444', 14); state.police.addHeat(4, 'shootout'); } }
    }
    for (const ped of state.pedestrians) if (Math.hypot(ped.x - b.x, ped.y - b.y) < 14) { ped.flee = 4; b.life = 0; }
  }
  state.bullets = state.bullets.filter((b) => b.life > 0);
  state.enemies = state.enemies.filter((e) => e.health > 0);
  for (const b of state.enemyBullets) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (Math.hypot(p.x - b.x, p.y - b.y) < (p.car ? 26 : 16)) { p.health -= 9; b.life = 0; burst(b.x, b.y, '#ff6666', 5); }
  }
  state.enemyBullets = state.enemyBullets.filter((b) => b.life > 0);
  // Particles
  for (const pt of state.particles) { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.life -= dt; }
  state.particles = state.particles.filter((pt) => pt.life > 0);
  // Mission flow
  updateMission(dt);
  // Busted / wasted
  const over = bustedCheck(p, state.police);
  if (over) {
    state.mode = 'over'; state.overKind = over; audio.busted(); audio.siren(false);
    document.getElementById('wastedTitle').textContent = over === 'busted' ? 'BUSTED' : 'WASTED';
    document.getElementById('wastedText').textContent = over === 'busted' ? 'The Cinder Bay PD caught up with you.' : 'Dante Cole is down. The city keeps moving.';
    document.getElementById('wasted').style.display = 'flex';
  }
  // Camera
  state.cam.x = clamp(p.x - state.cam.w / 2, 0, WORLD_W - state.cam.w);
  state.cam.y = clamp(p.y - state.cam.h / 2, 0, WORLD_H - state.cam.h);
}
function updateMission(dt) {
  const ms = state.missionState; if (!ms || ms.done) return;
  const m = ms.mission, p = state.player;
  const target = m.kind === 'collect' && ms.collected ? { x: 600, y: 2400 } : m.kind === 'finale' && ms.collected ? { x: 410, y: 2185 } : m.target;
  const d = Math.hypot(p.x - target.x, p.y - target.y);
  if (m.timeLimit > 0 && m.kind === 'goto') {
    ms.timer -= dt;
    if (ms.timer <= 0) { showToast('Too slow! Mara gives you another shot — timer reset.'); ms.timer = m.timeLimit; }
  }
  if (m.kind === 'deliverCar') {
    if (p.car && d < 130) completeMission();
  } else if (m.kind === 'goto') {
    if (d < 120) completeMission();
  } else if (m.kind === 'defeat') {
    ms.defeated = m.count - state.enemies.length;
    state.missionHint = missionProgressText(ms);
    if (state.enemies.length === 0) completeMission();
  } else if (m.kind === 'collect') {
    if (!ms.collected && d < 110) { ms.collected = true; state.police.addHeat(30, 'bank job'); audio.pickup(); showToast('Case grabbed! Lose the heat — reach the beach safehouse (gold marker).'); }
    else if (ms.collected && d < 120) completeMission();
    state.missionHint = missionProgressText(ms);
  } else if (m.kind === 'finale') {
    if (!ms.collected && d < 110) {
      ms.collected = true; spawnEnemies(m.count, m.target.x, m.target.y);
      state.police.addHeat(25, 'tower heist'); audio.pickup();
      showToast('Crown case taken! Ashford guards incoming — clear them, then deliver to the Old Pier.');
    } else if (ms.collected) {
      ms.defeated = m.count - state.enemies.length;
      state.missionHint = `${ms.defeated}/${m.count} guards down — then deliver to the Old Pier`;
      if (state.enemies.length === 0) {
        const pierD = Math.hypot(p.x - 410, p.y - 2185);
        if (pierD < 130) completeMission();
      }
    }
  }
  if (m.kind !== 'defeat' && m.kind !== 'collect' && m.kind !== 'finale') state.missionHint = missionProgressText(ms);
}

// --- Render ---
function draw() {
  const cam = state.cam;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawCity(ctx, city, cam, state.timeMin);
  // Mission beacon
  if (state.missionState) {
    const m = state.missionState.mission;
    const t = m.kind === 'collect' && state.missionState.collected ? { x: 600, y: 2400 } : m.kind === 'finale' && state.missionState.collected && state.enemies.length === 0 ? { x: 410, y: 2185 } : m.target;
    const pulse = 26 + Math.sin(performance.now() / 220) * 8;
    ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(t.x - cam.x, t.y - cam.y, pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(t.x - cam.x, t.y - cam.y, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('▼', t.x - cam.x, t.y - cam.y - pulse - 6); ctx.textAlign = 'left';
  }
  for (const c of state.parked) drawCar(ctx, c, cam);
  for (const c of state.traffic) drawCar(ctx, c, cam);
  for (const c of state.police.cars) drawCar(ctx, c, cam);
  for (const ped of state.pedestrians) {
    ctx.fillStyle = ped.color; ctx.beginPath(); ctx.arc(ped.x - cam.x, ped.y - cam.y, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(ped.x - cam.x, ped.y - cam.y - 2, 4, 0, Math.PI * 2); ctx.fill();
  }
  for (const e of state.enemies) drawEnemy(ctx, e, cam);
  const p = state.player;
  if (p.car) drawCar(ctx, p.car, cam); else drawPlayer(ctx, p, cam);
  // Bullets + particles
  ctx.fillStyle = '#ffe066';
  for (const b of state.bullets) { ctx.beginPath(); ctx.arc(b.x - cam.x, b.y - cam.y, 3.5, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#ff8866';
  for (const b of state.enemyBullets) { ctx.beginPath(); ctx.arc(b.x - cam.x, b.y - cam.y, 3.5, 0, Math.PI * 2); ctx.fill(); }
  for (const pt of state.particles) { ctx.globalAlpha = Math.max(0, pt.life * 2); ctx.fillStyle = pt.color; ctx.fillRect(pt.x - cam.x - 2, pt.y - cam.y - 2, 4, 4); }
  ctx.globalAlpha = 1;
  // District label near player
  ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = 'bold 15px sans-serif';
  ctx.fillText(currentDistrict(), 16, canvas.height - 16);
  // Vignette
  const g = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, canvas.height * 0.45, canvas.width / 2, canvas.height / 2, canvas.height * 0.85);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.28)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
}
function currentDistrict() {
  const p = state.player;
  for (const d of city.districts) if (p.x >= d.x && p.x < d.x + d.w && p.y >= d.y && p.y < d.y + d.h) return d.name.toUpperCase();
  return 'CINDER BAY';
}
function drawMenuBackdrop() {
  // Attract mode: slow pan over the city behind the menu.
  const t = performance.now() / 1000;
  state.cam.x = clamp(1200 + Math.sin(t * 0.05) * 700, 0, WORLD_W - state.cam.w);
  state.cam.y = clamp(900 + Math.cos(t * 0.04) * 400, 0, WORLD_H - state.cam.h);
  drawCity(ctx, city, state.cam, state.timeMin);
  for (const c of state.traffic) drawCar(ctx, c, state.cam);
  for (const ped of state.pedestrians) { ctx.fillStyle = ped.color; ctx.beginPath(); ctx.arc(ped.x - state.cam.x, ped.y - state.cam.y, 7, 0, Math.PI * 2); ctx.fill(); }
}

// --- Loop ---
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (state.mode === 'playing') { update(dt); draw(); updateHud(state); drawMinimap(state); }
  else if (state.mode === 'menu') { drawMenuBackdrop(); }
  requestAnimationFrame(frame);
}

// --- Menu wiring ---
document.getElementById('menuMissions').innerHTML = missionListText(0);
document.getElementById('btnNew').addEventListener('click', () => newGame(false));
document.getElementById('btnContinue').addEventListener('click', () => {
  if (loadSave()) newGame(true); else { showToast('No save yet — start a NEW GAME.'); newGame(false); }
});
document.getElementById('btnHow').addEventListener('click', () => {
  showToast('WASD move/drive · Mouse aim · Click shoot · E steal car · P pause');
  alert('HOW TO PLAY\n\nWalk with WASD, aim with the mouse, click to shoot.\nWalk up to a parked car and press E to steal it, then drive with WASD.\nFollow the gold marker to complete Mara\'s jobs and earn cash.\nStars mean the Cinder Bay PD is after you — lay low and they cool off.\nP pauses and saves. Your progress saves after every job.');
});
document.getElementById('btnResume').addEventListener('click', togglePause);
document.getElementById('btnSave').addEventListener('click', () => { saveGame(); showToast('Game saved.'); });
document.getElementById('btnQuit').addEventListener('click', () => {
  saveGame(); state.mode = 'menu';
  document.getElementById('pauseMenu').classList.add('hidden');
  document.getElementById('menu').classList.remove('hidden');
  document.getElementById('menuMissions').innerHTML = missionListText(state.missionIndex);
});
spawnPedestrians();
// Autostart for play-testing / screenshots: ?autostart=1
if (new URLSearchParams(location.search).get('autostart') === '1') newGame(false);
// Screenshot staging hook: ?scene=chase|mission|onfoot (with ?autostart=1).
// Stages a real gameplay state for screenshots; normal play is unaffected.
const scene = new URLSearchParams(location.search).get('scene');
if (scene && state.mode === 'playing') {
  if (scene === 'chase') {
    // Dante in the nearest parked car, foot down, 3 wanted stars, PD in pursuit.
    const p = state.player;
    let best = null, bestD = 1e9;
    for (const c of state.parked) { const d = Math.hypot(c.x - p.x, c.y - p.y); if (d < bestD) { best = c; bestD = d; } }
    if (best) { best.parked = false; state.parked = state.parked.filter((c) => c !== best); p.car = best; p.x = best.x; p.y = best.y; best.speed = 200; input.up = true; }
    state.police.addHeat(50, 'screenshot staging');
  } else if (scene === 'mission') {
    // Jump to the Bank Courier job, Dante on foot near Harbour Bank.
    state.missionIndex = 3; startMission(3);
    state.player.x = 1400; state.player.y = 1460; state.player.cash = 1400;
  } else if (scene === 'onfoot') {
    // Dante on foot at a busy Downtown intersection, traffic on both roads.
    state.player.x = 1080; state.player.y = 1080; state.player.cash = 500;
  }
}
requestAnimationFrame(frame);

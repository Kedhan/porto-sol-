// Red Mesa Heat — hud.js
// HUD readouts, the live minimap, toasts, and the shared $ lookup.
// Reads RM.state / RM.player / RM.car / RM.policeMgr / RM.missionMgr and
// writes only into the DOM ids defined in game/index.html.
(function () {
  'use strict';
  var toastTimer = null;

  function $(id) { return document.getElementById(id); }

  // Called ~8x per second from the main loop: cash, name, health bar,
  // ammo hint, wanted stars, clock, speed, and the mission objective.
  function updateHud() {
    var st = RM.state, p = RM.player;
    if (!p) return;
    $('hudCash').textContent = RM.fmtCash(st.cash);
    $('hudHealth').textContent = p.name.toUpperCase() +
      (st.mode === 'car' && RM.car ? ' · ' + RM.car.name.toUpperCase() : '');
    var hp = st.mode === 'car' ? st.carHealth : st.health;
    var fill = $('healthFill');
    fill.style.width = RM.clamp(hp, 0, 100) + '%';
    fill.style.background = hp > 50
      ? 'linear-gradient(90deg,#37e05a,#a8ff6a)'
      : hp > 25
        ? 'linear-gradient(90deg,#ffb347,#ffd166)'
        : 'linear-gradient(90deg,#ff5252,#ff8a80)';
    $('hudAmmo').textContent = st.mode === 'car'
      ? 'IN CAR · E TO EXIT'
      : 'PISTOL · CLICK TO SHOOT · E ENTER CAR';
    var stars = $('hudStars');
    stars.textContent = RM.policeMgr ? RM.policeMgr.wantedStars() : '☆☆☆☆☆';
    stars.style.color = st.wanted > 0 ? '#ffd166' : '#ffffff';
    $('hudClock').textContent = 'RED MESA · 6:47 PM · DAY 1';
    var speed = st.mode === 'car' && RM.car
      ? Math.abs(Math.round(RM.car.speed * 3.6))
      : Math.round(p.speed * 3.6);
    $('hudSpeedNum').textContent = speed;
    $('hudSpeedLabel').textContent = st.mode === 'car' && RM.car
      ? RM.car.name.toUpperCase() + ' · km/h'
      : 'ON FOOT · km/h';
    var m = RM.missionMgr && RM.missionMgr.state ? RM.missionMgr.state.mission : null;
    if (m) {
      $('hudMissionTitle').textContent = 'JOB ' + m.id + ' · ' + m.title;
      var extra = RM.missionMgr.progressText();
      $('hudMissionText').textContent = m.objective + (extra ? ' — ' + extra : '');
    } else if (st.missionsDone >= 5) {
      $('hudMissionTitle').textContent = 'RED MESA — FREE ROAM';
      $('hudMissionText').textContent = 'All jobs done! Free roam, steal cars, explore Red Mesa.';
    } else {
      $('hudMissionTitle').textContent = 'RED MESA HEAT';
      $('hudMissionText').textContent = 'Press NEW GAME to start Rook\'s story.';
    }
  }

  // A short message banner at the bottom of the screen.
  function toast(text, ms) {
    var el = $('toast');
    el.textContent = text;
    el.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.style.opacity = '0'; }, ms || 2600);
  }

  // Top-down map: mesas as a border, the street grid, park and fountain,
  // the pulsing mission marker, traffic, police, enemies, pedestrians,
  // and a white arrow for Rook that rotates with his heading.
  function drawMinimap() {
    var c = $('minimap');
    if (!c || !RM.player) return;
    var ctx = c.getContext('2d');
    var W = c.width, H = c.height, MAP = RM.MAP;
    var sx = W / (MAP * 2), sy = H / (MAP * 2);
    function X(x) { return (x + MAP) * sx; }
    function Z(z) { return (z + MAP) * sy; }
    function dot(x, z, color, r) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(X(x), Z(z), r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#5a3a22';
    ctx.fillRect(0, 0, W, H);
    // red-rock mesas ringing the city
    ctx.fillStyle = '#b5502a';
    ctx.fillRect(0, 0, W, 8);
    ctx.fillRect(0, H - 8, W, 8);
    ctx.fillRect(0, 0, 8, H);
    ctx.fillRect(W - 8, 0, 8, H);
    // street grid
    ctx.strokeStyle = '#3a3a42';
    ctx.lineWidth = 4;
    RM.city.roads.forEach(function (r) {
      ctx.beginPath(); ctx.moveTo(X(r), 0); ctx.lineTo(X(r), H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, Z(r)); ctx.lineTo(W, Z(r)); ctx.stroke();
    });
    // central park + fountain
    ctx.fillStyle = '#4a7a3d';
    ctx.fillRect(X(13), Z(13), 64 * sx, 64 * sy);
    ctx.fillStyle = '#7fd8e8';
    ctx.beginPath(); ctx.arc(X(45), Z(45), 4, 0, Math.PI * 2); ctx.fill();
    // mission target, pulsing gold
    if (RM.missionMgr && RM.missionMgr.state) {
      var t = RM.missionMgr.targetNow();
      if (t) {
        var pulse = 5 + Math.sin(performance.now() / 200) * 2;
        dot(t.x, t.z, '#ffd166', pulse);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(X(t.x), Z(t.z), pulse + 3, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    RM.cars.forEach(function (car) { dot(car.x, car.z, '#9db8d8', 2); });
    RM.police.forEach(function (car) { dot(car.x, car.z, '#3a7bff', 3.5); });
    RM.enemies.forEach(function (e) { if (!e.dead) dot(e.x, e.z, '#ff4444', 3); });
    RM.peds.forEach(function (p) { if (!p.dead) dot(p.x, p.z, '#cfe8c0', 1.5); });
    // player arrow, rotated by heading
    var p = RM.player;
    ctx.save();
    ctx.translate(X(p.x), Z(p.z));
    ctx.rotate(Math.atan2(Math.sin(p.heading), -Math.cos(p.heading)) + Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(-4.5, 5);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ff5e62';
    ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function setObjective(m) {
    $('hudMissionTitle').textContent = 'JOB ' + m.id + ' · ' + m.title;
    $('hudMissionText').textContent = m.objective;
  }

  RM.hud = { update: updateHud, toast: toast, drawMinimap: drawMinimap, setObjective: setObjective };
})();

// Red Mesa Heat — main.js
// Boot, game loop, input, shooting, enemies, busted/wasted and save/load.
// Classic scripts only: THREE is the vendored global from vendor/three.min.js.
(function () {
  'use strict';
  var THREE = window.THREE;
  var SAVE_KEY = 'red-mesa-heat-save-v1';

  var input = { up: false, down: false, left: false, right: false, boost: false, mouseDown: false };
  var tracers = [];
  var lastTime = 0;

  function el(id) { return document.getElementById(id); }

  function init() {
    try {
      if (!THREE) throw new Error('three.js failed to load');
      var renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.outputEncoding = THREE.sRGBEncoding;
      el('game').appendChild(renderer.domElement);
      RM.renderer = renderer;
      RM.scene = new THREE.Scene();
      RM.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2200);
      RM.camera.position.set(0, 8, -18);

      RM.audio = new RM.AudioEngine();
      RM.buildCity(RM.scene);
      RM.createPlayer(0, 200);
      RM.parked = RM.spawnParked(14);
      RM.cars = RM.spawnTraffic(12);
      RM.peds = RM.spawnPeds(22);
      RM.policeMgr = new RM.PoliceManager();
      RM.missionMgr = new RM.MissionManager();

      window.addEventListener('resize', onResize);
      bindInput();
      bindMenus();
      loadSaveIntoMenu();
      el('menuMissions').innerHTML = RM.missionListText(0);

      // Shot modes for deterministic screenshots / play-tests.
      var shot = RM.shot;
      if (shot && shot !== 'menu') {
        startGame(false);
        applyShot(shot);
      } else if (shot === 'menu') {
        // stay on the title screen
      }
      lastTime = performance.now();
      requestAnimationFrame(loop);
      window.__RM_READY = true;
    } catch (e) {
      window.__RM_ERROR = String(e && e.message || e);
      var m = el('menu');
      if (m) m.innerHTML = '<div class="panel"><h1>RED MESA HEAT</h1><p>Failed to start: ' + window.__RM_ERROR + '</p></div>';
    }
  }

  function onResize() {
    RM.camera.aspect = window.innerWidth / window.innerHeight;
    RM.camera.updateProjectionMatrix();
    RM.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function bindInput() {
    var keyMap = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', ShiftLeft: 'boost', ShiftRight: 'boost' };
    window.addEventListener('keydown', function (e) {
      if (keyMap[e.code] !== undefined) { input[keyMap[e.code]] = true; e.preventDefault(); }
      if (e.code === 'KeyE' && RM.state.started && !RM.state.over) RM.tryEnterExit();
      if (e.code === 'KeyM') { RM.state.muted = !RM.state.muted; if (RM.audio) RM.audio.setMuted(RM.state.muted); }
      if (e.code === 'KeyR') { RM.state.radio = !RM.state.radio; if (RM.hud) RM.hud.toast(RM.state.radio ? 'Radio: Desert FM on' : 'Radio off', 1500); }
      if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
      if (e.code === 'Enter' && RM.state.over) respawn();
    });
    window.addEventListener('keyup', function (e) {
      if (keyMap[e.code] !== undefined) input[keyMap[e.code]] = false;
    });
    var canvas = el('game');
    var dragging = false, lastX = 0, lastY = 0;
    canvas.addEventListener('mousedown', function (e) {
      dragging = true; lastX = e.clientX; lastY = e.clientY; input.mouseDown = true;
      if (RM.state.started && RM.state.mode === 'foot') shoot();
    });
    window.addEventListener('mouseup', function () { dragging = false; input.mouseDown = false; });
    window.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      RM.camYaw -= (e.clientX - lastX) * 0.005;
      RM.camPitch = RM.clamp(RM.camPitch + (e.clientY - lastY) * 0.003, -0.15, 0.9);
      lastX = e.clientX; lastY = e.clientY;
    });
    // touch: drag to orbit, tap right side to shoot / interact
    canvas.addEventListener('touchstart', function (e) { if (RM.audio) RM.audio.ensure(); }, { passive: true });
  }

  function bindMenus() {
    el('btnNew').addEventListener('click', function () { if (RM.audio) RM.audio.ensure(); startGame(false); });
    el('btnContinue').addEventListener('click', function () { if (RM.audio) RM.audio.ensure(); startGame(true); });
    el('btnHow').addEventListener('click', function () {
      el('menuMissions').innerHTML = '<b>HOW TO PLAY</b><br>WASD walk &amp; drive · Mouse drag orbits the camera · Click shoots on foot · E steal / enter / exit car · Shift sprint &amp; boost · R radio · M mute · P pause · Steal cars and finish Ilsa\'s five jobs, but watch the stars — the RMPD rams.';
    });
    el('btnResume').addEventListener('click', togglePause);
    el('btnSave').addEventListener('click', function () { saveGame(); if (RM.hud) RM.hud.toast('Game saved.', 1800); });
    el('btnQuit').addEventListener('click', function () {
      RM.state.started = false; RM.state.paused = false;
      el('pauseMenu').classList.add('hidden');
      el('menu').classList.remove('hidden');
      el('menuMissions').innerHTML = RM.missionListText(RM.missionMgr ? RM.missionMgr.index : 0);
    });
  }

  function startGame(continueSave) {
    var st = RM.state;
    st.started = true; st.paused = false; st.over = false; st.overKind = null;
    st.health = 100; st.carHealth = 100;
    el('menu').classList.add('hidden');
    el('pauseMenu').classList.add('hidden');
    el('wasted').style.display = 'none';
    if (continueSave) {
      try {
        var save = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
        if (save) {
          st.cash = save.cash || 250;
          st.missionsDone = save.missionsDone || 0;
          RM.missionMgr.start(save.missionIndex || 0);
          if (RM.hud) RM.hud.toast('Welcome back, Rook. Job ' + (save.missionIndex + 1) + ' is waiting.', 3200);
          return;
        }
      } catch (e) {}
    }
    st.cash = 250; st.missionsDone = 0;
    RM.policeMgr.clear();
    RM.missionMgr.start(0);
    if (RM.hud) RM.hud.toast('RED MESA — Rook Calloway is back. Job 1: Homecoming.', 3600);
  }

  function saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: RM.state.cash,
        missionIndex: RM.missionMgr ? RM.missionMgr.index : 0,
        missionsDone: RM.state.missionsDone
      }));
    } catch (e) {}
  }
  RM.saveGame = saveGame;

  function loadSaveIntoMenu() {
    try {
      var save = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      el('btnContinue').style.display = save ? '' : 'none';
      if (save) el('menuMissions').innerHTML = RM.missionListText(save.missionIndex || 0);
    } catch (e) { el('btnContinue').style.display = 'none'; }
  }

  function togglePause() {
    if (!RM.state.started || RM.state.over) return;
    RM.state.paused = !RM.state.paused;
    el('pauseMenu').classList.toggle('hidden', !RM.state.paused);
    if (RM.state.paused) {
      el('pauseStats').textContent = 'Cash ' + RM.fmtCash(RM.state.cash) + ' · Missions ' + RM.state.missionsDone + '/5 complete · Wanted ' + RM.state.wanted + '★';
    }
  }

  function respawn() {
    var st = RM.state;
    st.over = false; st.overKind = null;
    st.health = 100; st.carHealth = 100;
    st.cash = Math.max(0, st.cash - 200);
    RM.policeMgr.clear();
    var p = RM.player;
    p.x = 0; p.z = 200; p.heading = 0;
    p.mesh.position.set(p.x, 0, p.z);
    if (RM.car) { RM.car = null; p.car = null; st.mode = 'foot'; p.mesh.visible = true; }
    el('wasted').style.display = 'none';
    if (RM.hud) RM.hud.toast('Back on the street — $200 bail paid.', 3000);
  }

  function applyShot(shot) {
    var p = RM.player;
    if (shot === 'drive') {
      putPlayerInCar(0, 270, Math.PI, 14);
    } else if (shot === 'onfoot') {
      // On road x=0 looking north down the street, park ahead on the right.
      p.x = 0; p.z = 150; p.heading = Math.PI;
      p.mesh.position.set(p.x, 0, p.z);
      RM.camYaw = p.heading;
    } else if (shot === 'chase') {
      putPlayerInCar(0, 90, Math.PI, 12);
      RM.policeMgr.setWanted(3);
      // Police ahead in the player's view: a roadblock converging on Rook.
      var pc1 = RM.policeMgr.spawnOne(0, 90);
      pc1.x = -5; pc1.z = 45; pc1.heading = 0; pc1.mesh.position.set(-5, 0, 45); pc1.mesh.rotation.y = 0;
      var pc2 = RM.policeMgr.spawnOne(0, 90);
      pc2.x = 6; pc2.z = 20; pc2.heading = 0; pc2.mesh.position.set(6, 0, 20); pc2.mesh.rotation.y = 0;
      RM.missionMgr.start(2);
    } else if (shot === 'mission') {
      // On road x=90 looking north: the bank and its beacon straight ahead,
      // a police car closing in from the left lane.
      putPlayerInCar(90, 230, Math.PI, 8);
      RM.missionMgr.start(3);
      RM.policeMgr.setWanted(2);
      var pc = RM.policeMgr.spawnOne(90, 200);
      pc.x = 84; pc.z = 150; pc.heading = Math.PI; pc.mesh.position.set(84, 0, 150); pc.mesh.rotation.y = pc.heading;
    }
  }

  function putPlayerInCar(x, z, heading, speed) {
    var car = RM.parked[0] || RM.cars[0];
    if (!car) return;
    RM.parked = RM.parked.filter(function (c) { return c !== car; });
    car.parked = false;
    car.x = x; car.z = z; car.heading = heading; car.speed = speed || 0;
    car.mesh.position.set(x, 0, z);
    car.mesh.rotation.y = heading;
    RM.player.car = car; RM.car = car;
    RM.state.mode = 'car';
    RM.player.mesh.visible = false;
    RM.player.x = x; RM.player.z = z;
    RM.camYaw = heading;
  }

  // Hitscan pistol: nearest enemy / police car in front of the camera.
  function shoot() {
    var p = RM.player;
    if (!p || RM.state.mode !== 'foot' || p.shootCooldown > 0) return;
    p.shootCooldown = 0.28;
    if (RM.audio) RM.audio.shoot();
    var fx = Math.sin(RM.camYaw), fz = Math.cos(RM.camYaw);
    var best = null, bestScore = 1e9;
    function consider(x, z, obj) {
      var dx = x - p.x, dz = z - p.z, d = Math.sqrt(dx * dx + dz * dz);
      if (d > 42 || d < 1) return;
      var dot = (dx * fx + dz * fz) / d;
      if (dot < 0.86) return;
      var score = d + (1 - dot) * 20;
      if (score < bestScore) { bestScore = score; best = obj; }
    }
    RM.enemies.forEach(function (e) { if (!e.dead) consider(e.x, e.z, { kind: 'enemy', ref: e }); });
    RM.police.forEach(function (c) { consider(c.x, c.z, { kind: 'police', ref: c }); });
    // tracer line from the player toward the aim direction
    var endX = p.x + fx * 40, endZ = p.z + fz * 40;
    if (best) {
      endX = best.ref.x; endZ = best.ref.z;
      if (best.kind === 'enemy') {
        best.ref.health -= 34;
        if (best.ref.health <= 0) { best.ref.dead = true; best.ref.mesh.visible = false; }
      } else {
        best.ref.health -= 25;
        best.ref.flash = 0.3;
        if (best.ref.health <= 0) { best.ref.dead = true; RM.scene.remove(best.ref.mesh); if (RM.policeMgr) RM.policeMgr.addHeat(12); }
        else if (RM.policeMgr) RM.policeMgr.addHeat(6);
      }
    }
    var geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(p.x, 1.4, p.z), new THREE.Vector3(endX, 1.4, endZ)
    ]);
    var line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8 }));
    RM.scene.add(line);
    tracers.push({ line: line, life: 0.12 });
  }

  function updateEnemies(dt) {
    var p = RM.player;
    for (var i = 0; i < RM.enemies.length; i++) {
      var e = RM.enemies[i];
      if (e.dead) continue;
      var dx = p.x - e.x, dz = p.z - e.z, d = Math.sqrt(dx * dx + dz * dz);
      e.mesh.rotation.y = Math.atan2(dx, dz);
      e.shootTimer -= dt;
      if (d < 46 && e.shootTimer <= 0) {
        e.shootTimer = 1.6 + RM.rand() * 1.2;
        if (RM.audio) RM.audio.enemyShoot();
        if (RM.state.mode === 'foot') RM.state.health = Math.max(0, RM.state.health - 7);
        else RM.state.carHealth = Math.max(0, RM.state.carHealth - 4);
      }
      // walk toward the player slowly
      if (d > 10 && d < 46) {
        e.x += (dx / d) * 2.2 * dt; e.z += (dz / d) * 2.2 * dt;
        e.mesh.position.set(e.x, 0, e.z);
      }
    }
  }

  function checkOver() {
    var st = RM.state;
    if (st.over) return;
    if (st.health <= 0) { endOver('wasted', 'WASTED', 'Rook is down. The desert keeps its secrets.'); return; }
    if (st.mode === 'car' && st.carHealth <= 0) {
      // car wrecked: bail out on foot, health takes a hit
      st.carHealth = 100;
      if (RM.car) { RM.car.health = 0; RM.car.dead = true; RM.scene.remove(RM.car.mesh); }
      RM.tryEnterExit();
      st.health = Math.max(1, st.health - 30);
      if (RM.hud) RM.hud.toast('Your car is wrecked! On foot now.', 3000);
      return;
    }
    if (st.mode === 'foot' && st.wanted >= 3) {
      var near = 0;
      for (var i = 0; i < RM.police.length; i++) {
        if (Math.sqrt(RM.dist2(RM.player.x, RM.player.z, RM.police[i].x, RM.police[i].z)) < 7) near++;
      }
      if (near >= 2 && RM.player.speed < 1) endOver('busted', 'BUSTED', 'The RMPD caught up with you.');
    }
  }

  function endOver(kind, title, text) {
    var st = RM.state;
    st.over = true; st.overKind = kind;
    el('wastedTitle').textContent = title;
    el('wastedText').textContent = text;
    el('wasted').style.display = 'flex';
    if (RM.audio) RM.audio.busted();
    if (RM.policeMgr) RM.policeMgr.clear();
  }

  var hudTimer = 0, mapTimer = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    var dt = Math.min(0.05, (now - lastTime) / 1000 || 0.016);
    lastTime = now;
    if (!RM.state.paused) {
      RM.state.time += dt;
      if (RM.state.started && !RM.state.over) {
        RM.state.playTime += dt;
        if (RM.state.mode === 'car' && RM.car) {
          RM.updatePlayerCar(RM.car, input, dt);
          // The player rides in the car: keep player position in sync so
          // police, missions and the minimap track the moving car.
          RM.player.x = RM.car.x; RM.player.z = RM.car.z;
          RM.state.speed = RM.car.speed;
          RM.state.carHealth = RM.car.health;
        } else {
          RM.updatePlayerOnFoot(RM.player, input, dt);
          RM.state.speed = RM.player.speed;
        }
        RM.updateTraffic(dt);
        RM.updatePeds(RM.peds, dt, { x: RM.player.x, z: RM.player.z }, RM.state.mode === 'car' && RM.car ? RM.car.speed : RM.player.speed);
        RM.policeMgr.update(dt);
        RM.missionMgr.update(dt);
        updateEnemies(dt);
        checkOver();
        if (RM.audio) RM.audio.setEngine(RM.state.mode === 'car' && RM.car ? Math.abs(RM.car.speed) / 38 : 0);
        // clouds drift
        RM.city.clouds.forEach(function (c, i) { c.position.x += dt * (1 + i * 0.2); if (c.position.x > 560) c.position.x = -560; });
      }
      RM.updateCamera(dt);
      // tracers fade
      for (var i = tracers.length - 1; i >= 0; i--) {
        tracers[i].life -= dt;
        if (tracers[i].life <= 0) { RM.scene.remove(tracers[i].line); tracers.splice(i, 1); }
      }
      hudTimer += dt;
      if (hudTimer > 0.12) { hudTimer = 0; RM.hud.update(); }
      mapTimer += dt;
      if (mapTimer > 0.15) { mapTimer = 0; RM.hud.drawMinimap(); }
    }
    RM.renderer.render(RM.scene, RM.camera);
  }

  window.addEventListener('DOMContentLoaded', init);
  // If the script loads after DOMContentLoaded (it is at the end of body), boot now.
  if (document.readyState !== 'loading') init();
})();

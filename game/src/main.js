// main.js — Red Mesa Heat boot, input, game loop, shot modes (round 3 rewrite).
// Own implementation: renderer setup, menu wiring, save/load, respawn, checks.
(function () {
  'use strict';

  var SAVE_KEY = 'red-mesa-heat-save-v2';
  var clock = null;
  var frames = 0;
  var drag = null; // {x, y} while the mouse drags the camera

  function $(id) { return document.getElementById(id); }

  function show(el, on) {
    if (!el) return;
    // #hud starts with class="hidden" (.hidden is display:none !important),
    // so an inline display alone can never reveal it — toggle the class too.
    el.classList.toggle('hidden', !on);
    el.style.display = on ? 'block' : 'none';
  }

  function garageSpot() {
    var lm = (RM.city && RM.city.landmarks) ? RM.city.landmarks.garage : null;
    return lm || { x: 0, z: 0 };
  }

  RM.main = {
    init: function () {
      try {
        var app = $('app') || document.body;

        RM.renderer = new THREE.WebGLRenderer({ antialias: true });
        RM.renderer.setSize(window.innerWidth, window.innerHeight);
        RM.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        if (THREE.sRGBEncoding !== undefined) RM.renderer.outputEncoding = THREE.sRGBEncoding;
        RM.renderer.shadowMap.enabled = true;
        RM.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        app.appendChild(RM.renderer.domElement);

        RM.scene = new THREE.Scene();
        RM.scene.background = new THREE.Color(0xf2a65e);
        RM.scene.fog = new THREE.Fog(0xe8a35c, 120, 800);

        RM.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
        RM.camera.position.set(0, 9, 16);

        var hemi = new THREE.HemisphereLight(0xffd9a0, 0x8a5a3b, 0.95);
        RM.scene.add(hemi);
        var sun = new THREE.DirectionalLight(0xffb36b, 1.15);
        sun.position.set(120, 180, 60);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        sun.shadow.camera.left = -260;
        sun.shadow.camera.right = 260;
        sun.shadow.camera.top = 260;
        sun.shadow.camera.bottom = -260;
        sun.shadow.camera.far = 600;
        RM.scene.add(sun);

        RM.audio = new RM.AudioEngine();
        RM.buildCity(RM.scene);
        RM.createPlayer();
        RM.spawnParked(14);
        RM.spawnTraffic(12);
        RM.spawnPeds(22);
        RM.policeMgr = new RM.PoliceManager();
        RM.missionMgr = new RM.MissionManager();

        this._wireInput();
        this._wireMenus();

        var saved = this.loadSave();
        var cont = $('btn-continue');
        if (cont) cont.disabled = !saved;

        var list = $('menu-desc');
        if (list && RM.missionListText) list.textContent = RM.missionListText();

        window.addEventListener('resize', function () {
          RM.camera.aspect = window.innerWidth / window.innerHeight;
          RM.camera.updateProjectionMatrix();
          RM.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        this.applyShot();

        clock = new THREE.Clock();
        var self = this;
        (function frame() {
          requestAnimationFrame(frame);
          self.loop();
        })();
      } catch (err) {
        window.__RM_ERROR = String((err && err.message) || err);
      }
    },

    _wireInput: function () {
      window.addEventListener('keydown', function (ev) {
        var key = ev.key.toLowerCase();
        RM.keys[key] = true;
        // The driving / walking code reads ev.code names (KeyW, ArrowUp,
        // ShiftLeft, Space), so record those too — otherwise W does nothing.
        if (ev.code) RM.keys[ev.code] = true;
        if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].indexOf(key) >= 0) ev.preventDefault();
        if (key === 'e' && RM.state.started && !RM.state.paused && !RM.state.over) RM.tryEnterExit();
        if (key === 'm' && RM.audio) RM.audio.setMuted(!RM.state.muted);
        if (key === 'r' && RM.audio) RM.audio.toggleRadio();
        if ((key === 'p' || key === 'escape') && RM.state.started && !RM.state.over) RM.main.togglePause();
        if (key === 'enter' && RM.state.over) RM.main.respawn();
      });
      window.addEventListener('keyup', function (ev) {
        RM.keys[ev.key.toLowerCase()] = false;
        if (ev.code) RM.keys[ev.code] = false;
      });

      var canvas = RM.renderer.domElement;
      canvas.addEventListener('pointerdown', function (ev) {
        drag = { x: ev.clientX, y: ev.clientY, moved: false };
        if (RM.audio) RM.audio.init();
      });
      window.addEventListener('pointermove', function (ev) {
        if (!drag) return;
        var dx = ev.clientX - drag.x;
        var dy = ev.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
        RM.camYaw -= dx * 0.005;
        RM.camPitch = RM.clamp((RM.camPitch || 0.25) + dy * 0.003, 0.05, 1.1);
        drag.x = ev.clientX;
        drag.y = ev.clientY;
      });
      window.addEventListener('pointerup', function (ev) {
        if (drag && !drag.moved && RM.state.started && !RM.state.paused && !RM.state.over
          && RM.state.mode === 'foot' && RM.playerShoot) {
          RM.playerShoot();
        }
        drag = null;
      });
    },

    _wireMenus: function () {
      var self = this;
      function on(id, fn) { var el = $(id); if (el) el.addEventListener('click', fn); }
      on('btn-new', function () { self.startGame(true); });
      on('btn-continue', function () { self.startGame(false); });
      on('btn-how', function () {
        var panel = $('how-panel');
        if (panel) panel.style.display = (panel.style.display === 'block') ? 'none' : 'block';
      });
      on('btn-resume', function () { self.togglePause(); });
      on('btn-save', function () { self.saveGame(); if (RM.hud) RM.hud.toast('Progress saved.'); });
      on('btn-quit', function () {
        RM.state.started = false;
        RM.state.paused = false;
        show($('pause-menu'), false);
        show($('menu'), true);
        show($('hud'), false);
        var list = $('menu-desc');
        if (list && RM.missionListText) list.textContent = RM.missionListText();
      });
      on('btn-retry', function () { self.respawn(); });
    },

    startGame: function (fresh) {
      var s = RM.state;
      if (fresh) {
        s.cash = 250; s.health = 100; s.carHealth = 100; s.wanted = 0; s.heat = 0;
        s.missionIndex = 0; s.kills = 0; s.carsStolen = 0; s.playTime = 0;
        s.car = null; s.mode = 'foot';
      } else {
        var saved = this.loadSave();
        if (saved) {
          s.cash = saved.cash || 250;
          s.health = saved.health || 100;
          s.missionIndex = saved.missionIndex || 0;
          s.kills = saved.kills || 0;
          s.carsStolen = saved.carsStolen || 0;
          s.playTime = saved.playTime || 0;
        }
      }
      s.started = true; s.paused = false; s.over = false; s.busted = false;
      s.time = s.time || 0;
      if (RM.audio) RM.audio.init();
      show($('menu'), false);
      show($('over-screen'), false);
      show($('hud'), true);
      var spot = garageSpot();
      if (RM.player && RM.player.group) {
        RM.player.group.position.set(spot.x + 4, 0, spot.z + 4);
        RM.player.group.visible = true;
      }
      if (RM.missionMgr) RM.missionMgr.start(Math.min(s.missionIndex, RM.MISSIONS.length - 1));
      if (RM.hud) RM.hud.toast(fresh ? 'Welcome back to Red Mesa, Rook.' : 'Welcome back, Rook.');
    },

    saveGame: function () {
      try {
        var s = RM.state;
        localStorage.setItem(SAVE_KEY, JSON.stringify({
          cash: s.cash, missionIndex: s.missionIndex, health: s.health,
          kills: s.kills, carsStolen: s.carsStolen, playTime: s.playTime,
          savedAt: Date.now()
        }));
      } catch (e) { /* storage unavailable: progress just does not persist */ }
    },

    loadSave: function () {
      try {
        var raw = localStorage.getItem(SAVE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    },

    togglePause: function () {
      if (!RM.state.started || RM.state.over) return;
      RM.state.paused = !RM.state.paused;
      show($('pause-menu'), RM.state.paused);
    },

    respawn: function () {
      var s = RM.state;
      s.health = 100; s.carHealth = 100; s.wanted = 0; s.heat = 0;
      s.busted = false; s.over = false;
      if (RM.policeMgr && RM.policeMgr.clear) RM.policeMgr.clear();
      if (RM.car) { RM.car = null; s.mode = 'foot'; }
      var spot = garageSpot();
      if (RM.player && RM.player.group) {
        RM.player.group.position.set(spot.x + 4, 0, spot.z + 4);
        RM.player.group.visible = true;
      }
      show($('over-screen'), false);
      if (RM.hud) RM.hud.toast('Patched up. Ilsa says you owe her one.');
      if (RM.missionMgr && s.missionIndex < RM.MISSIONS.length) {
        RM.missionMgr.start(s.missionIndex);
      }
    },

    _endOver: function (kind) {
      var s = RM.state;
      s.over = true;
      var title = $('over-title');
      var text = $('over-text');
      if (kind === 'wasted') {
        if (title) title.textContent = 'WASTED';
        if (text) text.textContent = 'Rook went down in Red Mesa. Press Enter to get patched up.';
      } else if (kind === 'busted') {
        if (title) title.textContent = 'BUSTED';
        if (text) text.textContent = 'The Mesa PD hauled Rook in. Press Enter to post bail.';
      } else {
        if (title) title.textContent = 'WRECKED';
        if (text) text.textContent = 'The car is scrap. Press Enter to walk away from it.';
      }
      show($('over-screen'), true);
      if (RM.audio) RM.audio.sfx('fail');
    },

    _checkOver: function () {
      var s = RM.state;
      if (s.over) return;
      if (s.health <= 0) this._endOver('wasted');
      else if (s.busted) this._endOver('busted');
      else if (s.mode === 'car' && s.carHealth <= 0) this._endOver('wrecked');
    },

    loop: function () {
      var dt = clock ? Math.min(clock.getDelta(), 0.05) : 0.016;
      var s = RM.state;
      s.time += dt;

      if (s.started && !s.paused && !s.over) {
        if (s.mode === 'car' && RM.car) {
          RM.updatePlayerCar(RM.car, dt);
          s.speed = RM.car.speed || 0;
          // Keep the body glued to the car so the camera and HUD agree.
          if (RM.player && RM.player.group) {
            RM.player.group.position.copy(RM.car.group.position);
            RM.player.group.visible = false;
          }
        } else {
          RM.updatePlayerOnFoot(dt);
          s.speed = (RM.player && RM.player.speed) || 0;
          if (RM.player && RM.player.group) RM.player.group.visible = true;
        }
        RM.updateCamera(dt);
        RM.updateTraffic(dt);
        RM.updatePeds(dt);
        if (RM.policeMgr) RM.policeMgr.update(dt);
        if (RM.missionMgr) RM.missionMgr.update(dt);
        s.playTime += dt;
        this._checkOver();
      }

      // Cloud drift, even on the menu — the city stays alive behind it.
      var clouds = (RM.city && RM.city.clouds) || [];
      for (var i = 0; i < clouds.length; i++) {
        clouds[i].position.x += dt * 1.5;
        if (clouds[i].position.x > RM.MAP / 2 + 80) clouds[i].position.x = -RM.MAP / 2 - 80;
      }

      if (RM.audio) RM.audio.update(dt);
      if (RM.hud) RM.hud.update(dt);
      RM.renderer.render(RM.scene, RM.camera);

      frames++;
      if (frames === 1) window.__RM_READY = true;
    },

    // Deterministic setups for screenshots and tests: ?shot=menu|drive|onfoot|chase|mission&seed=1337
    applyShot: function () {
      var q = new URLSearchParams(window.location.search);
      var shot = q.get('shot') || 'menu';
      if (shot === 'menu') return;

      this.startGame(true);

      if (shot === 'drive' || shot === 'chase' || shot === 'mission') {
        var parked = null;
        for (var i = 0; i < RM.cars.length; i++) {
          if (RM.cars[i].parked) { parked = RM.cars[i]; break; }
        }
        if (parked && RM.player && RM.player.group) {
          RM.player.group.position.set(
            parked.group.position.x + 3, 0, parked.group.position.z + 2);
          RM.tryEnterExit();
        }
      }

      if (shot === 'onfoot') {
        if (RM.player && RM.player.group) {
          RM.player.group.position.set(20, 0, 20);
          RM.camYaw = Math.PI * 0.75;
        }
      }

      if (shot === 'chase') {
        if (RM.policeMgr) RM.policeMgr.setWanted(3);
      }

      if (shot === 'mission') {
        if (RM.missionMgr) RM.missionMgr.start(3); // Bank Job
        if (RM.policeMgr) RM.policeMgr.setWanted(2);
      }
    }
  };

  // Boot once the page is ready.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { RM.main.init(); });
  } else {
    RM.main.init();
  }
})();

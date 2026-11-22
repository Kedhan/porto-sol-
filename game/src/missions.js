// missions.js — Red Mesa Heat story jobs (round 3 rewrite).
// Six jobs for Rook Calloway, handed out by fixer Ilsa Kade.
// Original implementation: beacon pillars, phased jobs, hold timers.
(function () {
  'use strict';

  var ARRIVE_DIST = 14;   // metres from a target that counts as "there"
  var HOLD_RADIUS = 26;   // metres inside which the overlook hold ticks
  var BEACON_HEIGHT = 70; // light pillar height, metres

  // The six jobs. `target` / `secondTarget` name landmarks in RM.city.landmarks.
  RM.MISSIONS = [
    { id: 1, name: 'Homecoming', intro: 'Ilsa is waiting at the garage, Rook. Go say hi.',
      objective: 'Drive to Ilsa at the garage', target: 'garage', reward: 150, timeLimit: 0, stars: 0 },
    { id: 2, name: 'Hot Wheels', intro: 'Ilsa needs wheels. Steal a car and bring it to the garage.',
      objective: 'Steal any car, deliver it to the garage', target: 'garage', reward: 300, timeLimit: 0, stars: 1 },
    { id: 3, name: 'Desert Run', intro: 'Ninety seconds to the Fuel Depot. Floor it.',
      objective: 'Reach the Fuel Depot before the timer ends', target: 'fuelDepot', reward: 450, timeLimit: 90, stars: 1 },
    { id: 4, name: 'Bank Job', intro: 'Grab the case at the bank, then lose the heat at the motel.',
      objective: 'Grab the case at the bank, escape to the motel', target: 'bank', reward: 800, timeLimit: 0, stars: 2, secondTarget: 'motel' },
    { id: 5, name: 'Copper Run', intro: 'The ledger is at the Copper Mine. Four stars on you.',
      objective: 'Take the ledger from the Copper Mine to the garage', target: 'copperMine', reward: 1200, timeLimit: 0, stars: 4, secondTarget: 'garage' },
    { id: 6, name: 'The Last Mesa', intro: 'Hold the overlook for 60 seconds, then run to the airstrip.',
      objective: 'Survive 60s at the overlook, then reach the airstrip', target: 'overlook', reward: 2000, timeLimit: 0, stars: 4, secondTarget: 'airstrip', holdSeconds: 60 }
  ];

  function MissionManager() {
    this.current = null;   // { def, phase, timer, holdLeft }
    this.beacon = null;    // THREE.Group: pillar + floating marker + ground ring
    this.beaconMat = null; // pillar material, pulsed in update()
    this.markerMat = null;
    this.pulse = 0;
  }

  // Where Rook is right now — the car when driving, the body when on foot.
  MissionManager.prototype._playerPos = function () {
    if (RM.state.mode === 'car' && RM.car && RM.car.group) return RM.car.group.position;
    if (RM.player && RM.player.group) return RM.player.group.position;
    return { x: 0, z: 0 };
  };

  MissionManager.prototype._landmark = function (name) {
    var lm = (RM.city && RM.city.landmarks) ? RM.city.landmarks[name] : null;
    return lm || { x: 0, z: 0 };
  };

  // Which landmark the beacon should point at right now, or null.
  MissionManager.prototype._activeTarget = function () {
    if (!this.current) return null;
    var c = this.current;
    if (c.phase === 'steal') return null; // no beacon while Rook still needs a car
    if (c.phase === 'escape') return c.def.secondTarget || null;
    return c.def.target;
  };

  MissionManager.prototype._buildBeacon = function () {
    var group = new THREE.Group();
    this.beaconMat = new THREE.MeshBasicMaterial({
      color: 0xffd23e, transparent: true, opacity: 0.22,
      side: THREE.DoubleSide, depthWrite: false
    });
    var pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6, 2.6, BEACON_HEIGHT, 12, 1, true),
      this.beaconMat
    );
    pillar.position.y = BEACON_HEIGHT / 2;
    group.add(pillar);

    this.markerMat = new THREE.MeshBasicMaterial({ color: 0xffd23e });
    var marker = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 10), this.markerMat);
    marker.position.y = 9;
    marker.name = 'beaconMarker';
    group.add(marker);

    var ring = new THREE.Mesh(
      new THREE.RingGeometry(4.5, 6, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.25;
    group.add(ring);

    this.beacon = group;
    if (RM.scene) RM.scene.add(group);
  };

  MissionManager.prototype._moveBeacon = function () {
    var name = this._activeTarget();
    if (!name) { this._clearBeacon(); return; }
    if (!this.beacon) this._buildBeacon();
    var spot = this._landmark(name);
    this.beacon.position.set(spot.x, 0, spot.z);
    this.beacon.visible = true;
  };

  MissionManager.prototype._clearBeacon = function () {
    if (this.beacon) {
      if (RM.scene) RM.scene.remove(this.beacon);
      this.beacon = null;
      this.beaconMat = null;
      this.markerMat = null;
    }
  };

  MissionManager.prototype.start = function (index) {
    var def = RM.MISSIONS[index];
    if (!def) return;
    this.current = {
      def: def,
      phase: def.id === 2 ? 'steal' : 'reach',
      timer: def.timeLimit || 0,
      holdLeft: def.holdSeconds || 0
    };
    RM.state.missionIndex = index;
    RM.state.missionActive = true;
    if (RM.policeMgr && RM.policeMgr.setWanted) RM.policeMgr.setWanted(def.stars || 0);
    if (RM.hud) {
      RM.hud.toast(def.intro);
      RM.hud.setObjective(def.objective);
    }
    this._moveBeacon();
  };

  MissionManager.prototype.onEvent = function (name) {
    if (name !== 'steal' || !this.current) return;
    var c = this.current;
    if (c.def.id === 2 && c.phase === 'steal') {
      c.phase = 'reach';
      if (RM.hud) RM.hud.toast('Car stolen — now deliver it to the garage.');
      this._moveBeacon();
    }
  };

  MissionManager.prototype.update = function (dt) {
    // Pulse the beacon even when idle, so the marker always breathes.
    this.pulse += dt;
    if (this.beacon && this.beaconMat) {
      this.beaconMat.opacity = 0.16 + 0.1 * (0.5 + 0.5 * Math.sin(this.pulse * 3));
      var marker = this.beacon.getObjectByName('beaconMarker');
      if (marker) marker.position.y = 9 + 1.5 * Math.sin(this.pulse * 2.2);
    }
    if (!this.current || !RM.state.started || RM.state.paused || RM.state.over) return;

    var c = this.current;
    var def = c.def;

    // Timed jobs: the clock only runs while Rook is on the job.
    if (def.timeLimit && c.phase !== 'done') {
      c.timer -= dt;
      if (c.timer <= 0) { this.fail(); return; }
    }

    var pos = this._playerPos();
    var targetName = this._activeTarget();
    if (!targetName) return; // stealing phase: nothing to walk toward yet
    var spot = this._landmark(targetName);
    var dx = pos.x - spot.x;
    var dz = pos.z - spot.z;
    var dist = Math.sqrt(dx * dx + dz * dz);

    if (c.phase === 'reach') {
      if (dist > ARRIVE_DIST) return;
      if (def.holdSeconds) {
        c.phase = 'hold';
        c.holdLeft = def.holdSeconds;
        if (RM.hud) RM.hud.toast('Hold the overlook — ' + def.holdSeconds + ' seconds!');
        return;
      }
      if (def.secondTarget) {
        c.phase = 'escape';
        if (RM.hud) RM.hud.toast('Got it. Now get to the ' + def.secondTarget + '!');
        this._moveBeacon();
        return;
      }
      this.complete();
      return;
    }

    if (c.phase === 'hold') {
      if (dist < HOLD_RADIUS) {
        c.holdLeft -= dt;
        if (c.holdLeft <= 0) {
          c.phase = 'escape';
          if (RM.hud) RM.hud.toast('Overlook held. Run to the airstrip!');
          this._moveBeacon();
        }
      }
      return;
    }

    if (c.phase === 'escape' && dist < ARRIVE_DIST) this.complete();
  };

  MissionManager.prototype.complete = function () {
    var def = this.current.def;
    RM.state.cash += def.reward;
    RM.state.missionIndex += 1;
    RM.state.missionActive = false;
    this.current = null;
    this._clearBeacon();
    if (RM.audio) RM.audio.sfx('mission');
    if (RM.hud) RM.hud.toast('Job done: ' + def.name + '  +' + RM.fmtCash(def.reward));
    if (RM.main && RM.main.saveGame) RM.main.saveGame();
    var next = RM.state.missionIndex;
    if (next < RM.MISSIONS.length) {
      this.start(next);
    } else if (RM.hud) {
      RM.hud.setObjective('All jobs done — free roam, Rook.');
    }
  };

  MissionManager.prototype.fail = function () {
    var idx = RM.state.missionIndex;
    this.current = null;
    RM.state.missionActive = false;
    this._clearBeacon();
    if (RM.audio) RM.audio.sfx('fail');
    if (RM.hud) RM.hud.toast('Job failed — dust yourself off and try again.');
    if (RM.MISSIONS[idx]) this.start(idx); // same job, fresh attempt
  };

  MissionManager.prototype.progressText = function () {
    if (!this.current) {
      if (RM.state.missionIndex >= RM.MISSIONS.length) return 'All jobs done — free roam, Rook.';
      return 'Free roam — take the next job from Ilsa.';
    }
    var c = this.current;
    var text = c.def.objective;
    if (c.def.timeLimit && c.timer > 0) text += '  —  ' + Math.ceil(c.timer) + 's left';
    if (c.phase === 'hold') text += '  —  hold ' + Math.ceil(Math.max(0, c.holdLeft)) + 's';
    if (c.phase === 'steal') text += '  —  steal a car first';
    return text;
  };

  // Menu listing: numbered jobs with reward, DONE / current markers.
  RM.missionListText = function () {
    var lines = [];
    for (var i = 0; i < RM.MISSIONS.length; i++) {
      var m = RM.MISSIONS[i];
      var mark = i < RM.state.missionIndex ? '[DONE] ' : (i === RM.state.missionIndex ? '> ' : '  ');
      lines.push(mark + m.id + '. ' + m.name + ' — ' + RM.fmtCash(m.reward));
    }
    return lines.join('\n');
  };

  RM.MissionManager = MissionManager;
})();

// Red Mesa Heat — missions.js
// Five story jobs from fixer Ilsa Kade. Sequential, with a 3D beacon,
// a mission marker on the minimap, cash rewards and auto-save.
(function () {
  'use strict';
  var THREE = window.THREE;

  var MISSIONS = [
    {
      id: 1, title: 'HOMECOMING', giver: 'Ilsa Kade',
      brief: "Rook is back in Red Mesa. Ilsa needs him at her garage — drive there and don't draw heat.",
      objective: 'Drive to Ilsa\'s Garage',
      reward: 500, target: { x: -180, z: -180 }, kind: 'goto', timeLimit: 0
    },
    {
      id: 2, title: 'HOT WHEELS', giver: 'Ilsa Kade',
      brief: 'A client wants a Voss Cruiser, no questions. Steal a parked car (E) and bring it to the garage.',
      objective: 'Steal a car and deliver it to Ilsa\'s Garage',
      reward: 900, target: { x: -180, z: -180 }, kind: 'steal', timeLimit: 0
    },
    {
      id: 3, title: 'DESERT RUN', giver: 'Ilsa Kade',
      brief: 'Fuel for the mine crew, and the clock is ticking. Reach the Fuel Depot in 90 seconds.',
      objective: 'Drive to the Fuel Depot before time runs out',
      reward: 1400, target: { x: 270, z: 270 }, kind: 'goto', timeLimit: 90
    },
    {
      id: 4, title: 'BANK JOB', giver: 'Ilsa Kade',
      brief: 'Grab the courier case at Red Mesa Bank, then lose the heat at the Desert Sun Motel. The RMPD will be on you — drive fast.',
      objective: 'Collect the case at Red Mesa Bank, then reach the Motel safehouse',
      reward: 2200, target: { x: 90, z: 90 }, kind: 'collect', timeLimit: 0, secondTarget: { x: -270, z: 270 }
    },
    {
      id: 5, title: 'THE LAST MESA', giver: 'Ilsa Kade',
      brief: 'Final job: take the ledger from the Old Mine Office and deliver it to Ilsa. Expect a fight — and sirens.',
      objective: 'Take the ledger at the Old Mine, then deliver it to Ilsa\'s Garage',
      reward: 5000, target: { x: 270, z: -270 }, kind: 'collect', timeLimit: 0, secondTarget: { x: -180, z: -180 }
    }
  ];

  function MissionManager() {
    this.index = 0;
    this.state = null;   // { mission, stage, timer, collected, done }
    this.beacon = null;
    this.marker = null;
  }
  MissionManager.prototype.current = function () { return MISSIONS[this.index] || null; };
  MissionManager.prototype.start = function (i) {
    this.index = i;
    var m = MISSIONS[i];
    if (!m) { this.state = null; this.setBeacon(null); return; }
    this.state = { mission: m, stage: 0, timer: m.timeLimit || 0, collected: false, done: false, failed: false };
    RM.state.missionIndex = i;
    RM.state.missionActive = true;
    this.setBeacon(m.target);
    if (RM.hud) {
      RM.hud.toast('JOB ' + m.id + ' · ' + m.title + ' — ' + m.brief, 5200);
      RM.hud.setObjective(m);
    }
    if (m.kind === 'collect') this.spawnEnemies(m.target, 3);
  };
  MissionManager.prototype.spawnEnemies = function (target, n) {
    // Crew guards on foot near the target, armed.
    for (var i = 0; i < n; i++) {
      var x = target.x + (RM.rand() - 0.5) * 40, z = target.z + (RM.rand() - 0.5) * 40;
      var g = new THREE.Group();
      var torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.78, 0.36), new THREE.MeshLambertMaterial({ color: 0x7a1f1f }));
      torso.position.y = 1.08; g.add(torso);
      var head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), new THREE.MeshLambertMaterial({ color: 0xd8a070 }));
      head.position.y = 1.72; g.add(head);
      var legMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
      var l1 = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.72, 0.26), legMat);
      l1.position.set(-0.17, 0.36, 0); g.add(l1);
      var l2 = l1.clone(); l2.position.x = 0.17; g.add(l2);
      g.position.set(x, 0, z);
      RM.scene.add(g);
      RM.enemies.push({ mesh: g, x: x, z: z, health: 60, shootTimer: 1 + RM.rand() * 2, dead: false });
    }
  };
  MissionManager.prototype.clearEnemies = function () {
    for (var i = 0; i < RM.enemies.length; i++) RM.scene.remove(RM.enemies[i].mesh);
    RM.enemies = [];
  };
  MissionManager.prototype.setBeacon = function (target) {
    if (this.beacon) { RM.scene.remove(this.beacon); this.beacon = null; }
    if (!target) return;
    var g = new THREE.Group();
    var cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 3.2, 60, 14, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })
    );
    cyl.position.y = 30; g.add(cyl);
    var cone = new THREE.Mesh(new THREE.ConeGeometry(2.6, 5, 4), new THREE.MeshBasicMaterial({ color: 0xffd166 }));
    cone.position.y = 63; cone.rotation.x = Math.PI; g.add(cone);
    var ring = new THREE.Mesh(new THREE.TorusGeometry(4, 0.35, 8, 24), new THREE.MeshBasicMaterial({ color: 0xffd166 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.3; g.add(ring);
    g.position.set(target.x, 0, target.z);
    g.userData.cone = cone;
    RM.scene.add(g);
    this.beacon = g;
  };
  MissionManager.prototype.targetNow = function () {
    if (!this.state) return null;
    var m = this.state.mission;
    if ((m.kind === 'collect') && this.state.collected && m.secondTarget) return m.secondTarget;
    return m.target;
  };
  MissionManager.prototype.onEvent = function (ev) {
    var s = this.state;
    if (!s || s.done) return;
    if (ev === 'steal' && s.mission.kind === 'steal') {
      s.stage = 1;
      if (RM.hud) RM.hud.toast('Car stolen — now deliver it to the garage.', 2600);
    }
  };
  MissionManager.prototype.complete = function () {
    var s = this.state;
    if (!s || s.done) return;
    s.done = true;
    var m = s.mission;
    RM.state.cash += m.reward;
    RM.state.missionsDone++;
    if (RM.audio) RM.audio.cash();
    if (RM.hud) RM.hud.toast('JOB COMPLETE · ' + m.title + ' — +$' + m.reward.toLocaleString(), 4200);
    this.setBeacon(null);
    this.clearEnemies();
    RM.state.missionActive = false;
    if (RM.saveGame) RM.saveGame();
    var next = this.index + 1;
    var self = this;
    setTimeout(function () { self.start(next); }, 2500);
  };
  MissionManager.prototype.fail = function (reason) {
    var s = this.state;
    if (!s || s.done) return;
    s.failed = true;
    if (RM.hud) RM.hud.toast('JOB FAILED — ' + reason + ' Try again: the job restarts.', 4200);
    var self = this;
    setTimeout(function () { self.start(self.index); }, 2000);
  };
  MissionManager.prototype.update = function (dt) {
    var s = this.state;
    if (!s || s.done) return;
    var p = RM.player;
    if (s.timer > 0) {
      s.timer -= dt;
      if (s.timer <= 0) { this.fail('Out of time.'); return; }
    }
    var t = this.targetNow();
    var d = Math.sqrt(RM.dist2(p.x, p.z, t.x, t.z));
    var m = s.mission;
    if (this.beacon) {
      this.beacon.userData.cone.rotation.y += dt * 3;
      this.beacon.position.y = Math.sin(RM.state.time * 2) * 0.4;
    }
    if (m.kind === 'goto') {
      if (d < 14) this.complete();
    } else if (m.kind === 'steal') {
      if (s.stage === 1 && RM.state.mode === 'car' && d < 14) this.complete();
    } else if (m.kind === 'collect') {
      if (!s.collected && d < 12) {
        s.collected = true;
        if (RM.audio) RM.audio.pickup();
        if (RM.policeMgr) RM.policeMgr.setWanted(m.id === 4 ? 3 : 4);
        if (RM.hud) RM.hud.toast(m.id === 4 ? 'Case secured! Lose the heat at the Motel.' : 'Ledger secured! Deliver it to Ilsa.', 3600);
        this.setBeacon(m.secondTarget);
      } else if (s.collected && d < 14) {
        this.complete();
      }
    }
  };
  MissionManager.prototype.progressText = function () {
    var s = this.state;
    if (!s) return '';
    if (s.timer > 0) return Math.ceil(s.timer) + 's left';
    if (s.mission.kind === 'collect') return s.collected ? 'Package secured — reach the marker!' : 'Go to the marker and grab it';
    if (s.mission.kind === 'steal') return s.stage === 1 ? 'Stolen car — deliver it to the garage' : 'Steal a parked car (E)';
    return '';
  };

  RM.MISSIONS = MISSIONS;
  RM.MissionManager = MissionManager;
  RM.missionListText = function (current) {
    return MISSIONS.map(function (m, i) {
      var st = i < current ? '✓ DONE' : i === current ? '▶ NEXT' : '· LOCKED';
      return '<b>' + m.id + '. ' + m.title + '</b> — ' + st + ' · $' + m.reward.toLocaleString() + ' · ' + m.giver;
    }).join('<br>');
  };
})();

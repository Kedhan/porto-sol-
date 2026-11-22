// Red Mesa Heat — police.js
// The Red Mesa PD: wanted stars, heat, pursuit cars that ram the player,
// and a helicopter that circles at 4-5 stars.
(function () {
  'use strict';
  var THREE = window.THREE;

  function PoliceManager() {
    this.wanted = 0; this.heat = 0;
    this.cars = []; this.spawnTimer = 0; this.calmTimer = 0;
    this.heli = null; this.heliAngle = 0;
    RM.police = this.cars;
  }
  PoliceManager.prototype.addHeat = function (n) {
    this.heat = RM.clamp(this.heat + n, 0, 100);
    var w = this.heat < 8 ? 0 : this.heat < 22 ? 1 : this.heat < 40 ? 2 : this.heat < 60 ? 3 : this.heat < 82 ? 4 : 5;
    if (w !== this.wanted) {
      this.wanted = w;
      RM.state.wanted = w;
      if (w > 0 && RM.hud) RM.hud.toast('WANTED LEVEL ' + w + ' — RMPD is on you!', 2600);
    }
  };
  PoliceManager.prototype.setWanted = function (stars) {
    this.heat = stars === 0 ? 0 : [0, 12, 28, 48, 68, 88][stars];
    this.wanted = stars; RM.state.wanted = stars;
  };
  PoliceManager.prototype.wantedStars = function () {
    return '★'.repeat(this.wanted) + '☆'.repeat(5 - this.wanted);
  };
  PoliceManager.prototype.spawnOne = function (nearX, nearZ) {
    var p = RM.player;
    var a = RM.rng() * Math.PI * 2;
    var x = (nearX !== undefined ? nearX : p.x) + Math.sin(a) * 70;
    var z = (nearZ !== undefined ? nearZ : p.z) + Math.cos(a) * 70;
    x = RM.clamp(x, -440, 440); z = RM.clamp(z, -440, 440);
    var c = RM.makeCar(x, z, a, { police: true });
    c.speed = 12;
    this.cars.push(c);
    RM.police = this.cars;
    return c;
  };
  PoliceManager.prototype.update = function (dt) {
    var p = RM.player;
    // Heat cools when the player stays clean.
    this.calmTimer += dt;
    if (this.calmTimer > 1) {
      this.calmTimer = 0;
      if (this.wanted > 0) {
        this.heat = Math.max(0, this.heat - 0.8);
        var w = this.heat < 8 ? 0 : this.heat < 22 ? 1 : this.heat < 40 ? 2 : this.heat < 60 ? 3 : this.heat < 82 ? 4 : 5;
        this.wanted = w; RM.state.wanted = w;
      }
    }
    var want = this.wanted === 0 ? 0 : this.wanted + 1;
    this.spawnTimer -= dt;
    if (this.cars.length < want && this.spawnTimer <= 0) {
      this.spawnTimer = 1.4;
      this.spawnOne();
    }
    // Pursuit: steer toward the player, ram, slow them down.
    for (var i = 0; i < this.cars.length; i++) {
      var car = this.cars[i];
      var target = Math.atan2(p.x - car.x, p.z - car.z);
      car.heading = RM.angleLerp(car.heading, target, 2.0 * dt);
      var cruise = 20 + this.wanted * 2.2;
      car.speed += (cruise - car.speed) * 0.6 * dt;
      var nx = car.x + Math.sin(car.heading) * car.speed * dt;
      var nz = car.z + Math.cos(car.heading) * car.speed * dt;
      var pos = { x: nx, z: nz };
      if (!RM.resolveCollision(pos, 2.2)) { car.x = nx; car.z = nz; }
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
      // flashing light bar
      if (car.mesh.userData.lightBar) {
        car.mesh.userData.lightBar.visible = (Math.floor(RM.state.time * 6) % 2 === 0);
      }
      var d = Math.sqrt(RM.dist2(p.x, p.z, car.x, car.z));
      if (d < 4.2) {
        if (RM.state.mode === 'car' && RM.car) {
          RM.car.speed *= 0.55;
          RM.state.carHealth = Math.max(0, RM.state.carHealth - 6 * dt * 10);
          if (RM.audio) RM.audio.crash();
        } else {
          RM.state.health = Math.max(0, RM.state.health - 14 * dt * 4);
        }
        car.speed *= 0.5;
      }
      if (d > 600) car.dead = true;
    }
    this.cars = this.cars.filter(function (c) {
      if (c.dead) { RM.scene.remove(c.mesh); return false; }
      return true;
    });
    RM.police = this.cars;
    if (RM.audio) RM.audio.siren(this.wanted > 0);
    this.updateHeli(dt);
  };
  PoliceManager.prototype.updateHeli = function (dt) {
    var p = RM.player;
    if (this.wanted >= 4) {
      if (!this.heli) {
        var g = new THREE.Group();
        var body = new THREE.Mesh(new THREE.BoxGeometry(3, 1.4, 5), new THREE.MeshLambertMaterial({ color: 0x1a1a2e }));
        g.add(body);
        var tail = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 4), new THREE.MeshLambertMaterial({ color: 0x1a1a2e }));
        tail.position.set(0, 0.2, -4); g.add(tail);
        var rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.12, 0.7), new THREE.MeshLambertMaterial({ color: 0x333333 }));
        rotor.position.y = 1.1; g.add(rotor);
        g.userData.rotor = rotor;
        var cone = new THREE.Mesh(new THREE.ConeGeometry(7, 55, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }));
        cone.position.y = -28; cone.rotation.x = Math.PI; g.add(cone);
        RM.scene.add(g);
        this.heli = g;
        RM.heli = g;
      }
      this.heliAngle += dt * 0.45;
      this.heli.position.set(p.x + Math.sin(this.heliAngle) * 26, 58, p.z + Math.cos(this.heliAngle) * 26);
      this.heli.rotation.y = this.heliAngle + Math.PI / 2;
      this.heli.userData.rotor.rotation.y += dt * 22;
      this.heli.visible = true;
    } else if (this.heli) {
      this.heli.visible = false;
    }
  };
  PoliceManager.prototype.clear = function () {
    for (var i = 0; i < this.cars.length; i++) RM.scene.remove(this.cars[i].mesh);
    this.cars = []; RM.police = [];
    this.wanted = 0; this.heat = 0; RM.state.wanted = 0;
    if (this.heli) this.heli.visible = false;
    if (RM.audio) RM.audio.siren(false);
  };

  RM.PoliceManager = PoliceManager;
})();

// police.js — the long arm of Red Mesa: heat, stars, pursuit and the chopper.
// Own design: heat is a 0..100 meter that cools off only when Rook keeps his
// nose clean for a while; each star level asks for one more patrol car, and
// the helicopter only bothers showing up at four stars and above.

(function () {
  var THRESHOLDS = [10, 25, 45, 65, 85];
  var HALF = RM.MAP / 2;

  function turnToward(current, target, maxStep) {
    var d = target - current;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) <= maxStep) return target;
    return current + Math.sign(d) * maxStep;
  }

  function dist2D(a, b) {
    var dx = a.x - b.x, dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  function buildHeli() {
    var g = new THREE.Group();
    var bodyMat = new THREE.MeshLambertMaterial({ color: 0x22242e });
    var body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.3, 4.4), bodyMat);
    var nose = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.0, 1.2),
      new THREE.MeshLambertMaterial({ color: 0x3a3f52 }));
    nose.position.set(0, -0.1, 2.6);
    var tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 3.6), bodyMat);
    tail.position.set(0, 0.2, -3.8);
    var fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.4, 0.9), bodyMat);
    fin.position.set(0, 0.8, -5.4);
    var rotor = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.08, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x111111 }));
    rotor.position.y = 0.9;
    var tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.8, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x111111 }));
    tailRotor.position.set(0.35, 0.4, -5.2);
    var cone = new THREE.Mesh(
      new THREE.ConeGeometry(7, 34, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.16,
        side: THREE.DoubleSide, depthWrite: false }));
    cone.rotation.x = Math.PI;
    cone.position.y = -17.5;
    g.add(body, nose, tail, fin, rotor, tailRotor, cone);
    return { group: g, rotor: rotor, tailRotor: tailRotor, cone: cone, angle: RM.rand(0, Math.PI * 2) };
  }

  RM.PoliceManager = function () {
    this.heat = 0;
    this.lastCrimeAt = -100;
    this.bustT = 0;
    this.flashT = 0;
    this.heli = null;
  };

  RM.PoliceManager.prototype.wantedStars = function () {
    var s = 0;
    for (var i = 0; i < THRESHOLDS.length; i++) {
      if (this.heat >= THRESHOLDS[i]) s = i + 1;
    }
    return s;
  };

  RM.PoliceManager.prototype.setWanted = function (stars) {
    stars = RM.clamp(stars, 0, 5);
    this.heat = stars === 0 ? 0 : THRESHOLDS[stars - 1];
    RM.state.heat = this.heat;
    RM.state.wanted = stars;
    this.lastCrimeAt = RM.state.time;
  };

  RM.PoliceManager.prototype.addHeat = function (n) {
    this.heat = RM.clamp(this.heat + n, 0, 100);
    this.lastCrimeAt = RM.state.time;
    RM.state.heat = this.heat;
    RM.state.wanted = this.wantedStars();
  };

  RM.PoliceManager.prototype.desiredCars = function () {
    return [0, 1, 2, 3, 4, 5][this.wantedStars()];
  };

  RM.PoliceManager.prototype.spawnOne = function () {
    var target = this.playerPosition();
    if (!target) return;
    var a = RM.rand(0, Math.PI * 2);
    var x = target.x + Math.cos(a) * 70;
    var z = target.z + Math.sin(a) * 70;
    // Snap onto the nearest road so the cruiser never spawns inside a block.
    x = Math.round(x / RM.ROAD_STEP) * RM.ROAD_STEP;
    z = Math.round(z / RM.ROAD_STEP) * RM.ROAD_STEP;
    x = RM.clamp(x, -HALF + 15, HALF - 15);
    z = RM.clamp(z, -HALF + 15, HALF - 15);
    var car = RM.makeCar(0xf2f2f2, { police: true });
    car.group.position.set(x, 0, z);
    car.heading = Math.atan2(target.x - x, target.z - z);
    car.hp = 100;
    car.ramCd = 0;
    car.isPolice = true;
    RM.scene.add(car.group);
    RM.policeCars.push(car);
    if (RM.audio) RM.audio.sfx('siren-blip');
  };

  RM.PoliceManager.prototype.playerPosition = function () {
    if (RM.state.mode === 'car' && RM.car) return RM.car.group.position;
    if (RM.player) return RM.player.group.position;
    return null;
  };

  RM.PoliceManager.prototype.removeCar = function (car) {
    RM.scene.remove(car.group);
    var i = RM.policeCars.indexOf(car);
    if (i >= 0) RM.policeCars.splice(i, 1);
  };

  RM.PoliceManager.prototype.updateHeli = function (dt, stars) {
    var target = this.playerPosition();
    if (stars >= 4 && target && !RM.state.over) {
      if (!this.heli) {
        this.heli = buildHeli();
        RM.scene.add(this.heli.group);
        RM.heli = this.heli;
      }
      var h = this.heli;
      h.angle += dt * 0.45;
      h.group.position.set(
        target.x + Math.cos(h.angle) * 26,
        34,
        target.z + Math.sin(h.angle) * 26);
      h.rotor.rotation.y += dt * 22;
      h.tailRotor.rotation.x += dt * 30;
      h.group.lookAt(target.x, 0, target.z);
      h.cone.lookAt(target.x, 0, target.z);
    } else if (this.heli) {
      RM.scene.remove(this.heli.group);
      this.heli = null;
      RM.heli = null;
    }
  };

  RM.PoliceManager.prototype.flashLightBars = function (dt) {
    this.flashT += dt;
    var on = Math.floor(this.flashT * 7) % 2 === 0;
    for (var i = 0; i < RM.policeCars.length; i++) {
      var bar = RM.policeCars[i].lightBar;
      if (!bar || !bar.children || bar.children.length < 2) continue;
      var red = bar.children[0], blue = bar.children[1];
      if (red.material && red.material.emissive) {
        red.material.emissive.setHex(on ? 0xff0000 : 0x220000);
        blue.material.emissive.setHex(on ? 0x000022 : 0x0000ff);
      } else {
        red.visible = on;
        blue.visible = !on;
      }
    }
  };

  RM.PoliceManager.prototype.update = function (dt) {
    if (!RM.state.started || RM.state.over) {
      this.updateHeli(dt, 0);
      return;
    }
    // Cool off after ten quiet seconds.
    if (RM.state.time - this.lastCrimeAt > 10 && this.heat > 0) {
      this.heat = Math.max(0, this.heat - 2 * dt);
      RM.state.heat = this.heat;
      RM.state.wanted = this.wantedStars();
    }
    var stars = this.wantedStars();
    var target = this.playerPosition();
    if (!target) return;

    // Keep the street full: one more cruiser per star, cull the extras.
    var want = this.desiredCars();
    while (RM.policeCars.length < want) this.spawnOne();
    while (RM.policeCars.length > want) {
      var far = RM.policeCars[0], farD = -1;
      for (var i = 0; i < RM.policeCars.length; i++) {
        var d = dist2D(RM.policeCars[i].group.position, target);
        if (d > farD) { farD = d; far = RM.policeCars[i]; }
      }
      this.removeCar(far);
    }

    var cruise = 17 + 2.4 * stars;
    var nearest = Infinity;
    for (var j = 0; j < RM.policeCars.length; j++) {
      var car = RM.policeCars[j];
      if (car.disabled) continue;
      var p = car.group.position;
      var dx = target.x - p.x, dz = target.z - p.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      if (d < nearest) nearest = d;
      var wantHeading = Math.atan2(dx, dz);
      var sharp = Math.abs(wantHeading - car.heading);
      car.heading = turnToward(car.heading, wantHeading, dt * 2.4);
      var goal = d > 6 ? cruise : cruise * 0.5;
      if (sharp > 1.2) goal *= 0.55;
      car.speed = RM.lerp(car.speed, goal, RM.clamp01(dt * 2));
      if (typeof RM.updateTrafficCar === 'function') {
        RM.updateTrafficCar(car, dt);
      } else {
        p.x += Math.sin(car.heading) * car.speed * dt;
        p.z += Math.cos(car.heading) * car.speed * dt;
        car.group.rotation.y = car.heading;
      }
      var fixed = RM.resolveCollision ? RM.resolveCollision(p.x, p.z, 1.4) : { x: p.x, z: p.z };
      p.x = fixed.x; p.z = fixed.z;
      if (car.ramCd > 0) car.ramCd -= dt;

      // Ramming: a cruiser that touches Rook hurts him (or his car).
      if (d < 3.4 && car.ramCd <= 0) {
        car.ramCd = 0.9;
        car.speed *= 0.4;
        if (RM.state.mode === 'car') {
          RM.state.carHealth = Math.max(0, RM.state.carHealth - 9);
          if (RM.hud) RM.hud.toast('Ram! Car is taking damage.');
        } else {
          RM.state.health = Math.max(0, RM.state.health - 12);
          this.bustT += 0.6;
          if (RM.hud) RM.hud.toast('The cops are on you — run!');
        }
        if (RM.audio) RM.audio.sfx('crash');
      }
    }

    // Busted: cornered on foot, or the ride gave out under a wanted level.
    if (RM.state.mode === 'foot' && nearest < 2.5) {
      this.bustT += dt;
    } else {
      this.bustT = Math.max(0, this.bustT - dt * 2);
    }
    if (this.bustT > 2 || (RM.state.mode === 'car' && RM.state.carHealth <= 0 && stars > 0)) {
      RM.state.busted = true;
      RM.state.over = true;
      if (RM.audio) RM.audio.sfx('busted');
    }
    if (RM.state.health <= 0) {
      RM.state.over = true;
    }

    this.flashLightBars(dt);
    this.updateHeli(dt, stars);
  };

  RM.PoliceManager.prototype.clear = function () {
    while (RM.policeCars.length) this.removeCar(RM.policeCars[0]);
    if (this.heli) {
      RM.scene.remove(this.heli.group);
      this.heli = null;
      RM.heli = null;
    }
    this.heat = 0;
    this.bustT = 0;
    RM.state.heat = 0;
    RM.state.wanted = 0;
  };
})();

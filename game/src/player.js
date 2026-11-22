// player.js — Rook Calloway on foot, in a car, and shooting, for Red Mesa Heat.
// Own design: camera-relative WASD with a smooth-turning hero, a chase camera
// that swings behind the car, and a hitscan pistol with a tracer and a
// muzzle flash. E steps in and out of the nearest ride.

(function () {
  var HALF = RM.MAP / 2;
  var WALK = 5, SPRINT = 8.5;
  var _shootCd = 0;

  function turnToward(current, target, maxStep) {
    var d = target - current;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) <= maxStep) return target;
    return current + Math.sign(d) * maxStep;
  }

  RM.createPlayer = function () {
    var g = new THREE.Group();
    var denim = new THREE.MeshLambertMaterial({ color: 0x2e3440 });
    var jacket = new THREE.MeshLambertMaterial({ color: 0xa33b2e });
    var skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
    var leather = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });

    var legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.55, 0.22), denim);
    legL.position.set(-0.13, 0.28, 0);
    var legR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.55, 0.22), denim);
    legR.position.set(0.13, 0.28, 0);
    var torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.66, 0.32), jacket);
    torso.position.y = 0.88;
    var vest = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.34), leather);
    vest.position.y = 0.98;
    var head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.32), skin);
    head.position.y = 1.42;
    var brim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.05, 12), leather);
    brim.position.y = 1.6;
    var crown = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.2, 12), leather);
    crown.position.y = 1.7;
    var armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.18), jacket);
    armL.position.set(-0.38, 0.9, 0);
    var armR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.18), jacket);
    armR.position.set(0.38, 0.9, 0.1);
    var pistol = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.34),
      new THREE.MeshLambertMaterial({ color: 0x1c1c1c }));
    pistol.position.set(0.38, 0.62, 0.28);

    g.add(legL, legR, torso, vest, head, brim, crown, armL, armR, pistol);
    g.traverse(function (m) { if (m.isMesh) m.castShadow = true; });
    RM.scene.add(g);
    RM.player = {
      group: g, heading: 0, speed: 0, onFoot: true, walkPhase: 0,
      parts: { legL: legL, legR: legR, armR: armR, pistol: pistol, torso: torso }
    };
    return RM.player;
  };

  RM.updatePlayerOnFoot = function (dt) {
    var pl = RM.player;
    if (!pl || RM.state.mode !== 'foot') return;
    if (!RM.state.started || RM.state.paused || RM.state.over) return;
    var k = RM.keys;
    var fwdX = -Math.sin(RM.camYaw), fwdZ = -Math.cos(RM.camYaw);
    var rightX = Math.cos(RM.camYaw), rightZ = -Math.sin(RM.camYaw);
    var mx = 0, mz = 0;
    if (k.KeyW || k.ArrowUp) { mx += fwdX; mz += fwdZ; }
    if (k.KeyS || k.ArrowDown) { mx -= fwdX; mz -= fwdZ; }
    if (k.KeyA || k.ArrowLeft) { mx -= rightX; mz -= rightZ; }
    if (k.KeyD || k.ArrowRight) { mx += rightX; mz += rightZ; }
    var len = Math.sqrt(mx * mx + mz * mz);
    var sprinting = !!(k.ShiftLeft || k.ShiftRight);
    var top = sprinting ? SPRINT : WALK;
    if (len > 0.01) {
      mx /= len; mz /= len;
      var wantHeading = Math.atan2(mx, mz);
      pl.heading = turnToward(pl.heading, wantHeading, dt * 10);
      pl.speed = RM.lerp(pl.speed, top, RM.clamp01(dt * 8));
      var nx = pl.group.position.x + mx * pl.speed * dt;
      var nz = pl.group.position.z + mz * pl.speed * dt;
      var fixed = RM.resolveCollision ? RM.resolveCollision(nx, nz, 0.6) : { x: nx, z: nz };
      pl.group.position.x = RM.clamp(fixed.x, -HALF + 6, HALF - 6);
      pl.group.position.z = RM.clamp(fixed.z, -HALF + 6, HALF - 6);
      pl.walkPhase += pl.speed * dt * 1.7;
      var swing = Math.sin(pl.walkPhase) * 0.6;
      pl.parts.legL.rotation.x = swing;
      pl.parts.legR.rotation.x = -swing;
      pl.parts.torso.position.y = 0.88 + Math.abs(Math.sin(pl.walkPhase)) * 0.05;
    } else {
      pl.speed = RM.lerp(pl.speed, 0, RM.clamp01(dt * 10));
      pl.parts.legL.rotation.x *= 0.8;
      pl.parts.legR.rotation.x *= 0.8;
      pl.parts.torso.position.y = 0.88;
    }
    pl.group.rotation.y = pl.heading;
  };

  RM.updateCamera = function (dt) {
    if (!RM.camera || !RM.scene) return;
    var cam = RM.camera;
    var t = 1 - Math.exp(-7 * dt);
    var target = new THREE.Vector3();
    var eye = new THREE.Vector3();

    if (!RM.state.started) {
      // Title screen: slow orbit over the whole town.
      var a = RM.state.time * 0.05;
      eye.set(Math.cos(a) * 150, 55, Math.sin(a) * 150);
      target.set(0, 0, 0);
      cam.position.lerp(eye, RM.clamp01(dt * 2));
      cam.lookAt(target);
      return;
    }

    if (RM.state.mode === 'car' && RM.car) {
      var cp = RM.car.group.position;
      var fx = Math.sin(RM.car.heading), fz = Math.cos(RM.car.heading);
      eye.set(cp.x - fx * 11, 4.5 + RM.camPitch * 4, cp.z - fz * 11);
      target.set(cp.x + fx * 9, 1.6, cp.z + fz * 9);
    } else if (RM.player) {
      var pp = RM.player.group.position;
      var back = 5.5;
      eye.set(pp.x + Math.sin(RM.camYaw) * back, 2.5 + RM.camPitch * 2.5,
              pp.z + Math.cos(RM.camYaw) * back);
      target.set(pp.x - Math.sin(RM.camYaw) * 2, 1.6, pp.z - Math.cos(RM.camYaw) * 2);
    } else {
      return;
    }
    cam.position.lerp(eye, t);
    cam.lookAt(target);
  };

  function nearestCar(maxDist) {
    var best = null, bestD = maxDist;
    var pp = RM.player.group.position;
    for (var i = 0; i < RM.cars.length; i++) {
      var c = RM.cars[i];
      if (!c.group || c.disabled) continue;
      var dx = c.group.position.x - pp.x;
      var dz = c.group.position.z - pp.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      if (d < bestD) { best = c; bestD = d; }
    }
    return best;
  }

  RM.tryEnterExit = function () {
    if (!RM.state.started || RM.state.paused || RM.state.over) return;
    if (RM.state.mode === 'car' && RM.car) {
      var car = RM.car;
      var rx = Math.cos(car.heading), rz = -Math.sin(car.heading);
      RM.player.group.position.set(
        car.group.position.x + rx * 2.4, 0,
        car.group.position.z + rz * 2.4);
      RM.player.group.visible = true;
      RM.player.heading = car.heading;
      RM.player.group.rotation.y = car.heading;
      car.isPlayerDriven = false;
      RM.car = null;
      RM.state.mode = 'foot';
      RM.state.speed = 0;
      if (RM.hud) RM.hud.toast('On foot. Watch the streets.');
      return;
    }
    if (RM.state.mode !== 'foot' || !RM.player) return;
    var target = nearestCar(4.5);
    if (!target) {
      if (RM.hud) RM.hud.toast('No car close enough — get nearer to a ride.');
      return;
    }
    var wasParked = !!target.parked;
    var wasTraffic = RM.trafficCars.indexOf(target) >= 0;
    RM.car = target;
    target.parked = false;
    target.isPlayerDriven = true;
    target.speed = 0;
    RM.player.group.visible = false;
    RM.state.mode = 'car';
    RM.state.carHealth = (target.health !== undefined) ? target.health : 100;
    if (wasParked || wasTraffic) {
      RM.state.carsStolen++;
      var heat = target.isPolice ? 20 : 10;
      if (RM.policeMgr) RM.policeMgr.addHeat(heat);
      if (RM.missionMgr) RM.missionMgr.onEvent('steal');
      if (RM.hud) RM.hud.toast(target.isPolice ? 'You stole a cop car?! Bold.' : 'Car taken. Ilsa will be proud.');
      if (RM.audio) RM.audio.sfx('steal');
    }
  };

  // ------------------------------------------------------------- pistol

  var _ray = null;

  function gunTipWorld() {
    var tip = new THREE.Vector3(0.38, 0.62, 0.45);
    return RM.player.group.localToWorld(tip);
  }

  function spawnTracer(from, to) {
    var geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    var line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe08a }));
    RM.scene.add(line);
    setTimeout(function () { RM.scene.remove(line); geo.dispose(); }, 70);
    var flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd24a }));
    flash.position.copy(from);
    RM.scene.add(flash);
    setTimeout(function () { RM.scene.remove(flash); }, 50);
  }

  RM.playerShoot = function () {
    if (!RM.state.started || RM.state.paused || RM.state.over) return;
    if (!RM.player || !RM.camera) return;
    if (_shootCd > 0) return;
    _shootCd = 0.25;
    setTimeout(function () { _shootCd = 0; }, 250);
    if (!_ray) _ray = new THREE.Raycaster();
    _ray.setFromCamera({ x: 0, y: 0 }, RM.camera);
    _ray.far = 80;

    var targets = [];
    var owners = [];
    var i, j;
    for (i = 0; i < RM.policeCars.length; i++) {
      var pc = RM.policeCars[i];
      if (pc.group && !pc.disabled) { targets.push(pc.group); owners.push({ kind: 'cop', ref: pc }); }
    }
    if (Array.isArray(RM.enemies)) {
      for (j = 0; j < RM.enemies.length; j++) {
        var en = RM.enemies[j];
        if (en.group && en.hp > 0) { targets.push(en.group); owners.push({ kind: 'enemy', ref: en }); }
      }
    }
    var from = gunTipWorld();
    var end = _ray.ray.at(70, new THREE.Vector3());
    var hits = targets.length ? _ray.intersectObjects(targets, true) : [];
    if (hits.length) {
      var hit = hits[0];
      end = hit.point.clone();
      // Walk up to the group that owns the mesh we hit.
      var node = hit.object, owner = null;
      while (node && !owner) {
        for (var k = 0; k < owners.length; k++) {
          if (owners[k].ref.group === node) { owner = owners[k]; break; }
        }
        node = node.parent;
      }
      if (owner) {
        owner.ref.hp = (owner.ref.hp === undefined ? 100 : owner.ref.hp) - 34;
        if (owner.ref.hp <= 0) {
          if (owner.kind === 'cop') {
            owner.ref.disabled = true;
            owner.ref.speed = 0;
            owner.ref.group.rotation.z = 0.12;
            RM.state.kills++;
            if (RM.policeMgr) RM.policeMgr.addHeat(6);
            if (RM.hud) RM.hud.toast('Cop car disabled.');
          } else {
            RM.state.kills++;
            if (RM.missionMgr) RM.missionMgr.onEvent('kill');
            RM.scene.remove(owner.ref.group);
            var idx = RM.enemies.indexOf(owner.ref);
            if (idx >= 0) RM.enemies.splice(idx, 1);
            if (RM.hud) RM.hud.toast('Target down.');
          }
        }
      }
    }
    spawnTracer(from, end);
    if (RM.audio) RM.audio.sfx('gunshot');
  };
})();

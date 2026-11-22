// traffic.js — street traffic and sidewalk crowds for Red Mesa Heat.
// Own design: cars pick a new direction at every crossroads, brake for the
// vehicle ahead and for the player's car; pedestrians stroll the sidewalks,
// freeze at corners, and scatter when a fast car bears down on them.

(function () {
  var GRID = RM.ROAD_STEP;
  var HALF = RM.MAP / 2;

  function snapToGrid(v) { return Math.round(v / GRID) * GRID; }

  function angleDiff(a, b) {
    var d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function ensureCarFields(car) {
    if (car.cruise !== undefined) return;
    car.cruise = RM.rand(9, 14);
    car.turnX = null;
    car.turnZ = null;
    car.waitT = 0;
    car.blocked = false;
  }

  function carAhead(car, list, maxDist) {
    var fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    var best = null, bestD = maxDist;
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (o === car || o.disabled) continue;
      var dx = o.group.position.x - car.group.position.x;
      var dz = o.group.position.z - car.group.position.z;
      var along = dx * fx + dz * fz;
      if (along < 0 || along > bestD) continue;
      var side = Math.abs(dx * fz - dz * fx);
      if (side < 2.6 && along < bestD) { best = o; bestD = along; }
    }
    return best ? { car: best, dist: bestD } : null;
  }

  function atCrossroads(car) {
    var gx = snapToGrid(car.group.position.x);
    var gz = snapToGrid(car.group.position.z);
    return Math.abs(car.group.position.x - gx) < 5 &&
           Math.abs(car.group.position.z - gz) < 5;
  }

  RM.updateTraffic = function (dt) {
    var i, car;
    for (i = 0; i < RM.trafficCars.length; i++) {
      car = RM.trafficCars[i];
      if (!car.group || car.disabled) continue;
      ensureCarFields(car);
      var p = car.group.position;

      // Choose a fresh direction each time we roll through a crossroads.
      if (atCrossroads(car) && (car.turnX !== snapToGrid(p.x) || car.turnZ !== snapToGrid(p.z))) {
        car.turnX = snapToGrid(p.x);
        car.turnZ = snapToGrid(p.z);
        var roll = RM.rng();
        if (roll < 0.3) car.heading += Math.PI / 2;
        else if (roll < 0.6) car.heading -= Math.PI / 2;
        // else keep going straight
      }

      // Brake for the car ahead, and for the player's car cutting in.
      var ahead = carAhead(car, RM.trafficCars, 14) ||
                  carAhead(car, RM.policeCars, 14);
      var want = car.cruise;
      if (ahead) {
        want = ahead.dist < 5 ? 0 : Math.min(car.cruise, ahead.car.speed * 0.8);
      }
      if (RM.car && RM.state.mode === 'car') {
        var near = carAhead(car, [RM.car], 10);
        if (near) want = near.dist < 4 ? 0 : Math.min(want, 4);
      }
      car.speed = RM.lerp(car.speed, want, RM.clamp01(dt * 2.5));
      if (car.speed < 0.05 && want === 0) {
        car.waitT += dt;
        if (car.waitT > 4) { car.heading += Math.PI / 2; car.waitT = 0; }
      } else {
        car.waitT = 0;
      }

      if (typeof RM.updateTrafficCar === 'function') {
        RM.updateTrafficCar(car, dt);
      } else {
        p.x += Math.sin(car.heading) * car.speed * dt;
        p.z += Math.cos(car.heading) * car.speed * dt;
        car.group.rotation.y = car.heading;
      }

      // Keep them inside the city; turn them around at the edge.
      if (Math.abs(p.x) > HALF - 12 || Math.abs(p.z) > HALF - 12) {
        car.heading += Math.PI;
        p.x = RM.clamp(p.x, -HALF + 14, HALF - 14);
        p.z = RM.clamp(p.z, -HALF + 14, HALF - 14);
      }
    }
  };

  // ---------------------------------------------------------------- peds

  var SHIRT_TONES = [0x8a6f4d, 0x6b7a5e, 0x9c7a52, 0x74584a, 0x5e6b7a, 0xb08d57, 0x7a5a6e];
  var PANTS_TONES = [0x3a3f4a, 0x4a3b2e, 0x2e3a2e, 0x51402c];

  function buildPedFigure() {
    var g = new THREE.Group();
    var shirt = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.62, 0.28),
      new THREE.MeshLambertMaterial({ color: RM.pick(SHIRT_TONES) }));
    shirt.position.y = 0.95;
    var head = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.32, 0.3),
      new THREE.MeshLambertMaterial({ color: 0xd9a066 }));
    head.position.y = 1.45;
    var legL = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.62, 0.2),
      new THREE.MeshLambertMaterial({ color: RM.pick(PANTS_TONES) }));
    legL.position.set(-0.14, 0.31, 0);
    var legR = legL.clone();
    legR.position.x = 0.14;
    var hat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.34, 0.06, 10),
      new THREE.MeshLambertMaterial({ color: 0xc9a86a }));
    hat.position.y = 1.64;
    g.add(shirt, head, legL, legR, hat);
    g.userData.legs = [legL, legR];
    return g;
  }

  // Spawn helpers live in vehicles.js (RM.spawnPeds); if a session boots
  // without them, this file can still stock the sidewalks itself.
  RM.spawnPedsLocal = function (n) {
    var made = [];
    for (var i = 0; i < n; i++) {
      var g = buildPedFigure();
      var lane = RM.pick(RM.city.roads);
      var along = RM.rand(-HALF + 20, HALF - 20);
      var off = RM.ROAD_W / 2 + 1.6;
      if (lane.axis === 'x') {
        g.position.set(along, 0, lane.at + (RM.rng() < 0.5 ? off : -off));
      } else {
        g.position.set(lane.at + (RM.rng() < 0.5 ? off : -off), 0, along);
      }
      RM.scene.add(g);
      made.push({ group: g, heading: RM.rand(0, Math.PI * 2), speed: RM.rand(1.2, 2.2),
                  state: 'walk', timer: RM.rand(0, 4), phase: RM.rand(0, 6), lane: lane });
    }
    return made;
  };

  function ensurePedFields(ped) {
    if (ped.state !== undefined) return;
    ped.state = 'walk';
    ped.timer = RM.rand(0, 4);
    ped.phase = RM.rand(0, 6);
    ped.speed = ped.speed || 1.6;
  }

  RM.updatePeds = function (dt) {
    var playerCar = (RM.state.mode === 'car') ? RM.car : null;
    var playerPos = RM.player ? RM.player.group.position : null;
    for (var i = RM.peds.length - 1; i >= 0; i--) {
      var ped = RM.peds[i];
      if (!ped.group) continue;
      ensurePedFields(ped);
      var p = ped.group.position;
      ped.timer -= dt;

      // Hit by the player's car: down they go, and the law notices.
      if (playerCar && ped.state !== 'down') {
        var dx = p.x - playerCar.group.position.x;
        var dz = p.z - playerCar.group.position.z;
        var d = Math.sqrt(dx * dx + dz * dz);
        if (d < 1.5 && Math.abs(playerCar.speed) > 2) {
          ped.state = 'down';
          ped.timer = 6;
          ped.group.rotation.z = Math.PI / 2;
          ped.group.position.y = 0.35;
          if (RM.policeMgr) RM.policeMgr.addHeat(14);
          if (RM.hud) RM.hud.toast('Pedestrian hit! The heat is on.');
          continue;
        }
        // Scatter from a fast car bearing down.
        if (d < 13 && Math.abs(playerCar.speed) > 6 && ped.state !== 'flee') {
          ped.state = 'flee';
          ped.timer = 2.2;
          ped.heading = Math.atan2(dx, dz);
        }
      }

      if (ped.state === 'down') {
        if (ped.timer <= 0) {
          RM.scene.remove(ped.group);
          RM.peds.splice(i, 1);
        }
        continue;
      }

      if (ped.state === 'flee') {
        ped.speed = 7;
        if (ped.timer <= 0) { ped.state = 'walk'; ped.speed = RM.rand(1.2, 2.2); }
      } else if (ped.state === 'pause') {
        ped.speed = 0;
        if (ped.timer <= 0) {
          ped.state = 'walk';
          ped.heading += (RM.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
          ped.timer = RM.rand(4, 9);
        }
      } else {
        // Strolling: pause at a crossroads now and then.
        if (atCrossroads({ group: { position: p } }) && ped.timer <= 0 && RM.rng() < 0.4) {
          ped.state = 'pause';
          ped.timer = RM.rand(1.5, 3.5);
        }
      }

      if (ped.state !== 'pause') {
        p.x += Math.sin(ped.heading) * ped.speed * dt;
        p.z += Math.cos(ped.heading) * ped.speed * dt;
        ped.phase += ped.speed * dt * 3.2;
        var legs = ped.group.userData.legs;
        if (legs) {
          legs[0].rotation.x = Math.sin(ped.phase) * 0.55;
          legs[1].rotation.x = -Math.sin(ped.phase) * 0.55;
        }
      }
      ped.group.rotation.y = ped.heading;
      if (ped.group.rotation.z !== 0 && ped.state !== 'down') ped.group.rotation.z = 0;

      if (Math.abs(p.x) > HALF - 8 || Math.abs(p.z) > HALF - 8) {
        ped.heading += Math.PI;
        p.x = RM.clamp(p.x, -HALF + 10, HALF - 10);
        p.z = RM.clamp(p.z, -HALF + 10, HALF - 10);
      }
    }

    // On-foot Rook can bump a pedestrian aside without hurting them.
    if (playerPos && RM.state.mode === 'foot') {
      for (var j = 0; j < RM.peds.length; j++) {
        var q = RM.peds[j];
        if (q.state === 'down') continue;
        var ox = q.group.position.x - playerPos.x;
        var oz = q.group.position.z - playerPos.z;
        var od = Math.sqrt(ox * ox + oz * oz);
        if (od < 0.9 && od > 0.01) {
          q.group.position.x = playerPos.x + (ox / od) * 0.9;
          q.group.position.z = playerPos.z + (oz / od) * 0.9;
        }
      }
    }
  };
})();

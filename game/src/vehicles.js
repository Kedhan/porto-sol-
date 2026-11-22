'use strict';
/* Red Mesa Heat — vehicles, written fresh for round 3.
   Builds cars (sedan, pickup, police interceptor), parks them,
   runs traffic, and drives the player's car with simple arcade
   physics. Forward is +Z when heading is 0. */
(function () {
  var RM = window.RM;

  var TRAFFIC_PAINT = [0x7d9b6a, 0x6a8a9b, 0xc9b083, 0xa85f3c, 0x8a7f9b, 0x5e7d5a];
  var WHEEL_GEO = null;
  var WHEEL_MAT = null;

  function wheelGeo() {
    if (!WHEEL_GEO) {
      WHEEL_GEO = new THREE.CylinderGeometry(0.42, 0.42, 0.36, 12);
      WHEEL_MAT = new THREE.MeshLambertMaterial({ color: 0x1a1a1c });
    }
    return WHEEL_GEO;
  }

  /* opts: {police, pickup, name, x, z, heading, parked} */
  RM.makeCar = function (color, opts) {
    opts = opts || {};
    var group = new THREE.Group();
    var paint = new THREE.MeshLambertMaterial({ color: color });
    var glass = new THREE.MeshLambertMaterial({ color: 0x1e2a3a });
    var isPickup = !!opts.pickup;

    var body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.85, 4.4), paint);
    body.position.y = 0.75;
    group.add(body);

    if (isPickup) {
      var cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 1.5), glass);
      cab.position.set(0, 1.45, 0.9);
      group.add(cab);
      var bed = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 1.9), paint);
      bed.position.set(0, 1.25, -1.1);
      group.add(bed);
    } else {
      var cabin = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.75, 2.3), glass);
      cabin.position.set(0, 1.5, -0.25);
      group.add(cabin);
    }

    /* bumpers, headlights, taillights */
    var chrome = new THREE.MeshLambertMaterial({ color: 0x9a9aa2 });
    var front = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.28, 0.25), chrome);
    front.position.set(0, 0.55, 2.22);
    group.add(front);
    var rear = front.clone();
    rear.position.z = -2.22;
    group.add(rear);
    var lampMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
    [-0.65, 0.65].forEach(function (lx) {
      var lamp = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.1), lampMat);
      lamp.position.set(lx, 0.85, 2.24);
      group.add(lamp);
    });
    var tailMat = new THREE.MeshBasicMaterial({ color: 0xd21f2b });
    [-0.65, 0.65].forEach(function (lx) {
      var tl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.1), tailMat);
      tl.position.set(lx, 0.85, -2.24);
      group.add(tl);
    });

    /* wheels */
    var wheels = [];
    [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]].forEach(function (p) {
      var w = new THREE.Mesh(wheelGeo(), WHEEL_MAT);
      w.rotation.z = Math.PI / 2;
      w.position.set(p[0], 0.42, p[1]);
      group.add(w);
      wheels.push(w);
    });

    /* police light bar: two lamps the police module flashes */
    var lightBar = null;
    if (opts.police) {
      var barBase = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.18, 0.5),
        new THREE.MeshLambertMaterial({ color: 0x222226 }));
      barBase.position.set(0, 1.95, -0.25);
      group.add(barBase);
      var redMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
      var blueMat = new THREE.MeshBasicMaterial({ color: 0x2255ff });
      var red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.45), redMat);
      red.position.set(-0.32, 2.1, -0.25);
      group.add(red);
      var blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.45), blueMat);
      blue.position.set(0.32, 2.1, -0.25);
      group.add(blue);
      lightBar = { red: red, blue: blue, redMat: redMat, blueMat: blueMat, phase: 0 };
      var star = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.05),
        new THREE.MeshBasicMaterial({ color: 0xffffff }));
      star.position.set(0, 0.8, 2.26);
      group.add(star);
    }

    var car = {
      group: group,
      heading: opts.heading || 0,
      speed: 0,
      color: color,
      isPolice: !!opts.police,
      isPickup: isPickup,
      name: opts.name || 'Sedan',
      wheels: wheels,
      lightBar: lightBar,
      parked: !!opts.parked,
      target: null,
      turnCooldown: 0
    };
    group.position.set(opts.x || 0, 0, opts.z || 0);
    group.rotation.y = car.heading;
    return car;
  };

  function roadsideSpot() {
    var lines = [];
    for (var p = -180; p <= 180; p += RM.ROAD_STEP) lines.push(p);
    var horizontal = RM.rng() < 0.5;
    var line = RM.pick(lines);
    var along = RM.rand(-200, 200);
    var off = RM.pick([-10.5, 10.5]);
    if (horizontal) return { x: along, z: line + off, heading: RM.pick([0, Math.PI]) };
    return { x: line + off, z: along, heading: RM.pick([Math.PI / 2, -Math.PI / 2]) };
  }

  RM.spawnParked = function (n) {
    var names = ['Roadrunner', 'Dust Devil', 'Coyote Pickup', 'Sand Runner', 'Mesa Cruiser'];
    var paints = [0xf2c230, 0xe86a1f, 0x2e8a8a, 0x7d9b6a, 0xc9b083];
    for (var i = 0; i < n; i++) {
      var spot = roadsideSpot();
      var idx = i % names.length;
      var car = RM.makeCar(paints[idx], {
        name: names[idx],
        pickup: names[idx] === 'Coyote Pickup',
        x: spot.x, z: spot.z, heading: spot.heading, parked: true
      });
      RM.scene.add(car.group);
      RM.cars.push(car);
    }
  };

  RM.spawnTraffic = function (n) {
    for (var i = 0; i < n; i++) {
      var spot = roadsideSpot();
      var car = RM.makeCar(RM.pick(TRAFFIC_PAINT), {
        name: 'Traffic',
        x: spot.x, z: spot.z, heading: spot.heading, parked: false
      });
      car.speed = RM.rand(8, 14);
      RM.scene.add(car.group);
      RM.cars.push(car);
      RM.trafficCars.push(car);
    }
  };

  /* Simple pedestrians: a torso, head and legs, walking the sidewalks. */
  RM.spawnPeds = function (n) {
    var shirts = [0xd8d3c8, 0x7a9bb5, 0xc96a3a, 0x5e7d5a, 0xb55a6e];
    for (var i = 0; i < n; i++) {
      var spot = roadsideSpot();
      var g = new THREE.Group();
      var shirt = new THREE.MeshLambertMaterial({ color: RM.pick(shirts) });
      var torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.85, 0.34), shirt);
      torso.position.y = 1.15;
      g.add(torso);
      var head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8),
        new THREE.MeshLambertMaterial({ color: 0xd9a986 }));
      head.position.y = 1.85;
      g.add(head);
      var legMat = new THREE.MeshLambertMaterial({ color: 0x2e3442 });
      var legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.75, 0.22), legMat);
      legL.position.set(-0.16, 0.38, 0);
      g.add(legL);
      var legR = legL.clone();
      legR.position.x = 0.16;
      g.add(legR);
      g.position.set(spot.x, 0, spot.z);
      RM.scene.add(g);
      RM.peds.push({
        group: g, heading: spot.heading, speed: RM.rand(1.0, 1.7),
        walkPhase: RM.rand(0, 6), legL: legL, legR: legR, flee: false
      });
    }
  };

  /* Traffic cars follow the street grid; peds stroll and flee from cars. */
  RM.updateTraffic = function (dt) {
    RM.trafficCars.forEach(function (car) {
      RM.updateTrafficCar(car, dt);
    });
    var playerPos = null;
    if (RM.player) playerPos = RM.player.group.position;
    else if (RM.car) playerPos = RM.car.group.position;
    RM.peds.forEach(function (ped) {
      if (playerPos) {
        var d2 = RM.dist2(ped.group.position.x, ped.group.position.z, playerPos.x, playerPos.z);
        if (d2 < 100) ped.flee = true;
        else if (d2 > 400) ped.flee = false;
      }
      var sp = ped.flee ? ped.speed * 2.4 : ped.speed;
      ped.group.position.x += Math.sin(ped.heading) * sp * dt;
      ped.group.position.z += Math.cos(ped.heading) * sp * dt;
      ped.walkPhase += dt * (ped.flee ? 11 : 6);
      ped.legL.rotation.x = Math.sin(ped.walkPhase) * 0.55;
      ped.legR.rotation.x = -Math.sin(ped.walkPhase) * 0.55;
      ped.group.rotation.y = ped.heading;
      var p = ped.group.position;
      if (Math.abs(p.x) > RM.HALF - 8 || Math.abs(p.z) > RM.HALF - 8) {
        ped.heading += Math.PI;
      }
    });
  };

  /* One traffic car: drive to the next intersection, then pick a turn. */
  RM.updateTrafficCar = function (car, dt) {
    if (!car.target) {
      var gx = Math.round(car.group.position.x / RM.ROAD_STEP) * RM.ROAD_STEP;
      var gz = Math.round(car.group.position.z / RM.ROAD_STEP) * RM.ROAD_STEP;
      car.target = { x: gx, z: gz };
    }
    var pos = car.group.position;
    var dx = car.target.x - pos.x;
    var dz = car.target.z - pos.z;
    var dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 3) {
      var options = [];
      var tx = car.target.x, tz = car.target.z;
      if (tx + RM.ROAD_STEP <= 180) options.push({ x: tx + RM.ROAD_STEP, z: tz });
      if (tx - RM.ROAD_STEP >= -180) options.push({ x: tx - RM.ROAD_STEP, z: tz });
      if (tz + RM.ROAD_STEP <= 180) options.push({ x: tx, z: tz + RM.ROAD_STEP });
      if (tz - RM.ROAD_STEP >= -180) options.push({ x: tx, z: tz - RM.ROAD_STEP });
      car.target = RM.pick(options);
    }
    var want = Math.atan2(car.target.x - pos.x, car.target.z - pos.z);
    car.heading = RM.angleLerp(car.heading, want, RM.clamp01(dt * 3.2));
    pos.x += Math.sin(car.heading) * car.speed * dt;
    pos.z += Math.cos(car.heading) * car.speed * dt;
    var fixed = RM.resolveCollision(pos.x, pos.z, 2.4);
    pos.x = fixed.x;
    pos.z = fixed.z;
    car.group.position.set(pos.x, 0, pos.z);
    car.group.rotation.y = car.heading;
    car.wheels.forEach(function (w) { w.rotation.x += car.speed * dt * 1.4; });
  };

  /* Player car: arcade handling, steering weaker at speed, building hits. */
  RM.updatePlayerCar = function (car, dt) {
    var k = RM.keys;
    var up = !!(k['KeyW'] || k['ArrowUp']);
    var down = !!(k['KeyS'] || k['ArrowDown']);
    var left = !!(k['KeyA'] || k['ArrowLeft']);
    var right = !!(k['KeyD'] || k['ArrowRight']);
    var brake = !!k['Space'];

    if (up) car.speed += 15 * dt;
    if (down) car.speed -= (car.speed > 0.5 ? 22 : 9) * dt;
    if (brake) car.speed -= Math.sign(car.speed) * 26 * dt;
    if (!up && !down) car.speed -= Math.sign(car.speed) * 5 * dt;
    if (Math.abs(car.speed) < 0.25 && !up && !down) car.speed = 0;
    car.speed = RM.clamp(car.speed, -9, 34);

    var steerInput = (left ? 1 : 0) - (right ? 1 : 0);
    var grip = RM.clamp(Math.abs(car.speed) / 9, 0, 1) * (car.speed < 0 ? -1 : 1);
    car.heading += steerInput * 2.1 * grip * dt;

    var pos = car.group.position;
    pos.x += Math.sin(car.heading) * car.speed * dt;
    pos.z += Math.cos(car.heading) * car.speed * dt;
    var fixed = RM.resolveCollision(pos.x, pos.z, 2.4);
    if (fixed.x !== pos.x || fixed.z !== pos.z) {
      car.speed *= 0.55;
      if (RM.audio) RM.audio.sfx('crash');
      pos.x = fixed.x;
      pos.z = fixed.z;
    }
    pos.x = RM.clamp(pos.x, -RM.HALF + 6, RM.HALF - 6);
    pos.z = RM.clamp(pos.z, -RM.HALF + 6, RM.HALF - 6);

    /* gentle shove from traffic so cars do not ghost through each other */
    RM.trafficCars.forEach(function (other) {
      var op = other.group.position;
      var d2 = RM.dist2(pos.x, pos.z, op.x, op.z);
      if (d2 < 12 && d2 > 0.01) {
        car.speed *= 0.92;
        other.speed *= 0.9;
      }
    });

    car.group.position.set(pos.x, 0, pos.z);
    car.group.rotation.y = car.heading;
    car.wheels.forEach(function (w) { w.rotation.x += car.speed * dt * 1.4; });
    RM.state.speed = Math.abs(car.speed) * 3.6;
  };
})();

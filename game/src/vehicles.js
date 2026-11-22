// Red Mesa Heat — vehicles.js
// Car factory (low-poly three.js meshes) and arcade driving physics.
// Forward is +Z rotated by heading: forward = (sin h, 0, cos h).
(function () {
  'use strict';
  var THREE = window.THREE;

  var COLORS = [0xe74c3c, 0x3498db, 0xf1c40f, 0x9b59b6, 0x1abc9c, 0xe67e22, 0xecf0f1, 0x2ecc71, 0xff6b9d, 0xd97a2a, 0x2a9d8f];
  var MODELS = [
    { name: 'Sunset Coupe', max: 34, accel: 22 },
    { name: 'Mesa Sedan', max: 30, accel: 19 },
    { name: 'Desert Pickup', max: 28, accel: 18 },
    { name: 'Voss Cruiser', max: 38, accel: 24 },
    { name: 'Canyon Van', max: 25, accel: 15 }
  ];

  function makeCarMesh(color, opts) {
    opts = opts || {};
    var g = new THREE.Group();
    var bodyMat = new THREE.MeshLambertMaterial({ color: opts.police ? 0x1a1a2e : color });
    var body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.2), bodyMat);
    body.position.y = 0.62; g.add(body);
    var cabinMat = new THREE.MeshLambertMaterial({ color: opts.police ? 0xf0f0f0 : 0x2a2a30 });
    var cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.1), cabinMat);
    cabin.position.set(0, 1.18, -0.25); g.add(cabin);
    // windshield
    var glass = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.12), new THREE.MeshLambertMaterial({ color: 0xbfe8ff }));
    glass.position.set(0, 1.15, 0.85); glass.rotation.x = 0.35; g.add(glass);
    // wheels
    var wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 10);
    var wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]].forEach(function (p) {
      var w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2; w.position.set(p[0], 0.42, p[1]); g.add(w);
    });
    // headlights + taillights
    var hl = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.18, 0.1), new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
    hl.position.set(0, 0.62, 2.12); g.add(hl);
    var tl = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.18, 0.1), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    tl.position.set(0, 0.62, -2.12); g.add(tl);
    if (opts.police) {
      var stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.2, 4.22), new THREE.MeshLambertMaterial({ color: 0xf0f0f0 }));
      stripe.position.y = 0.72; g.add(stripe);
      var bar = new THREE.Group();
      var red = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      red.position.x = -0.4; bar.add(red);
      var blue = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0x2266ff }));
      blue.position.x = 0.4; bar.add(blue);
      bar.position.set(0, 1.58, -0.25); g.add(bar);
      g.userData.lightBar = bar;
      var txt = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.3, 0.1), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      txt.position.set(0, 0.9, 2.13); g.add(txt);
    }
    return g;
  }

  function makeCar(x, z, heading, opts) {
    opts = opts || {};
    var rnd = RM.mulberry32(((x | 0) * 31 + (z | 0) * 7) >>> 0);
    var model = opts.model || MODELS[Math.floor(rnd() * MODELS.length)];
    var color = opts.color !== undefined ? opts.color : COLORS[Math.floor(rnd() * COLORS.length)];
    var mesh = makeCarMesh(color, opts);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
    RM.scene.add(mesh);
    return {
      mesh: mesh, x: x, z: z, heading: heading, speed: 0,
      color: color, model: model, name: model.name,
      traffic: !!opts.traffic, police: !!opts.police, parked: !!opts.parked,
      axis: opts.axis || 'z', dir: opts.dir || 1, road: opts.road || 0,
      health: 100, dead: false, flash: 0
    };
  }

  function spawnParked(count) {
    var cars = [];
    var roads = RM.city.roads;
    for (var i = 0; i < count; i++) {
      var vertical = RM.rng() > 0.5;
      var road = roads[Math.floor(RM.rng() * roads.length)];
      var along = RM.rand(-360, 360);
      var x = vertical ? road + (RM.rng() > 0.5 ? 5.5 : -5.5) : along;
      var z = vertical ? along : road + (RM.rng() > 0.5 ? 5.5 : -5.5);
      var h = vertical ? (RM.rng() > 0.5 ? 0 : Math.PI) : (RM.rng() > 0.5 ? Math.PI / 2 : -Math.PI / 2);
      var c = makeCar(x, z, h, { parked: true });
      cars.push(c);
    }
    return cars;
  }

  function spawnTraffic(count) {
    var cars = [];
    var roads = RM.city.roads;
    for (var i = 0; i < count; i++) {
      var vertical = RM.rng() > 0.5;
      var road = roads[Math.floor(RM.rng() * roads.length)];
      var along = RM.rand(-360, 360);
      var dir = RM.rng() > 0.5 ? 1 : -1;
      var x = vertical ? road + dir * 3.2 : along;
      var z = vertical ? along : road + dir * 3.2;
      var h = vertical ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      var c = makeCar(x, z, h, { traffic: true, axis: vertical ? 'z' : 'x', dir: dir, road: road });
      c.speed = RM.rand(7, 13);
      cars.push(c);
    }
    return cars;
  }

  // Arcade player driving: W/S accelerate & brake, A/D steer by speed.
  function updatePlayerCar(car, input, dt) {
    var steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    var accel = (input.up ? 1 : 0) - (input.down ? 0.7 : 0);
    car.speed += accel * car.model.accel * dt * (input.boost ? 1.3 : 1);
    car.speed -= car.speed * 0.5 * dt;
    if (!input.up && !input.down) {
      car.speed -= Math.sign(car.speed) * 5 * dt;
      if (Math.abs(car.speed) < 0.6) car.speed = 0;
    }
    car.speed = RM.clamp(car.speed, -11, car.model.max);
    var steerAmt = steer * RM.clamp(Math.abs(car.speed) / 10, 0, 1) * 2.1 * dt * (car.speed < 0 ? -1 : 1);
    car.heading += steerAmt;
    var nx = car.x + Math.sin(car.heading) * car.speed * dt;
    var nz = car.z + Math.cos(car.heading) * car.speed * dt;
    var pos = { x: nx, z: nz };
    if (RM.resolveCollision(pos, 2.2)) {
      car.speed *= 0.45;
      if (Math.abs(car.speed) > 6 && RM.audio) RM.audio.crash();
      RM.state.carHealth = Math.max(0, RM.state.carHealth - 2);
    } else { car.x = nx; car.z = nz; }
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    // slight body roll into corners
    car.mesh.rotation.z = -steerAmt * 8;
    return car;
  }

  // Traffic: follow the road grid, turn at intersections sometimes.
  function updateTrafficCar(car, dt, others) {
    var roads = RM.city.roads;
    var onRoad = car.axis === 'z' ? car.x : car.z;
    var nearest = roads[0];
    for (var i = 0; i < roads.length; i++) if (Math.abs(roads[i] - onRoad) < Math.abs(nearest - onRoad)) nearest = roads[i];
    // snap gently back onto the road line
    if (car.axis === 'z') car.x += (nearest - car.x) * 0.04; else car.z += (nearest - car.z) * 0.04;
    // slow for the car ahead
    var slow = false;
    for (var j = 0; j < others.length; j++) {
      var o = others[j];
      if (o === car || o.dead) continue;
      var dx = o.x - car.x, dz = o.z - car.z, d = Math.sqrt(dx * dx + dz * dz);
      if (d < 9 && Math.sin(car.heading) * dx + Math.cos(car.heading) * dz > 0) { slow = true; break; }
    }
    var target = slow ? 0 : RM.rand(0, 0) + 10; // cruise ~10
    car.speed += (target - car.speed) * dt * 0.8;
    // random turn at an intersection
    var along = car.axis === 'z' ? car.z : car.x;
    var nearInter = false;
    for (var k = 0; k < roads.length; k++) if (Math.abs(along - roads[k]) < 2) { nearInter = true; break; }
    if (nearInter && Math.random() < 0.006) {
      car.axis = car.axis === 'z' ? 'x' : 'z';
      car.dir = Math.random() > 0.5 ? 1 : -1;
      car.heading = car.axis === 'z' ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    }
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    if (Math.abs(car.x) > 445 || Math.abs(car.z) > 445) {
      car.heading += Math.PI; car.dir *= -1;
      car.x = RM.clamp(car.x, -440, 440); car.z = RM.clamp(car.z, -440, 440);
    }
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
  }

  RM.makeCar = makeCar;
  RM.spawnParked = spawnParked;
  RM.spawnTraffic = spawnTraffic;
  RM.updatePlayerCar = updatePlayerCar;
  RM.updateTrafficCar = updateTrafficCar;
})();

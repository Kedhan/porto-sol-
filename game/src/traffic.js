// Red Mesa Heat — traffic.js
// Pedestrians on the sidewalks and the traffic manager that keeps
// the streets alive. Pedestrians flee from a speeding car.
(function () {
  'use strict';
  var THREE = window.THREE;

  var SHIRT = [0xe74c3c, 0x3498db, 0xf1c40f, 0x9b59b6, 0x1abc9c, 0xecf0f1, 0xff8c42];

  function makePedMesh(color) {
    var g = new THREE.Group();
    var torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.75, 0.34), new THREE.MeshLambertMaterial({ color: color }));
    torso.position.y = 1.05; g.add(torso);
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), new THREE.MeshLambertMaterial({ color: 0xe8b98a }));
    head.position.y = 1.68; g.add(head);
    var legMat = new THREE.MeshLambertMaterial({ color: 0x2b2b3a });
    var l1 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.7, 0.24), legMat);
    l1.position.set(-0.16, 0.35, 0); g.add(l1);
    var l2 = l1.clone(); l2.position.x = 0.16; g.add(l2);
    g.userData.leg1 = l1; g.userData.leg2 = l2;
    return g;
  }

  function spawnPeds(count) {
    var peds = [];
    var roads = RM.city.roads;
    for (var i = 0; i < count; i++) {
      var road = roads[Math.floor(RM.rng() * roads.length)];
      var vertical = RM.rng() > 0.5;
      var x = vertical ? road + (RM.rng() > 0.5 ? 9 : -9) : RM.rand(-360, 360);
      var z = vertical ? RM.rand(-360, 360) : road + (RM.rng() > 0.5 ? 9 : -9);
      var mesh = makePedMesh(SHIRT[Math.floor(RM.rng() * SHIRT.length)]);
      mesh.position.set(x, 0, z);
      RM.scene.add(mesh);
      peds.push({
        mesh: mesh, x: x, z: z,
        heading: RM.rand(0, Math.PI * 2), speed: RM.rand(1.2, 2.2),
        walkPhase: RM.rand(0, 6), flee: 0, dead: false
      });
    }
    return peds;
  }

  function updatePeds(peds, dt, playerPos, playerSpeed) {
    for (var i = 0; i < peds.length; i++) {
      var p = peds[i];
      if (p.dead) continue;
      var dx = p.x - playerPos.x, dz = p.z - playerPos.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      // Flee a fast car bearing down on them.
      if (d < 14 && Math.abs(playerSpeed) > 6) p.flee = 2.5;
      if (p.flee > 0) {
        p.flee -= dt;
        p.heading = Math.atan2(dx, dz);
        p.speed = 5.5;
      } else {
        p.speed = 1.6;
        if (Math.random() < 0.002) p.heading += (Math.random() - 0.5) * 2;
      }
      // Run over? A car hit at speed knocks them down and raises heat.
      if (d < 2.2 && Math.abs(playerSpeed) > 4 && RM.state.mode === 'car') {
        p.dead = true;
        p.mesh.visible = false;
        if (RM.policeMgr) RM.policeMgr.addHeat(14, 'pedestrian');
        if (RM.audio) RM.audio.crash();
        if (RM.hud) RM.hud.toast('Pedestrian down! The RMPD saw that.', 2600);
        continue;
      }
      p.x += Math.sin(p.heading) * p.speed * dt;
      p.z += Math.cos(p.heading) * p.speed * dt;
      if (Math.abs(p.x) > 445 || Math.abs(p.z) > 445) p.heading += Math.PI;
      var pos = { x: p.x, z: p.z };
      if (RM.resolveCollision(pos, 0.8)) { p.x = pos.x; p.z = pos.z; p.heading += Math.PI / 2; }
      p.walkPhase += dt * 8;
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = p.heading;
      var swing = Math.sin(p.walkPhase) * 0.5;
      p.mesh.userData.leg1.rotation.x = swing;
      p.mesh.userData.leg2.rotation.x = -swing;
    }
  }

  function updateTraffic(dt) {
    var all = RM.cars.concat(RM.parked).concat(RM.police);
    for (var i = 0; i < RM.cars.length; i++) {
      var c = RM.cars[i];
      if (c.dead) continue;
      RM.updateTrafficCar(c, dt, all);
    }
  }

  RM.spawnPeds = spawnPeds;
  RM.updatePeds = updatePeds;
  RM.updateTraffic = updateTraffic;
})();

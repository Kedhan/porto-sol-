// Red Mesa Heat — player.js
// Rook Calloway on foot: movement, third-person camera, and
// entering / exiting cars (E). Stealing a parked car raises the heat.
(function () {
  'use strict';
  var THREE = window.THREE;

  function makePlayerMesh() {
    var g = new THREE.Group();
    // jacket, jeans, boots, head — Rook in a rust-red jacket.
    var torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.78, 0.36), new THREE.MeshLambertMaterial({ color: 0xa83a2a }));
    torso.position.y = 1.08; g.add(torso);
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), new THREE.MeshLambertMaterial({ color: 0xe8b98a }));
    head.position.y = 1.72; g.add(head);
    var hair = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
    hair.position.y = 1.76; g.add(hair);
    var legMat = new THREE.MeshLambertMaterial({ color: 0x2b3a5a });
    var l1 = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.72, 0.26), legMat);
    l1.position.set(-0.17, 0.36, 0); g.add(l1);
    var l2 = l1.clone(); l2.position.x = 0.17; g.add(l2);
    // pistol in the right hand
    var gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.42), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    gun.position.set(0.38, 1.05, 0.3); g.add(gun);
    g.userData.leg1 = l1; g.userData.leg2 = l2;
    return g;
  }

  function createPlayer(x, z) {
    var mesh = makePlayerMesh();
    mesh.position.set(x, 0, z);
    RM.scene.add(mesh);
    var p = {
      mesh: mesh, x: x, z: z, heading: 0, speed: 0,
      walkPhase: 0, car: null, shootCooldown: 0, name: 'Rook Calloway'
    };
    RM.player = p;
    return p;
  }

  // On-foot movement, relative to the camera yaw.
  function updatePlayerOnFoot(p, input, dt) {
    var sprint = input.boost ? 1.6 : 1;
    var spd = 5.2 * sprint;
    var fwdX = Math.sin(RM.camYaw), fwdZ = Math.cos(RM.camYaw);
    var rightX = Math.cos(RM.camYaw), rightZ = -Math.sin(RM.camYaw);
    var mx = 0, mz = 0;
    if (input.up) { mx += fwdX; mz += fwdZ; }
    if (input.down) { mx -= fwdX; mz -= fwdZ; }
    if (input.right) { mx += rightX; mz += rightZ; }
    if (input.left) { mx -= rightX; mz -= rightZ; }
    var len = Math.sqrt(mx * mx + mz * mz);
    if (len > 0) {
      mx /= len; mz /= len;
      p.heading = Math.atan2(mx, mz);
      p.walkPhase += dt * 11;
      p.speed = spd;
    } else {
      p.speed = 0;
    }
    var nx = p.x + mx * spd * dt, nz = p.z + mz * spd * dt;
    var pos = { x: nx, z: nz };
    if (RM.resolveCollision(pos, 0.9)) { /* bumped a wall */ } else { p.x = nx; p.z = nz; }
    p.mesh.position.set(p.x, 0, p.z);
    p.mesh.rotation.y = p.heading;
    var swing = len > 0 ? Math.sin(p.walkPhase) * 0.55 : 0;
    p.mesh.userData.leg1.rotation.x = swing;
    p.mesh.userData.leg2.rotation.x = -swing;
    p.shootCooldown = Math.max(0, p.shootCooldown - dt);
    return p;
  }

  // Third-person camera: chase behind the car, or over the shoulder on foot.
  function updateCamera(dt) {
    var cam = RM.camera;
    var target = RM.player;
    var dist = RM.state.mode === 'car' ? 9 : 6.5;
    var height = RM.state.mode === 'car' ? 3.9 : 3.0;
    var lookY = 1.6;
    var px, pz, heading;
    if (RM.state.mode === 'car' && RM.car) {
      px = RM.car.x; pz = RM.car.z; heading = RM.car.heading;
      // camera yaw follows the car's heading, smoothed
      RM.camYaw = RM.angleLerp(RM.camYaw, heading, 1 - Math.pow(0.001, dt));
    } else {
      px = target.x; pz = target.z;
    }
    var cx = px - Math.sin(RM.camYaw) * dist;
    var cz = pz - Math.cos(RM.camYaw) * dist;
    var cy = height + Math.sin(RM.camPitch) * dist * 0.6;
    cam.position.x = RM.lerp(cam.position.x, cx, 1 - Math.pow(0.0001, dt));
    cam.position.y = RM.lerp(cam.position.y, cy, 1 - Math.pow(0.0001, dt));
    cam.position.z = RM.lerp(cam.position.z, cz, 1 - Math.pow(0.0001, dt));
    cam.lookAt(px, lookY, pz);
  }

  // Enter the nearest car within 5m; exit the current car beside the road.
  function tryEnterExit() {
    var p = RM.player, st = RM.state;
    if (st.mode === 'foot') {
      var best = null, bestD = 5.5;
      var all = RM.parked.concat(RM.cars);
      for (var i = 0; i < all.length; i++) {
        var c = all[i];
        if (c.dead || c.police) continue;
        var d = Math.sqrt(RM.dist2(p.x, p.z, c.x, c.z));
        if (d < bestD) { bestD = d; best = c; }
      }
      if (!best) { if (RM.hud) RM.hud.toast('No car close enough — walk to one and press E.', 2000); return; }
      var stolen = !!best.parked;
      if (stolen) {
        best.parked = false;
        RM.parked = RM.parked.filter(function (c) { return c !== best; });
        st.carsStolen++;
        if (RM.policeMgr) RM.policeMgr.addHeat(10, 'stolen car');
        if (RM.audio) RM.audio.horn();
        if (RM.hud) RM.hud.toast('Car stolen! The RMPD is watching.', 2400);
        if (RM.missionMgr) RM.missionMgr.onEvent('steal');
      }
      p.car = best; RM.car = best; st.mode = 'car'; st.carHealth = best.health;
      p.mesh.visible = false;
      RM.camYaw = best.heading;
      if (RM.audio) RM.audio.pickup();
    } else {
      var car = RM.car;
      if (!car) return;
      car.health = st.carHealth;
      // step out to the side of the car
      var sx = car.x + Math.cos(car.heading) * 2.6, sz = car.z - Math.sin(car.heading) * 2.6;
      var pos = { x: sx, z: sz };
      RM.resolveCollision(pos, 0.9);
      p.x = pos.x; p.z = pos.z; p.heading = car.heading;
      p.mesh.visible = true;
      p.mesh.position.set(p.x, 0, p.z);
      p.car = null; RM.car = null; st.mode = 'foot'; st.speed = 0;
      RM.camYaw = p.heading;
    }
  }

  RM.createPlayer = createPlayer;
  RM.updatePlayerOnFoot = updatePlayerOnFoot;
  RM.updateCamera = updateCamera;
  RM.tryEnterExit = tryEnterExit;
})();

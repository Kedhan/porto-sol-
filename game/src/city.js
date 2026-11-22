// Red Mesa Heat — city.js
// Procedural low-poly desert city: street grid, buildings with painted
// window textures, red-rock mesas ringing the map, cacti, lamps, billboards.
// Everything is generated from a fixed seed, so the city is identical every run.
(function () {
  'use strict';
  var THREE = window.THREE;

  var PALETTES = [0xc98a5a, 0xb5764a, 0xd9a066, 0x8a6f5c, 0x7a8a9e, 0x9e7a5b, 0x6e8a6a, 0xa05c4a, 0xc9b18a];
  var ROOFS = [0x5a3a2a, 0x3a4a5a, 0x2f4a3a, 0x6b4a3a];

  function buildingTexture(base, lit) {
    var c = document.createElement('canvas'); c.width = 128; c.height = 128;
    var g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, 128, 128);
    // subtle vertical shading
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, 0, 20, 128);
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(108, 0, 20, 128);
    // windows
    for (var y = 14; y < 108; y += 24) {
      for (var x = 12; x < 116; x += 26) {
        var on = ((x * 7 + y * 3) % 5) < 2;
        g.fillStyle = on ? (lit ? '#ffe9a8' : '#9fc4e8') : 'rgba(18,24,40,0.72)';
        g.fillRect(x, y, 14, 16);
      }
    }
    // dark base band so buildings read as solid from the street
    g.fillStyle = 'rgba(0,0,0,0.30)'; g.fillRect(0, 112, 128, 16);
    var tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 2;
    return tex;
  }

  function textTexture(text, bg, fg, w, h) {
    var c = document.createElement('canvas'); c.width = w || 512; c.height = h || 128;
    var g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = fg; g.font = 'bold ' + Math.floor(c.height * 0.42) + 'px Trebuchet MS, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, c.width / 2, c.height / 2);
    return new THREE.CanvasTexture(c);
  }

  function buildCity(scene) {
    var rnd = RM.rng;
    var MAP = RM.MAP, STEP = RM.ROAD_STEP;
    var roads = [];
    for (var v = -360; v <= 360; v += STEP) roads.push(v);

    // Sky + light: golden-hour desert sunset.
    scene.background = new THREE.Color(0xffb36b);
    scene.fog = new THREE.Fog(0xffc98a, 140, 780);
    var hemi = new THREE.HemisphereLight(0xffd9a0, 0x8a5a3a, 0.95);
    scene.add(hemi);
    var sun = new THREE.DirectionalLight(0xffc070, 1.15);
    sun.position.set(-180, 260, -120);
    scene.add(sun);
    // Low sun disc on the horizon.
    var sunBall = new THREE.Mesh(
      new THREE.SphereGeometry(26, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8, fog: false })
    );
    sunBall.position.set(-420, 90, -520);
    scene.add(sunBall);

    // Ground: sand.
    var ground = new THREE.Mesh(
      new THREE.PlaneGeometry(MAP * 2 + 600, MAP * 2 + 600),
      new THREE.MeshLambertMaterial({ color: 0xd9a066 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    scene.add(ground);

    // Roads: dark asphalt strips + centre dashes.
    var roadMat = new THREE.MeshLambertMaterial({ color: 0x3a3a42 });
    var dashMat = new THREE.MeshBasicMaterial({ color: 0xe8d27a });
    var roadGeoX = new THREE.PlaneGeometry(MAP * 2 + 40, RM.ROAD_W);
    var roadGeoZ = new THREE.PlaneGeometry(RM.ROAD_W, MAP * 2 + 40);
    roads.forEach(function (r) {
      var a = new THREE.Mesh(roadGeoX, roadMat);
      a.rotation.x = -Math.PI / 2; a.position.set(0, 0.02, r); scene.add(a);
      var b = new THREE.Mesh(roadGeoZ, roadMat);
      b.rotation.x = -Math.PI / 2; b.position.set(r, 0.03, 0); scene.add(b);
      // dashes along each road
      for (var d = -440; d <= 440; d += 24) {
        var dash = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.7), dashMat);
        dash.rotation.x = -Math.PI / 2; dash.position.set(d, 0.05, r); scene.add(dash);
        var dash2 = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 6), dashMat);
        dash2.rotation.x = -Math.PI / 2; dash2.position.set(r, 0.05, d); scene.add(dash2);
      }
    });

    // Buildings: one or two per block, downtown taller.
    var texColors = ['#c98a5a', '#7a8a9e', '#6e8a6a', '#a05c5c', '#4f7a7a', '#b08a3e'];
    var textures = texColors.map(function (p) { return buildingTexture(p, true); });
    // Block ground: varied dirt / concrete tints so blocks are not one pale sheet.
    var blockTints = [0xc98f5a, 0xb98a5a, 0xd9b078, 0xa08a6a, 0xc2a878];
    for (var bx0 = 0; bx0 < roads.length - 1; bx0++) {
      for (var bz0 = 0; bz0 < roads.length - 1; bz0++) {
        var gx0 = roads[bx0] + RM.ROAD_W / 2, gz0 = roads[bz0] + RM.ROAD_W / 2;
        var gw = roads[bx0 + 1] - roads[bx0] - RM.ROAD_W;
        var gd = roads[bz0 + 1] - roads[bz0] - RM.ROAD_W;
        var gp = new THREE.Mesh(new THREE.PlaneGeometry(gw, gd), new THREE.MeshLambertMaterial({ color: blockTints[(bx0 * 3 + bz0 * 5) % blockTints.length] }));
        gp.rotation.x = -Math.PI / 2;
        gp.position.set(gx0 + gw / 2, 0.015, gz0 + gd / 2);
        scene.add(gp);
      }
    }
    var buildings = [];
    var boxGeo = new THREE.BoxGeometry(1, 1, 1);
    for (var ix = 0; ix < roads.length - 1; ix++) {
      for (var iz = 0; iz < roads.length - 1; iz++) {
        var bx = roads[ix] + RM.ROAD_W / 2 + 6;
        var bz = roads[iz] + RM.ROAD_W / 2 + 6;
        var bw = roads[ix + 1] - roads[ix] - RM.ROAD_W - 12;
        var bz2 = roads[iz + 1] - roads[iz] - RM.ROAD_W - 12;
        if (bw < 40 || bz2 < 40) continue;
        // Central plaza block stays open (park).
        if (ix === 4 && iz === 4) continue;
        var downtown = Math.abs(roads[ix]) <= 90 && Math.abs(roads[iz]) <= 90;
        var n = rnd() > 0.55 ? 2 : 1;
        for (var k = 0; k < n; k++) {
          var w = n === 2 ? bw / 2 - 6 : bw - 8;
          var d = bz2 - 8;
          var h = downtown ? RM.rand(26, 58) : RM.rand(9, 26);
          var cx = bx + (n === 2 ? k * (bw / 2) + w / 2 + 3 : w / 2 + 4);
          var cz = bz + d / 2 + 4;
          var mat = new THREE.MeshLambertMaterial({ map: textures[Math.floor(rnd() * textures.length)] });
          var mesh = new THREE.Mesh(boxGeo, mat);
          mesh.scale.set(w, h, d);
          mesh.position.set(cx, h / 2, cz);
          scene.add(mesh);
          var roof = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: ROOFS[Math.floor(rnd() * ROOFS.length)] }));
          roof.scale.set(w + 1, 1.2, d + 1);
          roof.position.set(cx, h + 0.6, cz);
          scene.add(roof);
          buildings.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, h: h });
        }
      }
    }

    // Landmarks (also solid): garage, bank, motel, mine office, fuel depot.
    var landmarks = [
      { name: "ILSA'S GARAGE", x: -180, z: -180, w: 34, d: 24, h: 12, color: 0xff9d45 },
      { name: 'RED MESA BANK', x: 90, z: 90, w: 30, d: 22, h: 20, color: 0xffd166 },
      { name: 'DESERT SUN MOTEL', x: -270, z: 270, w: 36, d: 20, h: 11, color: 0x7fd8c9 },
      { name: 'OLD MINE OFFICE', x: 270, z: -270, w: 30, d: 20, h: 13, color: 0xb5764a },
      { name: 'FUEL DEPOT', x: 270, z: 270, w: 34, d: 24, h: 10, color: 0xe8e8e8 }
    ];
    landmarks.forEach(function (lm) {
      var mesh = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: lm.color }));
      mesh.scale.set(lm.w, lm.h, lm.d);
      mesh.position.set(lm.x, lm.h / 2, lm.z);
      scene.add(mesh);
      var sign = new THREE.Mesh(
        new THREE.PlaneGeometry(lm.w + 6, 6),
        new THREE.MeshBasicMaterial({ map: textTexture(lm.name, '#1a1200', '#ffd166') })
      );
      sign.position.set(lm.x, lm.h + 4, lm.z + lm.d / 2 + 0.2);
      scene.add(sign);
      buildings.push({ minX: lm.x - lm.w / 2, maxX: lm.x + lm.w / 2, minZ: lm.z - lm.d / 2, maxZ: lm.z + lm.d / 2, h: lm.h });
    });

    // Central park in the open block (45,45): green lawn, fountain, palms.
    var lawn = new THREE.Mesh(new THREE.PlaneGeometry(64, 64), new THREE.MeshLambertMaterial({ color: 0x4a7a3d }));
    lawn.rotation.x = -Math.PI / 2; lawn.position.set(45, 0.06, 45); scene.add(lawn);
    var fountain = new THREE.Mesh(new THREE.CylinderGeometry(7, 8, 1.6, 12), new THREE.MeshLambertMaterial({ color: 0x7fd8e8 }));
    fountain.position.set(45, 0.8, 45); scene.add(fountain);
    for (var ti = 0; ti < 6; ti++) {
      var tx = 45 + (ti % 3 - 1) * 22, tz = 45 + (Math.floor(ti / 3) - 0.5) * 36;
      var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 9, 6), new THREE.MeshLambertMaterial({ color: 0x8a6a4a }));
      trunk.position.set(tx, 4.5, tz); scene.add(trunk);
      var top = new THREE.Mesh(new THREE.SphereGeometry(3.2, 8, 6), new THREE.MeshLambertMaterial({ color: 0x3f8a4f }));
      top.position.set(tx, 10, tz); scene.add(top);
    }

    // Mesas ringing the city — big red-rock buttes.
    var mesaMat = new THREE.MeshLambertMaterial({ color: 0xb5502a });
    var mesaMat2 = new THREE.MeshLambertMaterial({ color: 0x9e4526 });
    var mesaSpots = [[-520, -520, 90], [520, -520, 110], [-520, 520, 100], [520, 520, 85], [0, -560, 120], [-560, 0, 95], [560, 0, 105], [0, 560, 115]];
    mesaSpots.forEach(function (m, i) {
      var geo = new THREE.CylinderGeometry(m[2] * 0.55, m[2], RM.rand(70, 130), 7);
      var mesh = new THREE.Mesh(geo, i % 2 ? mesaMat2 : mesaMat);
      mesh.position.set(m[0], 35, m[1]);
      mesh.rotation.y = rnd() * Math.PI;
      scene.add(mesh);
      var cap = new THREE.Mesh(new THREE.CylinderGeometry(m[2] * 0.58, m[2] * 0.55, 8, 7), new THREE.MeshLambertMaterial({ color: 0xd97a4a }));
      cap.position.set(m[0], 35 + 65, m[1]);
      scene.add(cap);
    });

    // Cacti, rocks and street lamps.
    var cactusMat = new THREE.MeshLambertMaterial({ color: 0x3f8a4f });
    var rockMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
    var lampMat = new THREE.MeshLambertMaterial({ color: 0x2a2a30 });
    for (var i = 0; i < 90; i++) {
      var px = RM.rand(-440, 440), pz = RM.rand(-440, 440);
      if (Math.abs(px) < 380 && Math.abs(pz) < 380 && rnd() > 0.3) continue; // keep streets clear-ish
      if (rnd() > 0.5) {
        var c = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, RM.rand(4, 8), 6), cactusMat);
        c.position.set(px, 3, pz); scene.add(c);
        var arm = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 3, 6), cactusMat);
        arm.rotation.z = Math.PI / 2; arm.position.set(px + 1.6, 3.4, pz); scene.add(arm);
      } else {
        var r = new THREE.Mesh(new THREE.CylinderGeometry(RM.rand(1.5, 3.5), RM.rand(2, 4), RM.rand(1.5, 3), 5), rockMat);
        r.position.set(px, 1, pz); scene.add(r);
      }
    }
    roads.forEach(function (r) {
      for (var d = -360; d <= 360; d += 180) {
        var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 9, 6), lampMat);
        pole.position.set(r + 9, 4.5, d); scene.add(pole);
        var bulb = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
        bulb.position.set(r + 9, 9.2, d); scene.add(bulb);
      }
    });

    // Billboards.
    var bbTexts = [['RED MESA', 'POP. 41,000 · EST. 1911'], ['DESERT SUN MOTEL', 'VACANCY · POOL · ICE'], ['ILSA\'S GARAGE', 'WE FIX ANYTHING · CASH ONLY']];
    bbTexts.forEach(function (bb, i) {
      var x = [-270, 180, -90][i], z = [-90, 270, -270][i];
      var board = new THREE.Mesh(new THREE.PlaneGeometry(30, 9), new THREE.MeshBasicMaterial({ map: textTexture(bb[0] + ' — ' + bb[1], '#7a2a1a', '#ffe9a8', 512, 128) }));
      board.position.set(x, 14, z);
      board.rotation.y = i % 2 ? 0.4 : -0.5;
      scene.add(board);
      var leg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 10, 6), lampMat);
      leg1.position.set(x - 10, 5, z); scene.add(leg1);
      var leg2 = leg1.clone(); leg2.position.x = x + 10; scene.add(leg2);
    });

    // Clouds: flat white slabs drifting slowly.
    var clouds = [];
    var cloudMat = new THREE.MeshLambertMaterial({ color: 0xfff2dd, transparent: true, opacity: 0.85 });
    for (var ci = 0; ci < 10; ci++) {
      var cl = new THREE.Mesh(new THREE.BoxGeometry(RM.rand(30, 70), 4, RM.rand(14, 26)), cloudMat);
      cl.position.set(RM.rand(-500, 500), RM.rand(120, 170), RM.rand(-500, 500));
      scene.add(cl); clouds.push(cl);
    }

    RM.city = { roads: roads, buildings: buildings, landmarks: landmarks, clouds: clouds };
    RM.buildings = buildings;
    return RM.city;
  }

  // Push a circle (x,z,r) out of solid buildings; returns true on a hit.
  function resolveCollision(pos, r) {
    var hit = false;
    var list = RM.buildings;
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      var cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
      var cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
      var dx = pos.x - cx, dz = pos.z - cz, d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        hit = true;
        if (d2 < 0.01) { pos.z = b.minZ - r; continue; }
        var d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * r; pos.z = cz + (dz / d) * r;
      }
    }
    pos.x = Math.max(-RM.MAP, Math.min(RM.MAP, pos.x));
    pos.z = Math.max(-RM.MAP, Math.min(RM.MAP, pos.z));
    return hit;
  }

  RM.buildCity = buildCity;
  RM.resolveCollision = resolveCollision;
})();

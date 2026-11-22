'use strict';
/* Red Mesa Heat — the city, written fresh for round 3.
   Builds Red Mesa from scratch: four districts with their own look,
   a mesa ring on the horizon, a central park, roadside props and
   hand-painted billboards. Also owns building collision. */
(function () {
  var RM = window.RM;

  /* Canvas texture with a grid of windows, for building facades. */
  function facadeTexture(base, win, lit, cols, rows) {
    var c = document.createElement('canvas');
    c.width = 128;
    c.height = 256;
    var g = c.getContext('2d');
    g.fillStyle = base;
    g.fillRect(0, 0, 128, 256);
    var cw = 128 / cols, ch = 256 / rows;
    for (var r = 0; r < rows; r++) {
      for (var col = 0; col < cols; col++) {
        var on = RM.rng() < lit;
        g.fillStyle = on ? '#ffd98a' : win;
        g.fillRect(col * cw + 4, r * ch + 6, cw - 8, ch - 12);
      }
    }
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, 248, 128, 8);
    var tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function textBoardTexture(lines, bg, fg, accent) {
    var c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    var g = c.getContext('2d');
    g.fillStyle = bg;
    g.fillRect(0, 0, 512, 256);
    g.strokeStyle = accent;
    g.lineWidth = 10;
    g.strokeRect(8, 8, 496, 240);
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = 'bold 54px Arial, sans-serif';
    if (lines.length === 1) {
      g.fillText(lines[0], 256, 128);
    } else {
      g.fillText(lines[0], 256, 92);
      g.font = 'bold 40px Arial, sans-serif';
      g.fillText(lines[1], 256, 168);
    }
    var tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function districtAt(bx, bz) {
    if (bz >= 90) return 'flats';          // Copper Flats, south
    if (bx <= -90) return 'adobe';         // Old Town, west
    if (Math.abs(bx) < 90 && Math.abs(bz) < 90) return 'strip'; // The Strip
    return 'mesa';                          // Mesa View, north
  }

  RM.buildCity = function (scene) {
    var HALF = RM.HALF;
    var STEP = RM.ROAD_STEP;
    var city = { roads: [], buildings: [], landmarks: {}, clouds: [] };
    RM.city = city;

    /* ---- sky, fog, lights ---- */
    scene.background = new THREE.Color(0xff9a58);
    scene.fog = new THREE.Fog(0xef8a4b, 150, 840);
    var hemi = new THREE.HemisphereLight(0xffd9a0, 0x8a5a3a, 0.75);
    scene.add(hemi);
    var sun = new THREE.DirectionalLight(0xffb36b, 1.15);
    sun.position.set(140, 190, 70);
    scene.add(sun);
    var fill = new THREE.DirectionalLight(0x7a6cff, 0.22);
    fill.position.set(-120, 80, -100);
    scene.add(fill);

    /* ---- ground: town sand + outer desert ---- */
    var groundMat = new THREE.MeshLambertMaterial({ color: 0xc99a62 });
    var ground = new THREE.Mesh(new THREE.PlaneGeometry(RM.MAP, RM.MAP), groundMat);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    var outerMat = new THREE.MeshLambertMaterial({ color: 0xb57a48 });
    var outer = new THREE.Mesh(new THREE.PlaneGeometry(1500, 1500), outerMat);
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.15;
    scene.add(outer);

    /* ---- roads: asphalt strips with a dashed centre line texture ---- */
    var rc = document.createElement('canvas');
    rc.width = 64; rc.height = 256;
    var rg = rc.getContext('2d');
    rg.fillStyle = '#3a3a40';
    rg.fillRect(0, 0, 64, 256);
    rg.fillStyle = '#d8c56a';
    rg.fillRect(29, 20, 6, 60);
    rg.fillRect(29, 150, 6, 60);
    var roadTex = new THREE.CanvasTexture(rc);
    roadTex.wrapS = THREE.RepeatWrapping;
    roadTex.wrapT = THREE.RepeatWrapping;
    roadTex.repeat.set(1, 12);
    roadTex.colorSpace = THREE.SRGBColorSpace;
    var roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
    var lines = [];
    for (var at = -180; at <= 180; at += STEP) lines.push(at);
    lines.forEach(function (pos) {
      city.roads.push({ axis: 'x', at: pos });
      city.roads.push({ axis: 'z', at: pos });
      var alongX = new THREE.Mesh(new THREE.PlaneGeometry(RM.MAP, RM.ROAD_W), roadMat);
      alongX.rotation.x = -Math.PI / 2;
      alongX.rotation.z = Math.PI / 2;
      alongX.position.set(0, 0.02, pos);
      scene.add(alongX);
      var alongZ = new THREE.Mesh(new THREE.PlaneGeometry(RM.MAP, RM.ROAD_W), roadMat);
      alongZ.rotation.x = -Math.PI / 2;
      alongZ.position.set(pos, 0.02, 0);
      scene.add(alongZ);
    });

    /* ---- landmarks (road / edge points missions use) ---- */
    city.landmarks = {
      garage: { x: -180, z: 90 },
      motel: { x: 180, z: -90 },
      bank: { x: 0, z: -180 },
      copperMine: { x: 180, z: 180 },
      fuelDepot: { x: -180, z: 180 },
      airstrip: { x: 215, z: 0 },
      overlook: { x: -215, z: -180 },
      diner: { x: 90, z: 180 },
      park: { x: 45, z: 45 }
    };

    /* ---- buildings, block by block ---- */
    var texCache = {};
    function facadeFor(kind) {
      if (texCache[kind]) return texCache[kind];
      var t;
      if (kind === 'flats') t = facadeTexture('#8a6f52', '#5d4a35', 0.12, 5, 3);
      else if (kind === 'adobe') t = facadeTexture('#c98d5f', '#7a4a28', 0.25, 4, 3);
      else if (kind === 'strip') t = facadeTexture('#5f6d84', '#2c3550', 0.45, 6, 10);
      else t = facadeTexture('#a9805e', '#6d4a2c', 0.2, 5, 5);
      texCache[kind] = t;
      return t;
    }
    var blockCenters = [-135, -45, 45, 135];
    blockCenters.forEach(function (bx) {
      blockCenters.forEach(function (bz) {
        if (bx === 45 && bz === 45) return; // the park block stays open
        var kind = districtAt(bx, bz);
        var count = kind === 'strip' ? 4 : (kind === 'flats' ? 5 : 4);
        for (var i = 0; i < count; i++) {
          var ox = ((i % 2) === 0 ? -19 : 19);
          var oz = (i < 2 ? -19 : 19);
          if (i === 4) { ox = 0; oz = 0; }
          var w = RM.rand(16, 24);
          var d = RM.rand(16, 24);
          var h;
          if (kind === 'strip') h = RM.rand(20, 46);
          else if (kind === 'flats') h = RM.rand(6, 12);
          else if (kind === 'adobe') h = RM.rand(5, 9);
          else h = RM.rand(10, 20);
          var x = bx + ox, z = bz + oz;
          var mat = new THREE.MeshLambertMaterial({ map: facadeFor(kind) });
          var b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
          b.position.set(x, h / 2, z);
          scene.add(b);
          /* flat roof cap */
          var cap = new THREE.Mesh(
            new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6),
            new THREE.MeshLambertMaterial({ color: kind === 'strip' ? 0x2e3442 : 0x6d4a2c })
          );
          cap.position.set(x, h + 0.25, z);
          scene.add(cap);
          if (kind === 'strip' && RM.rng() < 0.5) {
            var neon = new THREE.Mesh(
              new THREE.BoxGeometry(w * 0.7, 0.7, 0.4),
              new THREE.MeshBasicMaterial({ color: RM.pick([0xff4d6d, 0x37e0c8, 0xffc233]) })
            );
            neon.position.set(x, h - 1.2, z + d / 2 + 0.3);
            scene.add(neon);
          }
          city.buildings.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h: h });
        }
      });
    });
    RM.buildings = city.buildings;

    /* ---- the park: lawn, fountain, palms, benches ---- */
    var pk = city.landmarks.park;
    var lawn = new THREE.Mesh(
      new THREE.CircleGeometry(34, 24),
      new THREE.MeshLambertMaterial({ color: 0x5d8a4a })
    );
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.set(pk.x, 0.05, pk.z);
    scene.add(lawn);
    var basin = new THREE.Mesh(
      new THREE.CylinderGeometry(7, 7.6, 1.1, 20),
      new THREE.MeshLambertMaterial({ color: 0xd8cdb4 })
    );
    basin.position.set(pk.x, 0.55, pk.z);
    scene.add(basin);
    var water = new THREE.Mesh(
      new THREE.CircleGeometry(6.2, 20),
      new THREE.MeshLambertMaterial({ color: 0x4db2d8 })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(pk.x, 1.12, pk.z);
    scene.add(water);
    var spout = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 1.1, 3.4, 10),
      new THREE.MeshLambertMaterial({ color: 0xc9bda0 })
    );
    spout.position.set(pk.x, 2.4, pk.z);
    scene.add(spout);
    function palm(px, pz) {
      var trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.7, 7, 8),
        new THREE.MeshLambertMaterial({ color: 0x8a6a42 })
      );
      trunk.position.set(px, 3.5, pz);
      trunk.rotation.z = RM.rand(-0.12, 0.12);
      scene.add(trunk);
      for (var f = 0; f < 5; f++) {
        var frond = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 0.12, 3.4),
          new THREE.MeshLambertMaterial({ color: 0x3f7a34 })
        );
        var a = (f / 5) * Math.PI * 2;
        frond.position.set(px + Math.cos(a) * 1.4, 7.1, pz + Math.sin(a) * 1.4);
        frond.rotation.y = -a;
        frond.rotation.x = 0.5;
        scene.add(frond);
      }
    }
    for (var p = 0; p < 8; p++) {
      var ang = (p / 8) * Math.PI * 2;
      palm(pk.x + Math.cos(ang) * 22, pk.z + Math.sin(ang) * 22);
    }

    /* ---- mesa ring on the horizon + a few buttes ---- */
    var mesaCols = [0xb5502e, 0x9e4526, 0xc96a3a, 0xa84e30];
    for (var m = 0; m < 14; m++) {
      var ma = (m / 14) * Math.PI * 2 + RM.rand(-0.1, 0.1);
      var mr = RM.rand(290, 360);
      var mw = RM.rand(50, 110);
      var mh = RM.rand(28, 70);
      var mesa = new THREE.Mesh(
        new THREE.BoxGeometry(mw, mh, RM.rand(30, 55)),
        new THREE.MeshLambertMaterial({ color: RM.pick(mesaCols) })
      );
      mesa.position.set(Math.cos(ma) * mr, mh / 2 - 2, Math.sin(ma) * mr);
      mesa.rotation.y = ma;
      scene.add(mesa);
    }
    for (var b2 = 0; b2 < 6; b2++) {
      var ba = RM.rand(0, Math.PI * 2);
      var br = RM.rand(300, 380);
      var butte = new THREE.Mesh(
        new THREE.ConeGeometry(RM.rand(18, 30), RM.rand(35, 60), 6),
        new THREE.MeshLambertMaterial({ color: 0xa84e30 })
      );
      butte.position.set(Math.cos(ba) * br, 14, Math.sin(ba) * br);
      scene.add(butte);
    }

    /* ---- cacti and rocks, kept off the roads ---- */
    function offRoad(x, z) {
      var nearRoad = false;
      lines.forEach(function (pos) {
        if (Math.abs(x - pos) < 11 || Math.abs(z - pos) < 11) nearRoad = true;
      });
      return !nearRoad;
    }
    var cactusMat = new THREE.MeshLambertMaterial({ color: 0x3e7d3a });
    var placed = 0, guard = 0;
    while (placed < 36 && guard++ < 400) {
      var cx = RM.rand(-HALF + 15, HALF - 15);
      var cz = RM.rand(-HALF + 15, HALF - 15);
      if (!offRoad(cx, cz)) continue;
      var cg = new THREE.Group();
      var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, RM.rand(4, 6.5), 8), cactusMat);
      stem.position.y = 2.6;
      cg.add(stem);
      var arm = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 2.2, 8), cactusMat);
      arm.position.set(1.2, 2.8, 0);
      cg.add(arm);
      cg.position.set(cx, 0, cz);
      scene.add(cg);
      placed++;
    }
    var rockMat = new THREE.MeshLambertMaterial({ color: 0x8d7a6a });
    for (var r2 = 0; r2 < 28; r2++) {
      var rx = RM.rand(-HALF + 10, HALF - 10);
      var rz = RM.rand(-HALF + 10, HALF - 10);
      if (!offRoad(rx, rz)) continue;
      var rock = new THREE.Mesh(new THREE.DodecahedronGeometry(RM.rand(1, 2.6), 0), rockMat);
      rock.position.set(rx, 0.8, rz);
      rock.rotation.set(RM.rand(0, 3), RM.rand(0, 3), 0);
      scene.add(rock);
    }

    /* ---- street lamps along the avenues ---- */
    var poleMat = new THREE.MeshLambertMaterial({ color: 0x3c3c44 });
    var lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    lines.forEach(function (pos) {
      for (var s = -180; s <= 180; s += 90) {
        var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 7.5, 6), poleMat);
        pole.position.set(s, 3.75, pos + 9.5);
        scene.add(pole);
        var bulb = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), lampMat);
        bulb.position.set(s, 7.6, pos + 9.5);
        scene.add(bulb);
      }
    });

    /* ---- billboards ---- */
    var boards = [
      { lines: ['VISIT RED MESA'], bg: '#7a2e1d', fg: '#ffe9a8', accent: '#ffd23e', x: -180, z: 40, ry: Math.PI / 2 },
      { lines: ['GAS —', 'LAST CHANCE 40 MI'], bg: '#1d4a5e', fg: '#ffffff', accent: '#ff7a3c', x: 40, z: 180, ry: 0 },
      { lines: ['DESERT ROSE', 'MOTEL — VACANCY'], bg: '#5e1d4a', fg: '#ffd6f2', accent: '#ff4d6d', x: 180, z: -40, ry: -Math.PI / 2 },
      { lines: ['COPPER COLA'], bg: '#b5502e', fg: '#fff3d6', accent: '#ffffff', x: -40, z: -180, ry: Math.PI }
    ];
    boards.forEach(function (bd) {
      var tex = textBoardTexture(bd.lines, bd.bg, bd.fg, bd.accent);
      var board = new THREE.Mesh(
        new THREE.PlaneGeometry(22, 11),
        new THREE.MeshLambertMaterial({ map: tex })
      );
      board.position.set(bd.x, 8, bd.z);
      board.rotation.y = bd.ry;
      scene.add(board);
      var leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8, 0.8), poleMat);
      leg1.position.set(bd.x - 7, 4, bd.z);
      scene.add(leg1);
      var leg2 = leg1.clone();
      leg2.position.x = bd.x + 7;
      scene.add(leg2);
    });

    /* ---- drifting clouds ---- */
    var cloudMat = new THREE.MeshLambertMaterial({ color: 0xfff2e0, transparent: true, opacity: 0.85 });
    for (var cl = 0; cl < 7; cl++) {
      var cg2 = new THREE.Group();
      for (var puff = 0; puff < 4; puff++) {
        var s = new THREE.Mesh(new THREE.SphereGeometry(RM.rand(6, 11), 8, 6), cloudMat);
        s.scale.y = 0.45;
        s.position.set(puff * 8 - 12, RM.rand(-1, 1), RM.rand(-3, 3));
        cg2.add(s);
      }
      cg2.position.set(RM.rand(-220, 220), RM.rand(60, 95), RM.rand(-220, 220));
      scene.add(cg2);
      city.clouds.push(cg2);
    }

    return city;
  };

  /* Push a point out of every building AABB it overlaps. */
  RM.resolveCollision = function (x, z, r) {
    var list = RM.buildings;
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r) {
        var pushL = x - (b.minX - r);
        var pushR = (b.maxX + r) - x;
        var pushB = z - (b.minZ - r);
        var pushF = (b.maxZ + r) - z;
        var m = Math.min(pushL, pushR, pushB, pushF);
        if (m === pushL) x = b.minX - r;
        else if (m === pushR) x = b.maxX + r;
        else if (m === pushB) z = b.minZ - r;
        else z = b.maxZ + r;
      }
    }
    return { x: x, z: z };
  };
})();

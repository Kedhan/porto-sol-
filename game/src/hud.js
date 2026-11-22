// hud.js — Red Mesa Heat HUD, minimap and toasts (round 3 rewrite).
// Own implementation: cached DOM handles, star row, 2D canvas minimap.
(function () {
  'use strict';

  var els = null;          // cached DOM handles, grabbed lazily
  var minimapClock = 0;    // throttle: redraw the minimap ~8x per second
  var MAP_PAD = 40;        // extra metres drawn around the city edge

  function $(id) { return document.getElementById(id); }

  function grab() {
    if (!els) {
      els = {
        cash: $('cash'),
        healthFill: $('health-fill'),
        healthText: $('health-text'),
        stars: $('stars'),
        speed: $('speed'),
        mission: $('mission-text'),
        msg: $('message'),
        map: $('minimap')
      };
    }
    return els;
  }

  function healthColor(h) {
    if (h > 55) return '#3ddc5a';
    if (h > 25) return '#ffb02e';
    return '#ff4d3d';
  }

  function starRow(wanted) {
    var out = '';
    for (var i = 0; i < 5; i++) out += (i < wanted) ? '★' : '☆';
    return out;
  }

  function clockText(seconds) {
    var total = Math.max(0, Math.floor(seconds));
    var mm = Math.floor(total / 60);
    var ss = total % 60;
    return (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss;
  }

  RM.hud = {
    update: function (dt) {
      var e = grab();
      var s = RM.state;

      if (e.cash) e.cash.textContent = RM.fmtCash(s.cash);

      var hp = (s.mode === 'car') ? s.carHealth : s.health;
      if (e.healthFill) {
        e.healthFill.style.width = RM.clamp(hp, 0, 100) + '%';
        e.healthFill.style.background = healthColor(hp);
      }
      if (e.healthText) {
        e.healthText.textContent = (s.mode === 'car' ? 'CAR ' : '') + Math.round(hp) + ' HP';
      }

      var wanted = (RM.policeMgr && RM.policeMgr.wantedStars)
        ? RM.policeMgr.wantedStars() : (s.wanted || 0);
      if (e.stars) {
        e.stars.textContent = starRow(wanted);
        e.stars.style.color = wanted > 0 ? '#ffd23e' : '#8a7f72';
      }

      if (e.speed) e.speed.textContent = Math.round((s.speed || 0) * 3.6) + ' km/h';

      if (e.mission) {
        e.mission.textContent = (RM.missionMgr && RM.missionMgr.progressText)
          ? RM.missionMgr.progressText()
          : (s.objective || 'Free roam — cause some trouble.');
      }

      // Toast: visible while the message window is open, then fades.
      if (e.msg) {
        if (s.time < s.messageUntil) {
          e.msg.textContent = s.message || '';
          e.msg.style.opacity = '1';
        } else {
          e.msg.style.opacity = '0';
        }
      }

      minimapClock += dt;
      if (minimapClock > 0.12) {
        minimapClock = 0;
        this.drawMinimap();
      }
    },

    toast: function (msg) {
      RM.state.message = msg;
      RM.state.messageUntil = RM.state.time + 4;
    },

    setObjective: function (text) {
      RM.state.objective = text;
      var e = grab();
      if (e.mission) e.mission.textContent = text;
    },

    drawMinimap: function () {
      var e = grab();
      var canvas = e.map;
      if (!canvas) return;
      var ctx = canvas.getContext('2d');
      if (!ctx) return;
      var size = canvas.width;
      var span = RM.MAP + MAP_PAD * 2;
      var scale = size / span;
      function toX(x) { return size / 2 + x * scale; }
      function toY(z) { return size / 2 + z * scale; }

      // Sand background + mesa-red border.
      ctx.fillStyle = '#241a10';
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = '#b4502e';
      ctx.lineWidth = 3;
      ctx.strokeRect(2, 2, size - 4, size - 4);

      // Road grid.
      ctx.strokeStyle = '#5d4a33';
      ctx.lineWidth = 2;
      var roads = (RM.city && RM.city.roads) || [];
      for (var i = 0; i < roads.length; i++) {
        var r = roads[i];
        ctx.beginPath();
        if (r.axis === 'x') {
          ctx.moveTo(toX(-RM.MAP / 2), toY(r.at));
          ctx.lineTo(toX(RM.MAP / 2), toY(r.at));
        } else {
          ctx.moveTo(toX(r.at), toY(-RM.MAP / 2));
          ctx.lineTo(toX(r.at), toY(RM.MAP / 2));
        }
        ctx.stroke();
      }

      // Park patch.
      var park = (RM.city && RM.city.landmarks) ? RM.city.landmarks.park : null;
      if (park) {
        ctx.fillStyle = '#2f6b34';
        ctx.fillRect(toX(park.x) - 7, toY(park.z) - 7, 14, 14);
      }

      // Buildings as dark blocks.
      ctx.fillStyle = '#3a2c1e';
      var blds = RM.buildings || [];
      for (var b = 0; b < blds.length; b++) {
        var bb = blds[b];
        ctx.fillRect(toX(bb.minX), toY(bb.minZ),
          Math.max(2, (bb.maxX - bb.minX) * scale),
          Math.max(2, (bb.maxZ - bb.minZ) * scale));
      }

      // Pulsing mission marker at the active target.
      var target = null;
      if (RM.missionMgr && RM.missionMgr._activeTarget) {
        var tname = RM.missionMgr._activeTarget();
        if (tname && RM.city && RM.city.landmarks) target = RM.city.landmarks[tname];
      }
      if (target) {
        var pulse = 5 + 2.5 * Math.sin(RM.state.time * 4);
        ctx.fillStyle = '#ffd23e';
        ctx.beginPath();
        ctx.arc(toX(target.x), toY(target.z), pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff3c4';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Traffic: sand dots. Police: red dots. Pedestrians: faint grey.
      ctx.fillStyle = '#d8c08a';
      var cars = RM.trafficCars || [];
      for (var c = 0; c < cars.length; c++) {
        if (!cars[c].group) continue;
        ctx.fillRect(toX(cars[c].group.position.x) - 1.5, toY(cars[c].group.position.z) - 1.5, 3, 3);
      }
      ctx.fillStyle = '#ff4d3d';
      var cops = RM.policeCars || [];
      for (var p = 0; p < cops.length; p++) {
        if (!cops[p].group) continue;
        ctx.beginPath();
        ctx.arc(toX(cops[p].group.position.x), toY(cops[p].group.position.z), 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(200, 200, 200, 0.55)';
      var peds = RM.peds || [];
      for (var d = 0; d < peds.length; d++) {
        if (!peds[d].group) continue;
        ctx.fillRect(toX(peds[d].group.position.x) - 1, toY(peds[d].group.position.z) - 1, 2, 2);
      }

      // Player arrow, rotated by heading.
      var px = 0, pz = 0, heading = 0;
      if (RM.state.mode === 'car' && RM.car && RM.car.group) {
        px = RM.car.group.position.x; pz = RM.car.group.position.z; heading = RM.car.heading || 0;
      } else if (RM.player && RM.player.group) {
        px = RM.player.group.position.x; pz = RM.player.group.position.z; heading = RM.player.heading || 0;
      }
      ctx.save();
      ctx.translate(toX(px), toY(pz));
      ctx.rotate(-heading + Math.PI);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(4.5, 5);
      ctx.lineTo(-4.5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Clock, bottom-left of the minimap.
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.font = '11px monospace';
      ctx.fillText(clockText(RM.state.time), 6, size - 7);
    }
  };
})();

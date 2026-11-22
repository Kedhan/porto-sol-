'use strict';
/* Red Mesa Heat — core utilities, written fresh for round 3.
   Owns the RM namespace, the seeded RNG, small math helpers and the
   shared game state every other module reads and writes. */
(function () {
  var RM = {};
  window.RM = RM;

  /* ---- world constants ---- */
  RM.MAP = 460;          // playable square, side length in metres
  RM.ROAD_STEP = 90;     // distance between parallel streets
  RM.ROAD_W = 15;        // street width
  RM.HALF = RM.MAP / 2;  // 230

  /* ---- seeded random (mulberry32, written from the algorithm's idea) ---- */
  function seedFromUrl() {
    var s = 1337;
    try {
      var q = new URLSearchParams(window.location.search);
      var raw = q.get('seed');
      if (raw !== null && raw !== '') {
        var n = parseInt(raw, 10);
        if (!isNaN(n)) s = n;
      }
    } catch (e) { /* keep default */ }
    return s >>> 0;
  }
  RM.seed = seedFromUrl();
  var rngState = RM.seed;
  function nextRandom() {
    rngState = (rngState + 0x6D2B79F5) | 0;
    var t = rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  RM.rng = nextRandom;
  RM.rand = function (a, b) { return a + nextRandom() * (b - a); };
  RM.randInt = function (a, b) { return Math.floor(RM.rand(a, b + 1)); };
  RM.pick = function (arr) { return arr[Math.floor(nextRandom() * arr.length)]; };
  RM.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  RM.clamp01 = function (v) { return RM.clamp(v, 0, 1); };
  RM.lerp = function (a, b, t) { return a + (b - a) * t; };
  RM.dist2 = function (ax, az, bx, bz) {
    var dx = ax - bx, dz = az - bz;
    return dx * dx + dz * dz;
  };
  RM.angleLerp = function (a, b, t) {
    var d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  };
  RM.fmtCash = function (n) {
    var s = '' + Math.round(n);
    var out = '';
    while (s.length > 3) { out = ',' + s.slice(-3) + out; s = s.slice(0, -3); }
    return '$' + s + out;
  };
  RM.el = function (id) { return document.getElementById(id); };

  /* ---- shared game state ---- */
  RM.state = {
    started: false,
    paused: false,
    over: false,
    busted: false,
    mode: 'foot',        // 'foot' | 'car'
    cash: 250,
    health: 100,
    carHealth: 100,
    wanted: 0,           // stars 0..5 (derived from heat)
    heat: 0,             // 0..100, drives wanted
    missionIndex: 0,
    missionActive: false,
    speed: 0,            // km/h, display only
    radio: true,
    muted: false,
    time: 0,
    playTime: 0,
    kills: 0,
    carsStolen: 0,
    message: '',
    messageUntil: 0,
    objective: ''
  };

  /* ---- shared slots (filled by other modules / main) ---- */
  RM.scene = null;
  RM.camera = null;
  RM.renderer = null;
  RM.keys = {};
  RM.camYaw = 0;
  RM.camPitch = 0.25;
  RM.player = null;
  RM.car = null;          // car Rook is currently driving, or null
  RM.cars = [];           // every car (parked + traffic)
  RM.trafficCars = [];
  RM.peds = [];
  RM.policeCars = [];
  RM.buildings = [];      // AABBs {minX,maxX,minZ,maxZ,h}
  RM.city = null;
  RM.heli = null;
  RM.policeMgr = null;
  RM.missionMgr = null;
  RM.audio = null;
})();

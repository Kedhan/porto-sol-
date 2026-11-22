// Red Mesa Heat — util.js
// Shared helpers, seeded RNG and the global game state object.
// Every other src file attaches to the RM namespace created here.
(function () {
  'use strict';
  var params = new URLSearchParams(window.location.search);
  var seed = parseInt(params.get('seed') || '1337', 10) || 1337;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var rng = mulberry32(seed);
  function rand(a, b) { return a + rng() * (b - a); }
  function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
  function pick(arr) { return arr[Math.floor(rng() * arr.length)]; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist2(ax, az, bx, bz) { var dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }
  function angleLerp(a, b, t) {
    var d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }
  function fmtCash(n) { return '$' + Math.floor(n).toLocaleString('en-US'); }

  window.RM = {
    seed: seed,
    shot: params.get('shot') || '',
    rng: rng, rand: rand, randInt: randInt, pick: pick,
    clamp: clamp, lerp: lerp, dist2: dist2, angleLerp: angleLerp, fmtCash: fmtCash,
    mulberry32: mulberry32,
    // World constants
    MAP: 460,            // half-size of the playable city
    ROAD_STEP: 90,       // distance between streets
    ROAD_W: 15,
    // Mutable game state, filled in by the other modules
    state: {
      started: false, paused: false, over: false, overKind: null,
      mode: 'foot',           // 'foot' | 'car'
      cash: 250, health: 100, carHealth: 100,
      wanted: 0, heat: 0,     // heat 0..100 drives the star level
      missionIndex: 0, missionActive: false, missionsDone: 0,
      speed: 0, radio: true, muted: false,
      time: 0, playTime: 0, carsStolen: 0,
      message: '', messageUntil: 0
    },
    player: null,       // { group, heading, speed, car, pos: THREE.Vector3 }
    car: null,          // the car the player is driving (or null)
    cars: [],           // traffic cars
    parked: [],         // parked (stealable) cars
    police: [],         // police cars
    peds: [],           // pedestrians
    enemies: [],        // on-foot crew enemies
    buildings: [],      // { minX, maxX, minZ, maxZ, h }
    heli: null,
    scene: null, camera: null, renderer: null,
    keys: {},
    camYaw: 0, camPitch: 0.32,
    audio: null, policeMgr: null, missionMgr: null
  };
})();

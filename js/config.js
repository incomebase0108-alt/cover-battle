// Tunable constants and stage definitions.
const CONFIG = {
  // Viewport (canvas) size — the visible window into the world.
  width: 960,
  height: 600,

  // The whole battlefield is larger than the screen; the camera scrolls to
  // follow the player. Stages are authored in a 960x600 design space and
  // scaled up to fill this world at load (see GameMap).
  world: { width: 1536, height: 960 },

  // The engine already supports any number of units per team (it just reads
  // the spawn arrays below). This is the planned cap for future multiplayer
  // where up to 8 humans can join — see the roadmap in README.
  maxPlayersPerTeam: 8,

  unit: {
    radius: 14,
    maxHp: 100,
    speed: 2.2,
    fireCooldown: 300, // ms between shots within a magazine
    magSize: 10,       // rounds per magazine before a reload is forced
    reloadTime: 3000,  // ms to reload an empty magazine (can't fire meanwhile)
    range: 360,        // how far a unit can see/shoot
    // Passive ammo recovery: stop firing for `ammoRegenDelay` ms and rounds
    // trickle back one per `ammoRegenInterval` ms. Emptying the magazine still
    // forces the full reload above — so spraying is punished, tapping rewarded.
    ammoRegenDelay: 800,
    ammoRegenInterval: 320,
  },

  bullet: {
    speed: 7,
    radius: 4,
    damage: 16,
    life: 1200,        // ms before a stray bullet despawns
    rockDamage: 25,    // damage bullets do to rocks
  },

  rock: {
    hp: 120,           // destructible rocks; 0 hp = shattered
    dropChance: 0.6,   // chance a destroyed rock leaves an item
  },

  bomb: {
    fuse: 1700,        // ms before it detonates
    radius: 90,        // blast radius
    damage: 70,        // damage to units in the blast
    rockDamage: 200,   // bombs flatten rocks
    flashTime: 320,    // ms the explosion is drawn
  },

  // Item pickups dropped by broken rocks. duration 0 = instant/permanent.
  items: {
    heal:    { label: "HEAL",  color: "#62e08a", heal: 45 },
    speed:   { label: "SPEED", color: "#ffd24a", speedMul: 1.5 },
    bullet:  { label: "B.SPD", color: "#5ad6ff", bulletSpeedMul: 1.6 },
    range:   { label: "RANGE", color: "#c98cff", rangeMul: 1.5 },
    bomb:    { label: "BOMB+", color: "#ff8a5a", bombUp: 1 },
  },
  itemRadius: 11,

  // Forest concealment: a unit hidden in a forest is invisible/untargetable
  // until an opposing unit comes within this distance (in px). Raise it to make
  // forests less safe, lower it to make ambushes stronger.
  forestDetectRange: 110,

  // Movement speed multiplier while wading through a river.
  riverSpeedMul: 0.5,

  // Home base/fort: standing in your own base slowly regenerates HP. The fort
  // also has a destructible core — destroy the enemy's fort to win, lose yours
  // and you're defeated.
  base: {
    radius: 95,        // healing-zone radius
    regenPerSec: 16,
    coreRadius: 30,    // the damageable structure at the centre
    hp: 600,           // fort durability
    bulletDamage: 10,  // damage a bullet does to a fort core
  },
};

// Weighted random item type for rock drops.
const ITEM_TYPES = ["heal", "speed", "bullet", "range", "bomb"];

// Each stage describes terrain plus spawn points for both teams.
// rocks/forests are circles: { x, y, r }. Spawns are arrays of { x, y }.
const STAGES = [
  {
    name: "STAGE 1 — 開けた荒野",
    rocks: [
      { x: 480, y: 300, r: 46 },
      { x: 250, y: 180, r: 34 },
      { x: 710, y: 420, r: 34 },
    ],
    forests: [
      { x: 200, y: 440, r: 64 },
      { x: 760, y: 160, r: 64 },
    ],
    // Mountains: indestructible solid cover. Rivers: passable but slow you down.
    mountains: [ { x: 250, y: 470, r: 44 } ],
    rivers: [ { x: 430, y: 0, w: 60, h: 600 } ],
    blueSpawns: [ { x: 90, y: 220 }, { x: 90, y: 300 }, { x: 90, y: 380 }, { x: 150, y: 300 } ],
    redSpawns:  [ { x: 870, y: 220 }, { x: 870, y: 300 }, { x: 870, y: 380 }, { x: 810, y: 300 } ],
    enemySkill: 0.65,
  },
  {
    name: "STAGE 2 — 岩だらけの峡谷",
    rocks: [
      { x: 360, y: 150, r: 40 }, { x: 600, y: 150, r: 40 },
      { x: 360, y: 450, r: 40 }, { x: 600, y: 450, r: 40 },
      { x: 480, y: 300, r: 52 },
    ],
    forests: [
      { x: 160, y: 300, r: 58 }, { x: 800, y: 300, r: 58 },
    ],
    mountains: [ { x: 480, y: 70, r: 36 }, { x: 480, y: 530, r: 36 } ],
    rivers: [ { x: 0, y: 275, w: 960, h: 50 } ],
    blueSpawns: [ { x: 90, y: 200 }, { x: 90, y: 400 }, { x: 160, y: 120 }, { x: 160, y: 480 } ],
    redSpawns:  [ { x: 870, y: 200 }, { x: 870, y: 400 }, { x: 800, y: 120 }, { x: 800, y: 480 } ],
    enemySkill: 0.8,
  },
  {
    name: "STAGE 3 — 深い森の戦場",
    rocks: [
      { x: 480, y: 120, r: 38 }, { x: 480, y: 480, r: 38 },
      { x: 300, y: 300, r: 34 }, { x: 660, y: 300, r: 34 },
    ],
    forests: [
      { x: 200, y: 160, r: 70 }, { x: 760, y: 160, r: 70 },
      { x: 200, y: 440, r: 70 }, { x: 760, y: 440, r: 70 },
      { x: 480, y: 300, r: 60 },
    ],
    mountains: [ { x: 130, y: 300, r: 34 }, { x: 830, y: 300, r: 34 } ],
    rivers: [ { x: 440, y: 0, w: 80, h: 600 } ],
    blueSpawns: [ { x: 90, y: 260 }, { x: 90, y: 340 }, { x: 150, y: 220 }, { x: 150, y: 380 } ],
    redSpawns:  [ { x: 870, y: 260 }, { x: 870, y: 340 }, { x: 810, y: 220 }, { x: 810, y: 380 } ],
    enemySkill: 0.95,
  },
  {
    name: "STAGE 4 — 双子山の回廊",
    // A central wall of mountains splits the field into an upper and lower
    // corridor. Two gaps (around y=300 center, and the open top/bottom edges)
    // keep the lanes connected so units can still reach each other.
    rocks: [
      { x: 480, y: 110, r: 36 }, { x: 480, y: 490, r: 36 },
      { x: 320, y: 300, r: 34 }, { x: 640, y: 300, r: 34 },
    ],
    forests: [
      { x: 230, y: 110, r: 60 }, { x: 730, y: 490, r: 60 },
      { x: 480, y: 300, r: 52 },
    ],
    // Three stacked mountains down the middle, leaving lane gaps top & bottom.
    mountains: [
      { x: 480, y: 210, r: 40 }, { x: 480, y: 300, r: 40 }, { x: 480, y: 390, r: 40 },
    ],
    rivers: [ { x: 0, y: 280, w: 960, h: 40 } ],
    blueSpawns: [ { x: 90, y: 150 }, { x: 90, y: 450 }, { x: 150, y: 250 }, { x: 150, y: 350 } ],
    redSpawns:  [ { x: 870, y: 150 }, { x: 870, y: 450 }, { x: 810, y: 250 }, { x: 810, y: 350 } ],
    enemySkill: 0.97,
  },
  {
    name: "STAGE 5 — 渡河の攻防",
    // A wide river cuts the map vertically; rocks form stepping cover in the
    // crossing, and forests line both banks for ambushes while wading.
    rocks: [
      { x: 480, y: 140, r: 34 }, { x: 480, y: 300, r: 44 }, { x: 480, y: 460, r: 34 },
      { x: 380, y: 220, r: 30 }, { x: 580, y: 380, r: 30 },
    ],
    forests: [
      { x: 300, y: 110, r: 58 }, { x: 660, y: 490, r: 58 },
      { x: 300, y: 490, r: 58 }, { x: 660, y: 110, r: 58 },
    ],
    mountains: [ { x: 480, y: 60, r: 30 }, { x: 480, y: 540, r: 30 } ],
    rivers: [ { x: 410, y: 0, w: 140, h: 600 } ],
    blueSpawns: [ { x: 90, y: 240 }, { x: 90, y: 360 }, { x: 150, y: 180 }, { x: 150, y: 420 } ],
    redSpawns:  [ { x: 870, y: 240 }, { x: 870, y: 360 }, { x: 810, y: 180 }, { x: 810, y: 420 } ],
    enemySkill: 1.0,
  },
  {
    name: "STAGE 6 — 岩塞の決戦",
    // Final stage: each base is ringed by a rock fortress with a single funnel
    // opening, mountains anchor the flanks, and a central forest contests the
    // middle. A river snakes across to slow any frontal rush.
    rocks: [
      // Blue fortress wall (opening toward y=300 center-right)
      { x: 250, y: 200, r: 34 }, { x: 280, y: 300, r: 34 }, { x: 250, y: 400, r: 34 },
      // Red fortress wall (opening toward y=300 center-left)
      { x: 710, y: 200, r: 34 }, { x: 680, y: 300, r: 34 }, { x: 710, y: 400, r: 34 },
      // Central contested cover
      { x: 480, y: 180, r: 38 }, { x: 480, y: 420, r: 38 },
    ],
    forests: [
      { x: 480, y: 300, r: 64 },
      { x: 250, y: 90, r: 50 }, { x: 710, y: 510, r: 50 },
    ],
    mountains: [
      { x: 480, y: 70, r: 36 }, { x: 480, y: 530, r: 36 },
      { x: 380, y: 300, r: 30 }, { x: 580, y: 300, r: 30 },
    ],
    rivers: [ { x: 0, y: 285, w: 960, h: 36 }, { x: 460, y: 0, w: 40, h: 600 } ],
    blueSpawns: [ { x: 90, y: 230 }, { x: 90, y: 370 }, { x: 150, y: 280 }, { x: 150, y: 360 } ],
    redSpawns:  [ { x: 870, y: 230 }, { x: 870, y: 370 }, { x: 810, y: 280 }, { x: 810, y: 360 } ],
    enemySkill: 1.0,
  },
];

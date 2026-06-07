// Tunable constants and stage definitions.
const CONFIG = {
  width: 960,
  height: 600,

  // The engine already supports any number of units per team (it just reads
  // the spawn arrays below). This is the planned cap for future multiplayer
  // where up to 8 humans can join — see the roadmap in README.
  maxPlayersPerTeam: 8,

  unit: {
    radius: 14,
    maxHp: 100,
    speed: 2.2,
    fireCooldown: 420, // ms between shots
    range: 360,        // how far a unit can see/shoot
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

  // Forest concealment: a hidden unit can only be targeted from this close.
  forestDetectRange: 110,
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
    blueSpawns: [ { x: 90, y: 260 }, { x: 90, y: 340 }, { x: 150, y: 220 }, { x: 150, y: 380 } ],
    redSpawns:  [ { x: 870, y: 260 }, { x: 870, y: 340 }, { x: 810, y: 220 }, { x: 810, y: 380 } ],
    enemySkill: 0.95,
  },
];

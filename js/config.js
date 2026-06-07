// Tunable constants and stage definitions.
const CONFIG = {
  // Viewport (canvas) size — the visible window into the world. On the web this
  // is overwritten at runtime to match the device screen (see main.js).
  width: 960,
  height: 600,

  // Fixed authoring space for stages. World scaling uses THIS (not the viewport)
  // so terrain is identical on every device and the LAN server/client agree.
  design: { width: 960, height: 600 },

  // The whole battlefield is larger than the screen; the camera scrolls to
  // follow the player. Stages are authored in a 960x600 design space and
  // scaled up to fill this world at load (see GameMap).
  world: { width: 3600, height: 2250 },

  // Units per team (the engine supports any number; stages auto-generate spawns).
  teamSize: 7,

  // Selectable AI difficulty. A single coefficient `aiSkill` (0 = weak … 1 =
  // strong) expresses how good the AI is: it drives aim accuracy, reaction time,
  // fire rate, the distance it engages from and its bullet damage (see ai.js).
  // `difficulty` names the active level; `aiSkill` maps each level to a value.
  // LAN and single-player both expose a selector; the default is "easy" because
  // the full-skill AI was too strong.
  difficulty: "easy",
  aiSkill: { easy: 0.35, normal: 0.6, hard: 0.85 },

  // Forest radii are multiplied by this at load so woods feel bigger/denser.
  forestScale: 1.6,

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
  // 山岳海兵（canClimb）は水の扱いに長け、川の上をむしろ速く移動できる。
  climberRiverSpeedMul: 1.3,
  // Movement speed multiplier while crossing desert sand.
  sandSpeedMul: 0.7,

  // Neutral control point at mid-field: stand near it (uncontested) to capture
  // it for your team; a captured point heals your team and is a forward foothold.
  capture: {
    radius: 80,         // how close you must be to contest/capture
    captureTime: 3500,  // ms of uncontested presence to flip it
  },

  // Fortress gates (城門): destructible barriers at the top & bottom of each
  // fort's front wall. Allies pass freely; the enemy must destroy a gate to get
  // through. Walls around them are indestructible.
  gate: {
    hp: 260,
    bulletDamage: 10,
  },

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

  // 大将ルール：総大将(slot0)が倒れている間、そのチームは回復ゾーン(砦)が無効化され、
  // 全味方が moraleMul ぶん弱体（移動・与ダメ低下）。救出されず discardMs を超えると
  // 「討死」＝サドンデス(storm)が発動して決着を促す。
  morale: {
    debuffMul: 0.7,    // 大将が倒れている間の味方の移動/与ダメ倍率
    discardMs: 14000,  // この時間 救出されないと「討死」扱い
  },

  // 刀の振りアニメーション時間（ms）。攻撃時にこの時間だけ刃の弧を描く。
  melee: { swingMs: 220 },

  // じゃんけん三角の相性ダメージ：槍＞剣、剣＞弓、弓＞槍。有利な相手にこの倍率。
  rps: { bonus: 1.5 },

  // 体力（スタミナ）：攻撃すると消費し、0に近いほど移動が鈍る。止まれば自然回復。
  // 全クラス共通（刀の振り＝大きく消費、弓/鉄砲の射撃＝中程度）。連戦すると息切れする。
  stamina: {
    max: 100,
    swingCost: 34,     // 刀1振りの消費（大きめ＝振りすぎると一気に鈍る）
    shootCost: 20,     // 弓/鉄砲 1射の消費
    regenPerSec: 24,   // 毎秒の回復（やや遅め）
    minSpeedMul: 0.42, // 体力0での移動倍率（満タンで1.0）
  },
};

// Difficulty levels in order, with the Japanese labels shown on the selector
// (やさしい / ふつう / つよい). The numeric strength of each lives in
// CONFIG.aiSkill above.
const DIFFICULTY_ORDER = ["easy", "normal", "hard"];
const DIFFICULTY_LABEL = { easy: "やさしい", normal: "ふつう", hard: "つよい" };

// Resolve the aiSkill coefficient for a difficulty level (falls back to the
// "normal" value, then 0.6, if the table or level is missing).
function aiSkillFor(level) {
  const tbl = CONFIG.aiSkill || {};
  if (tbl[level] != null) return tbl[level];
  return tbl.normal != null ? tbl.normal : 0.6;
}

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
      // Scattered lone boulders breaking up the open ground.
      { x: 360, y: 420, r: 28 }, { x: 600, y: 180, r: 28 },
    ],
    forests: [
      { x: 200, y: 440, r: 64 },
      { x: 760, y: 160, r: 64 },
      // Small mid-field copses to break sightlines without closing the field.
      { x: 340, y: 110, r: 40 }, { x: 620, y: 490, r: 40 },
    ],
    // Mountains: indestructible solid cover. Rivers: passable but slow you down.
    mountains: [ { x: 250, y: 470, r: 44 }, { x: 540, y: 470, r: 32 } ],
    rivers: [ { x: 430, y: 0, w: 60, h: 600 } ],
    // A dry sand patch off-center adds a slow zone without choking the lanes.
    sand: [ { x: 300, y: 230, w: 160, h: 140 } ],
    // Ledges in front of each fort: climbers cross straight (shortcut), others
    // detour around the open top/bottom lanes.
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
      // Extra rubble fills out the canyon into a dense destructible-cover maze.
      { x: 290, y: 300, r: 30 }, { x: 670, y: 300, r: 30 },
      { x: 480, y: 160, r: 28 }, { x: 480, y: 440, r: 28 },
      { x: 420, y: 230, r: 24 }, { x: 540, y: 370, r: 24 },
    ],
    forests: [
      { x: 160, y: 300, r: 58 }, { x: 800, y: 300, r: 58 },
      // Tucked-away thickets give a flanker something to hide behind.
      { x: 480, y: 70, r: 34 }, { x: 480, y: 530, r: 34 },
    ],
    mountains: [ { x: 480, y: 70, r: 36 }, { x: 480, y: 530, r: 36 } ],
    rivers: [ { x: 0, y: 275, w: 960, h: 50 } ],
    // Staggered "banks" (土手) flanking the central rock: climbers cut straight
    // across toward mid-field; others detour around the open ends of each bank.
    ledges: [
      { x: 380, y: 360, w: 50, h: 170 }, { x: 530, y: 70, w: 50, h: 170 },
      // Two more short banks add raised firing steps over the rubble.
      { x: 290, y: 110, w: 46, h: 120 }, { x: 620, y: 370, w: 46, h: 120 },
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
      // Dense canopy infill — overlapping copses turn the mid into near-total
      // concealment, with only thin sightline gaps between clumps.
      { x: 360, y: 180, r: 50 }, { x: 600, y: 180, r: 50 },
      { x: 360, y: 420, r: 50 }, { x: 600, y: 420, r: 50 },
      { x: 480, y: 110, r: 36 }, { x: 480, y: 490, r: 36 },
    ],
    mountains: [ { x: 130, y: 300, r: 34 }, { x: 830, y: 300, r: 34 } ],
    rivers: [ { x: 440, y: 0, w: 80, h: 600 } ],
    // Diagonal banks (土手) through the woods: a climber slips along the raised
    // ground for a fast push; regular troops swing around the open ends.
    ledges: [ { x: 280, y: 195, w: 170, h: 46 }, { x: 510, y: 365, w: 170, h: 46 } ],
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
      // Cover stationed inside each corridor for the fights along the lanes.
      { x: 380, y: 110, r: 26 }, { x: 580, y: 490, r: 26 },
      { x: 380, y: 490, r: 26 }, { x: 580, y: 110, r: 26 },
    ],
    forests: [
      { x: 230, y: 110, r: 60 }, { x: 730, y: 490, r: 60 },
      { x: 480, y: 300, r: 52 },
      // Brush at the lane gaps where the corridors reconnect — ambush the crossers.
      { x: 480, y: 60, r: 34 }, { x: 480, y: 540, r: 34 },
    ],
    // Stacked mountains down the middle plus short outer spurs tighten the
    // wall, but the top & bottom lane gaps stay open so units still cross.
    mountains: [
      { x: 480, y: 210, r: 40 }, { x: 480, y: 300, r: 40 }, { x: 480, y: 390, r: 40 },
      { x: 380, y: 300, r: 28 }, { x: 580, y: 300, r: 28 },
    ],
    rivers: [ { x: 0, y: 280, w: 960, h: 40 } ],
    // Banks gate the top & bottom lane gaps that bypass the mountain wall:
    // climbers cross the gap directly, foot troops peel around the open ends.
    ledges: [ { x: 330, y: 60, w: 130, h: 48 }, { x: 500, y: 492, w: 130, h: 48 } ],
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
      // Stepping-stone boulders staggered across the ford for in-river cover.
      { x: 440, y: 80, r: 24 }, { x: 520, y: 220, r: 24 },
      { x: 440, y: 380, r: 24 }, { x: 520, y: 520, r: 24 },
    ],
    forests: [
      { x: 300, y: 110, r: 58 }, { x: 660, y: 490, r: 58 },
      { x: 300, y: 490, r: 58 }, { x: 660, y: 110, r: 58 },
      // Reed thickets right on the banks to ambush troops mid-wade.
      { x: 360, y: 300, r: 36 }, { x: 600, y: 300, r: 36 },
    ],
    mountains: [ { x: 480, y: 60, r: 30 }, { x: 480, y: 540, r: 30 } ],
    rivers: [
      { x: 410, y: 0, w: 140, h: 600 },
      // Tributary inlets reaching off the main channel widen the slow zone.
      { x: 280, y: 280, w: 130, h: 40 }, { x: 550, y: 280, w: 130, h: 40 },
    ],
    // Raised banks let climbers vault the main channel as a shortcut; foot
    // troops still have the open river to wade across.
    ledges: [ { x: 380, y: 130, w: 200, h: 44 }, { x: 380, y: 426, w: 200, h: 44 } ],
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
      // Forward redoubts pushed out from each fortress toward the middle.
      { x: 380, y: 180, r: 30 }, { x: 580, y: 420, r: 30 },
      { x: 380, y: 420, r: 30 }, { x: 580, y: 180, r: 30 },
    ],
    forests: [
      { x: 480, y: 300, r: 64 },
      { x: 250, y: 90, r: 50 }, { x: 710, y: 510, r: 50 },
      // Scrub flanking the central wood thickens the midfield brawl.
      { x: 360, y: 90, r: 40 }, { x: 600, y: 510, r: 40 },
    ],
    mountains: [
      { x: 480, y: 70, r: 36 }, { x: 480, y: 530, r: 36 },
      { x: 380, y: 300, r: 30 }, { x: 580, y: 300, r: 30 },
    ],
    rivers: [
      { x: 0, y: 285, w: 960, h: 36 }, { x: 460, y: 0, w: 40, h: 600 },
      // A diagonal-feel pair of moat arms slows the approach to center.
      { x: 320, y: 200, w: 36, h: 200 }, { x: 604, y: 200, w: 36, h: 200 },
    ],
    blueSpawns: [ { x: 90, y: 230 }, { x: 90, y: 370 }, { x: 150, y: 280 }, { x: 150, y: 360 } ],
    redSpawns:  [ { x: 870, y: 230 }, { x: 870, y: 370 }, { x: 810, y: 280 }, { x: 810, y: 360 } ],
    enemySkill: 1.0,
  },
  {
    name: "STAGE 7 — 砂漠とオアシス",
    // Open desert (slows movement) with neutral oases that heal — contest them.
    rocks: [
      { x: 480, y: 160, r: 36 }, { x: 480, y: 440, r: 36 }, { x: 330, y: 300, r: 30 }, { x: 630, y: 300, r: 30 },
      // Rare rocky outcrops give scarce hard cover amid the dunes.
      { x: 400, y: 230, r: 24 }, { x: 560, y: 370, r: 24 },
    ],
    forests: [
      { x: 200, y: 110, r: 50 }, { x: 760, y: 490, r: 50 },
      // Sparse palm stands cling to the oasis edges.
      { x: 300, y: 200, r: 34 }, { x: 660, y: 400, r: 34 },
    ],
    mountains: [ { x: 480, y: 300, r: 40 }, { x: 480, y: 90, r: 28 }, { x: 480, y: 510, r: 28 } ],
    rivers: [],
    // Deeper drift dunes layered on the sand sea make a slow center.
    sand: [
      { x: 120, y: 0, w: 720, h: 600 },
      { x: 360, y: 110, w: 240, h: 110 }, { x: 360, y: 380, w: 240, h: 110 },
    ],
    oases: [
      { x: 300, y: 300, r: 60 }, { x: 660, y: 300, r: 60 }, { x: 480, y: 90, r: 48 },
      // A fourth, southern oasis to fight over.
      { x: 480, y: 510, r: 48 },
    ],
    blueSpawns: [ { x: 90, y: 230 }, { x: 90, y: 370 }, { x: 150, y: 290 }, { x: 150, y: 350 } ],
    redSpawns:  [ { x: 870, y: 230 }, { x: 870, y: 370 }, { x: 810, y: 290 }, { x: 810, y: 350 } ],
    enemySkill: 1.0,
  },
  {
    name: "STAGE 8 — 四つの砦跡",
    rocks: [
      { x: 300, y: 160, r: 40 }, { x: 660, y: 160, r: 40 },
      { x: 300, y: 440, r: 40 }, { x: 660, y: 440, r: 40 },
      { x: 480, y: 300, r: 30 },
      // Crumbled outer walls ring each of the four ruined forts.
      { x: 370, y: 160, r: 22 }, { x: 590, y: 160, r: 22 },
      { x: 370, y: 440, r: 22 }, { x: 590, y: 440, r: 22 },
      { x: 300, y: 230, r: 22 }, { x: 660, y: 230, r: 22 },
      { x: 300, y: 370, r: 22 }, { x: 660, y: 370, r: 22 },
    ],
    forests: [
      { x: 480, y: 110, r: 56 }, { x: 480, y: 490, r: 56 }, { x: 150, y: 300, r: 48 }, { x: 810, y: 300, r: 48 },
      // Overgrowth reclaiming the gaps between the ruins.
      { x: 390, y: 300, r: 30 }, { x: 570, y: 300, r: 30 },
    ],
    mountains: [ { x: 300, y: 300, r: 30 }, { x: 660, y: 300, r: 30 } ],
    rivers: [ { x: 0, y: 285, w: 960, h: 36 } ],
    // Central plateau (高台) around the mid rock: three banks with the right
    // side left open. Climbers scale straight up to the high ground; everyone
    // else must funnel in through the eastern entrance.
    ledges: [
      { x: 410, y: 226, w: 140, h: 46 },
      { x: 410, y: 328, w: 140, h: 46 },
      { x: 410, y: 226, w: 46, h: 148 },
    ],
    blueSpawns: [ { x: 90, y: 230 }, { x: 90, y: 370 }, { x: 150, y: 290 }, { x: 150, y: 350 } ],
    redSpawns:  [ { x: 870, y: 230 }, { x: 870, y: 370 }, { x: 810, y: 290 }, { x: 810, y: 350 } ],
    enemySkill: 1.0,
  },
  {
    name: "STAGE 9 — 山岳要塞",
    rocks: [ { x: 480, y: 150, r: 34 }, { x: 480, y: 450, r: 34 }, { x: 360, y: 300, r: 30 }, { x: 600, y: 300, r: 30 } ],
    forests: [ { x: 230, y: 480, r: 58 }, { x: 730, y: 120, r: 58 } ],
    mountains: [
      { x: 480, y: 60, r: 36 }, { x: 480, y: 540, r: 36 },
      { x: 360, y: 160, r: 30 }, { x: 600, y: 160, r: 30 },
      { x: 360, y: 440, r: 30 }, { x: 600, y: 440, r: 30 },
      // Inner peaks ring the redoubt tighter, but the east/west flank lanes
      // (around x300 and x680 at mid-height) stay open for foot troops.
      { x: 300, y: 240, r: 26 }, { x: 660, y: 240, r: 26 },
      { x: 300, y: 360, r: 26 }, { x: 660, y: 360, r: 26 },
    ],
    rivers: [ { x: 440, y: 0, w: 80, h: 600 } ],
    oases: [ { x: 480, y: 300, r: 54 } ],
    // The healing oasis sits on a raised redoubt: banks wall it off north & south
    // while the east/west sides stay open. Climbers vault straight onto the heal
    // point; foot soldiers must enter from the flanks (across the river lane).
    // Extra outer terraces add a second tier of high ground for climbers.
    ledges: [
      { x: 400, y: 206, w: 160, h: 40 }, { x: 400, y: 354, w: 160, h: 40 },
      { x: 300, y: 120, w: 120, h: 38 }, { x: 540, y: 442, w: 120, h: 38 },
    ],
    blueSpawns: [ { x: 90, y: 230 }, { x: 90, y: 370 }, { x: 150, y: 290 }, { x: 150, y: 350 } ],
    redSpawns:  [ { x: 870, y: 230 }, { x: 870, y: 370 }, { x: 810, y: 290 }, { x: 810, y: 350 } ],
    enemySkill: 1.0,
  },
  {
    name: "STAGE 10 — 最終決戦",
    // Everything at once: desert flanks, central oasis, fortified rocks, a river.
    rocks: [
      { x: 260, y: 220, r: 32 }, { x: 260, y: 380, r: 32 },
      { x: 700, y: 220, r: 32 }, { x: 700, y: 380, r: 32 },
      { x: 480, y: 170, r: 36 }, { x: 480, y: 430, r: 36 },
      // Forward rubble bridging the bases to the center cauldron.
      { x: 380, y: 220, r: 24 }, { x: 580, y: 380, r: 24 },
      { x: 380, y: 380, r: 24 }, { x: 580, y: 220, r: 24 },
    ],
    forests: [
      { x: 480, y: 300, r: 60 }, { x: 200, y: 110, r: 48 }, { x: 760, y: 490, r: 48 },
      // Flanking woods around the central thicket.
      { x: 340, y: 110, r: 38 }, { x: 620, y: 490, r: 38 },
    ],
    mountains: [
      { x: 480, y: 64, r: 34 }, { x: 480, y: 536, r: 34 }, { x: 360, y: 300, r: 26 }, { x: 600, y: 300, r: 26 },
      { x: 480, y: 120, r: 22 }, { x: 480, y: 480, r: 22 },
    ],
    rivers: [ { x: 0, y: 285, w: 960, h: 34 }, { x: 300, y: 380, w: 360, h: 30 } ],
    // Central drifting sand strip adds a slow band on top of the flank deserts.
    sand: [
      { x: 0, y: 0, w: 220, h: 600 }, { x: 740, y: 0, w: 220, h: 600 },
      { x: 330, y: 180, w: 300, h: 90 },
    ],
    oases: [ { x: 480, y: 440, r: 46 }, { x: 480, y: 220, r: 40 } ],
    // High-ground steps flanking the center for climbers in the final fight.
    ledges: [ { x: 320, y: 280, w: 110, h: 40 }, { x: 530, y: 280, w: 110, h: 40 } ],
    blueSpawns: [ { x: 80, y: 230 }, { x: 80, y: 370 }, { x: 140, y: 290 }, { x: 140, y: 350 } ],
    redSpawns:  [ { x: 880, y: 230 }, { x: 880, y: 370 }, { x: 820, y: 290 }, { x: 820, y: 350 } ],
    enemySkill: 1.0,
  },

  // 山城決戦：中央＝山城本丸(山＝破壊不可の高地)を石垣(rocks)で囲み、堀(rivers)で四方を
  // 囲う。攻め手は石垣を崩すか堀を渡って虎口(上下/中央の開口)から本丸へ。森林帯は
  // 忍者/騎馬の側面奇襲ルート。両軍の砦・城門は spawn 周囲に自動生成される（二段攻城）。
  {
    name: "山城決戦",
    rocks: [
      // 本丸の石垣リング（中央高地を囲む。上下に虎口＝開口を残す）。
      { x: 430, y: 230, r: 30 }, { x: 480, y: 215, r: 30 }, { x: 530, y: 230, r: 30 },
      { x: 410, y: 300, r: 30 }, { x: 550, y: 300, r: 30 },
      { x: 430, y: 370, r: 30 }, { x: 480, y: 385, r: 30 }, { x: 530, y: 370, r: 30 },
      // 二の丸の外石垣（前進拠点）。
      { x: 330, y: 180, r: 28 }, { x: 630, y: 420, r: 28 },
      { x: 330, y: 420, r: 28 }, { x: 630, y: 180, r: 28 },
      // 大手道（中央水平ルート）の散石。
      { x: 250, y: 300, r: 26 }, { x: 710, y: 300, r: 26 },
    ],
    forests: [
      { x: 200, y: 120, r: 56 }, { x: 760, y: 480, r: 56 },
      { x: 200, y: 480, r: 56 }, { x: 760, y: 120, r: 56 },
      { x: 480, y: 110, r: 44 }, { x: 480, y: 490, r: 44 },
    ],
    mountains: [
      // 本丸＝中央の連山（破壊不可の高地＝天守の土台）。
      { x: 480, y: 300, r: 46 }, { x: 440, y: 260, r: 30 }, { x: 520, y: 260, r: 30 },
      { x: 440, y: 340, r: 30 }, { x: 520, y: 340, r: 30 },
      // 北/南の自然障壁。
      { x: 480, y: 60, r: 34 }, { x: 480, y: 540, r: 34 },
    ],
    rivers: [
      // 堀（本丸を囲む水帯。攻城は虎口か堀渡りを強いられる）。
      { x: 360, y: 160, w: 240, h: 34 }, // 北の堀
      { x: 360, y: 406, w: 240, h: 34 }, // 南の堀
      { x: 352, y: 160, w: 34, h: 280 }, // 西の堀
      { x: 574, y: 160, w: 34, h: 280 }, // 東の堀
    ],
    blueSpawns: [ { x: 90, y: 230 }, { x: 90, y: 370 }, { x: 150, y: 290 }, { x: 150, y: 360 } ],
    redSpawns:  [ { x: 870, y: 230 }, { x: 870, y: 370 }, { x: 810, y: 290 }, { x: 810, y: 360 } ],
    enemySkill: 1.0,
  },
];

// LANロビーのステージセレクタ用（難易度セレクタと同じ作法）。表示名は各ステージの name。
const STAGE_ORDER = STAGES.map((_, i) => i);
const STAGE_LABEL = STAGES.map((s) => s.name);

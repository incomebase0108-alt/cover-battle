// Shared test harness for Cover Battle.
//
// The game ships as plain <script> globals meant for the browser. To unit-test
// the pure logic in Node we build a `vm` sandbox, stub out the few browser
// globals the scripts touch (window/document/Canvas/requestAnimationFrame),
// load the source files in dependency order, and hand back the populated
// sandbox so individual test files can poke at Game/Unit/CONFIG/etc.
//
// NOTE: nothing here writes to the game source — the sandbox only *reads* the
// js/*.js files. Tests must never mutate the source on disk.

const fs = require("fs");
const vm = require("vm");
const path = require("path");

const JS_DIR = path.resolve(__dirname, "..", "js");

// Load order matters: weapons.js must precede entities.js (the Unit
// constructor calls getWeapon()), config.js before everything that reads
// CONFIG, vector.js first (V is used everywhere).
const LOAD_ORDER = [
  "vector.js",
  "config.js",
  "classes.js",
  "weapons.js",
  "chest.js",
  "beast.js",
  "abilities.js",
  "input.js",
  "map.js",
  "entities.js",
  "ai.js",
  "overlay.js",
  "game.js",
];

// A Canvas 2D context where every method is a no-op and the gradient factories
// return an object with a no-op addColorStop (the only method the draw code
// calls on a gradient).
function makeCtx() {
  const noop = () => {};
  return new Proxy(
    {},
    {
      get: (_t, k) =>
        typeof k === "string" && k.startsWith("create")
          ? () => ({ addColorStop: noop })
          : noop,
    }
  );
}

function makeCanvas() {
  const noop = () => {};
  const ctx = makeCtx();
  return {
    getContext: () => ctx,
    width: 960,
    height: 600,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 600 }),
    addEventListener: noop,
  };
}

// Build a fresh sandbox with all game globals loaded. Each call is independent
// so tests don't leak mutated CONFIG/state into one another.
function loadGame() {
  const noop = () => {};
  const sandbox = {
    Math,
    console,
    performance: { now: () => Date.now() },
    requestAnimationFrame: noop,
    cancelAnimationFrame: noop,
    window: { addEventListener: noop },
    document: { body: { classList: { add: noop, remove: noop } } },
    navigator: { maxTouchPoints: 0 },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const f of LOAD_ORDER) {
    const code = fs.readFileSync(path.join(JS_DIR, f), "utf8");
    vm.runInContext(code, sandbox, { filename: f });
  }
  // The game source declares its API with top-level `const`/`class`/`function`.
  // In a `vm` context those become *lexical* bindings, NOT properties of the
  // sandbox object, so `sandbox.Game`/`sandbox.CONFIG`/etc. would be undefined.
  // We run a tiny snippet IN THE SAME CONTEXT to copy the known globals onto
  // globalThis so test files can reach them via the returned sandbox. This does
  // not touch the source on disk — it only reflects already-loaded bindings.
  const EXPORTS = [
    "V",
    "CONFIG",
    "STAGES",
    "STAGE_ORDER",
    "STAGE_LABEL",
    "DIFFICULTY_ORDER",
    "DIFFICULTY_LABEL",
    "aiSkillFor",
    "ITEM_TYPES",
    "WEAPONS",
    "WEAPON_ORDER",
    "CHEST_LOOT",
    "rpsBonus",
    "weaponRps",
    "rpsMatchup",
    "CLASSES",
    "getClass",
    "getWeapon",
    "Input",
    "GameMap",
    "Bullet",
    "Item",
    "Bomb",
    "Chest",
    "Keg",
    "Beast",
    "Smoke",
    "Turret",
    "ABILITY",
    "RESCUE",
    "Unit",
    "AIController",
    "Game",
  ];
  const exporter = EXPORTS.map(
    (n) => `try { globalThis.${n} = ${n}; } catch (e) {}`
  ).join("\n");
  vm.runInContext(exporter, sandbox, { filename: "__exports__" });
  return sandbox;
}

// Convenience: a loaded sandbox plus a constructed Game on stage `index`
// (default 0) with no-op HUD and a capturable onEnd result.
function newGame(index = 0) {
  const sb = loadGame();
  const ended = { value: null };
  const canvas = makeCanvas();
  const game = new sb.Game(canvas, {
    onHud: () => {},
    onEnd: (win, hasNext, idx, reason) => {
      ended.value = { win, hasNext, idx, reason };
    },
  });
  game.loadStage(index);
  return { sb, game, ended, canvas };
}

module.exports = { loadGame, newGame, makeCanvas, makeCtx, JS_DIR, LOAD_ORDER };

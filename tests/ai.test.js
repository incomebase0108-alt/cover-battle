// Tests for the "brainy" AIController state machine and its helper methods.
//
// We build a real Game (so map/forests/rocks/bases are populated), then strip
// the auto-spawned units and place our own to create deterministic scenarios.
// Helpers are pure-ish, so most assertions check their return values; movement
// behaviour is checked by stepping update() once and comparing distances.

const { newGame } = require("./harness");
const { suite } = require("./assert");

const s = suite();

// Fresh game on a chosen stage with no units (we add our own).
function emptyGame(stage = 0) {
  const ctx = newGame(stage);
  ctx.game.units = [];
  // Strip neutral entities so unit-behaviour tests are deterministic.
  ctx.game.beasts = [];
  ctx.game.items = [];
  ctx.game.smokes = [];
  ctx.game.turrets = [];
  return ctx;
}

// Place a controlled AI unit at (x,y); skill defaults high so cautious logic
// engages. Returns the unit (its .ai is a fresh AIController).
function spawnAI(sb, game, x, y, team, skill = 0.9) {
  const u = new sb.Unit(x, y, team);
  u.ai = new sb.AIController();
  u.skill = skill;
  game.units.push(u);
  return u;
}

// Distance between a unit and its own fort.
function distToHome(game, u) {
  const b = game.map.baseOf(u.team);
  return Math.hypot(u.x - b.x, u.y - b.y);
}

// ---- helper: nearestForest ------------------------------------------------

s.test("nearestForest returns the closest forest to the unit", (t) => {
  const { sb, game } = emptyGame(0);
  const u = spawnAI(sb, game, 100, 100, "blue");
  const got = u.ai.nearestForest(u, game);
  t.ok(got !== null, "a forest is found");
  // Verify it is indeed the minimum-distance forest.
  let best = null;
  let bestD = Infinity;
  for (const f of game.map.forests) {
    const d = Math.hypot(u.x - f.x, u.y - f.y);
    if (d < bestD) { bestD = d; best = f; }
  }
  t.equal(got, best, "returned forest is the genuine nearest");
});

s.test("nearestForest returns null when there are no forests", (t) => {
  const { sb, game } = emptyGame(0);
  game.map.forests = [];
  const u = spawnAI(sb, game, 100, 100, "blue");
  t.equal(u.ai.nearestForest(u, game), null, "no forest -> null");
});

// ---- helper: nearestCover -------------------------------------------------

s.test("nearestCover finds a solid between the unit and the target", (t) => {
  const { sb, game } = emptyGame(0);
  // Pick a rock and place the unit and an enemy on opposite sides of it so the
  // rock is squarely on the firing line.
  const rock = game.map.rocks[0];
  const u = spawnAI(sb, game, rock.x - 200, rock.y, "blue");
  const enemy = spawnAI(sb, game, rock.x + 200, rock.y, "red");
  const cover = u.ai.nearestCover(u, enemy, game);
  t.ok(cover !== null, "cover found on the firing line");
  t.equal(cover, rock, "the aligned rock is chosen as cover");
});

s.test("coverSpot lies between the cover and... places cover toward enemy", (t) => {
  const { sb, game } = emptyGame(0);
  const rock = game.map.rocks[0];
  const u = spawnAI(sb, game, rock.x - 200, rock.y, "blue");
  const enemy = spawnAI(sb, game, rock.x + 200, rock.y, "red");
  const spot = u.ai.coverSpot(u, rock, enemy);
  // The spot should be on the unit's side of the rock (smaller x here), so the
  // rock sits between the spot and the enemy.
  t.lessThan(spot.x, rock.x, "cover spot is on the side away from the enemy");
});

// ---- helper: shouldRetreat / healedEnough ---------------------------------

s.test("shouldRetreat is true at low HP and false at full HP", (t) => {
  const { sb, game } = emptyGame(0);
  const u = spawnAI(sb, game, 100, 100, "blue");
  u.hp = sb.CONFIG.unit.maxHp; // full
  t.equal(u.ai.shouldRetreat(u), false, "full HP -> no retreat");
  u.hp = sb.CONFIG.unit.maxHp * 0.3; // below 40%
  t.equal(u.ai.shouldRetreat(u), true, "low HP -> retreat");
});

s.test("shouldRetreat has hysteresis: stays true until HP recovers past 80%", (t) => {
  const { sb, game } = emptyGame(0);
  const u = spawnAI(sb, game, 100, 100, "blue");
  u.hp = sb.CONFIG.unit.maxHp * 0.3;
  t.equal(u.ai.shouldRetreat(u), true, "dips below 40 -> retreating");
  u.hp = sb.CONFIG.unit.maxHp * 0.6; // recovering but not enough
  t.equal(u.ai.shouldRetreat(u), true, "still retreating at 60% (sticky)");
  u.hp = sb.CONFIG.unit.maxHp * 0.85; // recovered
  t.equal(u.ai.shouldRetreat(u), false, "recovered past 80% -> rejoin");
});

// ---- behaviour: RETREAT ---------------------------------------------------

s.test("a low-HP unit retreats toward its home fort", (t) => {
  const { sb, game } = emptyGame(0);
  const base = game.map.baseOf("blue");
  // Place the unit well away from home and wounded, with an enemy near.
  const u = spawnAI(sb, game, base.x + 400, base.y + 200, "blue");
  u.hp = sb.CONFIG.unit.maxHp * 0.25;
  spawnAI(sb, game, base.x + 460, base.y + 200, "red");
  const before = distToHome(game, u);
  t.equal(u.ai.desiredState(u, game), sb.AIController.STATE.RETREAT, "state is RETREAT");
  for (let i = 0; i < 20; i++) u.update(16, game); // net progress (steering may detour a frame)
  const after = distToHome(game, u);
  t.lessThan(after, before, "moved closer to home fort while retreating");
});

s.test("a low-HP unit does not close on a nearby enemy", (t) => {
  const { sb, game } = emptyGame(0);
  const base = game.map.baseOf("blue");
  const u = spawnAI(sb, game, base.x + 400, base.y, "blue");
  u.hp = sb.CONFIG.unit.maxHp * 0.2;
  // Enemy positioned away from home so retreating necessarily increases the gap.
  const enemy = spawnAI(sb, game, base.x + 520, base.y, "red");
  const before = Math.hypot(u.x - enemy.x, u.y - enemy.y);
  for (let i = 0; i < 20; i++) u.update(16, game);
  const after = Math.hypot(u.x - enemy.x, u.y - enemy.y);
  t.greaterThan(after, before, "retreating unit increases distance to the enemy");
});

// ---- behaviour: reloading / pressure --------------------------------------

s.test("isPressured is true while reloading", (t) => {
  const { sb, game } = emptyGame(0);
  const u = spawnAI(sb, game, 100, 100, "blue");
  u.reloading = false;
  t.equal(u.ai.isPressured(u), false, "not reloading, full mag -> not pressured");
  u.reloading = true;
  t.equal(u.ai.isPressured(u), true, "reloading -> pressured");
});

s.test("a reloading unit does not advance toward the enemy", (t) => {
  const { sb, game } = emptyGame(0);
  // Healthy unit, mid-reload, enemy in clear sight at range. It must not close
  // the distance (it should hold/seek cover/back off).
  const u = spawnAI(sb, game, 700, 480, "blue"); // open ground, away from solids
  u.hp = sb.CONFIG.unit.maxHp;
  u.reloading = true;
  u.reloadTimer = u.reloadTimeVal();
  const enemy = spawnAI(sb, game, 700, 220, "red");
  const before = Math.hypot(u.x - enemy.x, u.y - enemy.y);
  const st = u.ai.desiredState(u, game);
  t.equal(st, sb.AIController.STATE.COVER, "reloading + visible enemy -> COVER");
  u.update(16, game);
  const after = Math.hypot(u.x - enemy.x, u.y - enemy.y);
  t.ok(after >= before - 0.001, "reloading unit does not move closer to the enemy");
});

// ---- behaviour: HIDE (forest stealth) -------------------------------------

s.test("a healthy distant unit heads for a forest to ambush", (t) => {
  const { sb, game } = emptyGame(0);
  // forests[1] sits in open ground; approach it from the left with the enemy
  // further left so the forest is closer than the enemy (-> HIDE) with clear LOS.
  const forest = game.map.forests[1];
  const u = spawnAI(sb, game, forest.x - (forest.r + 40), forest.y, "blue", 0.9);
  u.hp = sb.CONFIG.unit.maxHp;
  u.ai.assaulter = false; // pin: this scenario tests HIDE, not the fort-assault branch
  spawnAI(sb, game, forest.x - 600, forest.y, "red");
  t.equal(u.ai.desiredState(u, game), sb.AIController.STATE.HIDE,
    "healthy unit with a handy forest -> HIDE");
  const before = Math.hypot(u.x - forest.x, u.y - forest.y);
  for (let i = 0; i < 10; i++) u.update(16, game);
  const after = Math.hypot(u.x - forest.x, u.y - forest.y);
  t.lessThan(after, before, "moved toward the forest");
});

// ---- behaviour: ENGAGE not broken -----------------------------------------

s.test("a healthy unit can still shoot a visible enemy in range", (t) => {
  const { sb, game } = emptyGame(0);
  // Open ground (top of the map, clear of all solids) with a clear LOS.
  const u = spawnAI(sb, game, 600, 100, "blue", 1.0);
  u.hp = sb.CONFIG.unit.maxHp;
  spawnAI(sb, game, 700, 100, "red"); // close, in range, clear LOS
  // Force shooting RNG to always pass.
  const realRandom = Math.random;
  Math.random = () => 0;
  let fired = 0;
  for (let i = 0; i < 30; i++) {
    u.cooldown = 0;
    u.ai.update(u, 16, game);
    fired += game.bullets.length;
    game.bullets = [];
  }
  Math.random = realRandom;
  t.greaterThan(fired, 0, "engaging unit fires at a visible in-range enemy");
});

// ---- behaviour: ASSAULT preserved -----------------------------------------

s.test("a healthy assaulter with no enemy targets the fort (ASSAULT)", (t) => {
  const { sb, game } = emptyGame(0);
  const u = spawnAI(sb, game, 200, 200, "blue", 0.9);
  u.hp = sb.CONFIG.unit.maxHp;
  u.ai.assaulter = true;
  // No enemies present.
  t.equal(u.ai.desiredState(u, game), sb.AIController.STATE.ASSAULT,
    "assaulter with no visible enemy -> ASSAULT");
});

s.test("a low-HP assaulter prefers self-preservation over the fort", (t) => {
  const { sb, game } = emptyGame(0);
  const u = spawnAI(sb, game, 200, 200, "blue", 0.9);
  u.ai.assaulter = true;
  u.hp = sb.CONFIG.unit.maxHp * 0.2;
  t.equal(u.ai.desiredState(u, game), sb.AIController.STATE.RETREAT,
    "wounded assaulter retreats instead of assaulting");
});

// ---- sanity: update never throws across stages -----------------------------

s.test("update runs without error for many units across a stage", (t) => {
  const { sb, game } = newGame(2); // default-populated stage
  for (let frame = 0; frame < 20; frame++) {
    for (const u of game.units) {
      if (u.alive && u.ai) u.ai.update(u, 16, game);
    }
  }
  t.ok(true, "no exceptions during repeated AI updates");
});

module.exports = s;

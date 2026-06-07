// Forest stealth: an enemy standing in a forest is invisible to the player
// unless a friendly (player-team) unit is within CONFIG.forestDetectRange.
// The player's own team and the player themself are always visible; enemies in
// the open are always visible.

const { newGame } = require("./harness");
const { suite } = require("./assert");

const s = suite();

// Helper to drop a unit straight into the game's unit list.
function place(sb, game, team, x, y, isPlayer) {
  const u = new sb.Unit(x, y, team, !!isPlayer);
  game.units.push(u);
  return u;
}

s.test("the player's own units and self are always visible", (t) => {
  const { sb, game } = newGame(0);
  game.units = [];
  const forest = game.map.forests[0];
  const self = place(sb, game, "blue", forest.x, forest.y, true);
  const ally = place(sb, game, "blue", forest.x, forest.y, false);
  t.ok(game.unitVisibleToPlayer(self), "self always visible even in forest");
  t.ok(game.unitVisibleToPlayer(ally), "ally always visible even in forest");
});

s.test("an enemy in the open is always visible", (t) => {
  const { sb, game } = newGame(0);
  game.units = [];
  // A clearly open spot in stage 1.
  const enemy = place(sb, game, "red", 480, 560, false);
  t.ok(game.unitVisibleToPlayer(enemy), "enemy in the open is visible");
});

s.test("an enemy hidden in a forest with no blue nearby is invisible", (t) => {
  const { sb, game } = newGame(0);
  game.units = [];
  const forest = game.map.forests[0];
  const enemy = place(sb, game, "red", forest.x, forest.y, false);
  // The only blue is far away.
  place(sb, game, "blue", 900, 50, false);
  t.equal(game.unitVisibleToPlayer(enemy), false, "forest enemy hidden when no blue nearby");
});

s.test("a forest enemy becomes visible when a blue is within detect range", (t) => {
  const { sb, game } = newGame(0);
  const CONFIG = sb.CONFIG;
  game.units = [];
  const forest = game.map.forests[0];
  const enemy = place(sb, game, "red", forest.x, forest.y, false);
  // Spotter just inside detect range.
  place(sb, game, "blue", forest.x + CONFIG.forestDetectRange - 5, forest.y, false);
  t.ok(game.unitVisibleToPlayer(enemy), "forest enemy spotted by nearby blue");
});

s.test("a blue just outside detect range does NOT spot the forest enemy", (t) => {
  const { sb, game } = newGame(0);
  const CONFIG = sb.CONFIG;
  game.units = [];
  const forest = game.map.forests[0];
  const enemy = place(sb, game, "red", forest.x, forest.y, false);
  place(sb, game, "blue", forest.x + CONFIG.forestDetectRange + 20, forest.y, false);
  t.equal(game.unitVisibleToPlayer(enemy), false, "out-of-range blue cannot spot forest enemy");
});

s.test("a dead blue does not spot a forest enemy", (t) => {
  const { sb, game } = newGame(0);
  const CONFIG = sb.CONFIG;
  game.units = [];
  const forest = game.map.forests[0];
  const enemy = place(sb, game, "red", forest.x, forest.y, false);
  const spotter = place(sb, game, "blue", forest.x + 10, forest.y, false);
  spotter.alive = false;
  t.equal(game.unitVisibleToPlayer(enemy), false, "dead blue cannot spot forest enemy");
});

module.exports = s;

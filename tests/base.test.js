// Fort / home-base healing: standing inside your own base regenerates HP at
// CONFIG.base.regenPerSec per second. Enemy bases and full-HP units don't heal.

const { newGame } = require("./harness");
const { suite } = require("./assert");

const s = suite();

s.test("inBase is true at own base centre, false at enemy base", (t) => {
  const { game } = newGame(0);
  const blue = game.map.bases.find((b) => b.team === "blue");
  const red = game.map.bases.find((b) => b.team === "red");
  t.ok(game.map.inBase(blue.x, blue.y, "blue"), "blue centre is in blue base");
  t.equal(game.map.inBase(blue.x, blue.y, "red"), false, "blue centre is not a red base");
  t.ok(game.map.inBase(red.x, red.y, "red"), "red centre is in red base");
});

s.test("regen rate matches CONFIG.base.regenPerSec over one second", (t) => {
  const { sb, game } = newGame(0);
  const CONFIG = sb.CONFIG;
  const base = game.map.bases.find((b) => b.team === "blue");
  const u = new sb.Unit(base.x, base.y, "blue");
  u.hp = 40;
  game.units = [u];
  u.update(1000, game);
  t.close(u.hp, 40 + CONFIG.base.regenPerSec, 0.001, "1s of regen = regenPerSec");
});

s.test("no healing outside any base", (t) => {
  const { sb, game } = newGame(0);
  // Far from both bases (map centre is contested, not a base).
  const u = new sb.Unit(480, 300, "blue");
  u.hp = 40;
  game.units = [u];
  u.update(1000, game);
  t.equal(u.hp, 40, "hp unchanged when not in a base");
});

s.test("regen does not exceed maxHp", (t) => {
  const { sb, game } = newGame(0);
  const CONFIG = sb.CONFIG;
  const base = game.map.bases.find((b) => b.team === "blue");
  const u = new sb.Unit(base.x, base.y, "blue");
  u.hp = CONFIG.unit.maxHp - 1;
  game.units = [u];
  u.update(5000, game); // way more than enough to overheal
  t.equal(u.hp, CONFIG.unit.maxHp, "hp capped at maxHp");
});

s.test("unit does not heal in the enemy's base", (t) => {
  const { sb, game } = newGame(0);
  const red = game.map.bases.find((b) => b.team === "red");
  const u = new sb.Unit(red.x, red.y, "blue"); // blue unit standing in red base
  u.hp = 40;
  game.units = [u];
  u.update(1000, game);
  t.equal(u.hp, 40, "blue unit does not heal inside red base");
});

module.exports = s;

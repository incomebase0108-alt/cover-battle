// Class abilities: scout smoke conceals, engineer turret auto-fires, assault
// dash speeds up, and the ability respects its cooldown.

const { newGame, loadGame } = require("./harness");
const { suite } = require("./assert");

const s = suite();

s.test("scout ability drops a concealing smoke (cloud hides enemies)", (t) => {
  const { sb, game } = newGame(0);
  const scout = new sb.Unit(500, 500, "blue");
  scout.applyClass("scout");
  game.units = [scout];
  scout.useAbility(game);
  t.equal(game.smokes.length, 1, "a smoke cloud was created");
  // An enemy inside far-off smoke, with no blue nearby, is hidden.
  game.smokes = [new sb.Smoke(1500, 900)];
  game.units = [new sb.Unit(100, 100, "blue"), new sb.Unit(1500, 900, "red")];
  t.equal(game.inSmoke(1500, 900), true, "point is inside smoke");
  t.equal(game.unitVisibleToPlayer(game.units[1]), false, "enemy hidden in smoke");
});

s.test("engineer ability deploys a turret that fires at an enemy", (t) => {
  const { sb, game } = newGame(0);
  const eng = new sb.Unit(500, 500, "blue");
  eng.applyClass("engineer");
  game.units = [eng, new sb.Unit(620, 500, "red")];
  eng.useAbility(game);
  t.equal(game.turrets.length, 1, "turret deployed");
  game.bullets = [];
  game.turrets[0].update(16, game);
  t.greaterThan(game.bullets.length, 0, "turret shot at the enemy");
});

s.test("assault dash makes the unit move faster briefly", (t) => {
  const { sb, game } = newGame(0);
  const a = new sb.Unit(1200, 150, "blue"); // open ground, clear of obstacles
  a.applyClass("assault");
  game.units = [a];
  a.x = 1200; a.y = 150;
  const base = a.move(1, 0, game);
  a.x = 1200; a.y = 150;
  a.useAbility(game);
  const dashed = a.move(1, 0, game);
  t.greaterThan(dashed, base + 0.5, "dash step is longer than a normal step");
});

s.test("ability respects its cooldown", (t) => {
  const { sb, game } = newGame(0);
  const sc = new sb.Unit(500, 500, "blue");
  sc.applyClass("scout");
  game.units = [sc];
  sc.useAbility(game);
  sc.useAbility(game); // still on cooldown
  t.equal(game.smokes.length, 1, "second use blocked by cooldown");
});

module.exports = s;

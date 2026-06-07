// Class abilities: smoke clouds conceal, engineer turret auto-fires, assault
// dash speeds up, the beast-tamer captures wild animals, and cooldowns hold.

const { newGame, loadGame } = require("./harness");
const { suite } = require("./assert");

const s = suite();

s.test("a smoke cloud conceals enemies inside it", (t) => {
  const { sb, game } = newGame(0);
  game.smokes = [new sb.Smoke(1800, 1100)];
  game.units = [new sb.Unit(100, 100, "blue"), new sb.Unit(1800, 1100, "red")];
  t.equal(game.inSmoke(1800, 1100), true, "point is inside smoke");
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

s.test("beast tamer captures a nearby wild beast", (t) => {
  const { sb, game } = newGame(0);
  const tamer = new sb.Unit(500, 500, "blue");
  tamer.applyClass("tamer");
  game.units = [tamer];
  game.beasts = [new sb.Beast(560, 500, "tiger")];
  tamer.useAbility(game);
  t.equal(game.beasts[0].team, "blue", "beast joined the tamer's team");
});

s.test("assault dash makes the unit move faster briefly", (t) => {
  const { sb, game } = newGame(0);
  const a = new sb.Unit(1500, 200, "blue"); // open ground
  a.applyClass("assault");
  game.units = [a];
  a.x = 1500; a.y = 200;
  const base = a.move(1, 0, game);
  a.x = 1500; a.y = 200;
  a.useAbility(game);
  const dashed = a.move(1, 0, game);
  t.greaterThan(dashed, base + 0.5, "dash step is longer than a normal step");
});

s.test("ability respects its cooldown", (t) => {
  const { sb, game } = newGame(0);
  const eng = new sb.Unit(500, 500, "blue");
  eng.applyClass("engineer");
  game.units = [eng];
  eng.useAbility(game);
  eng.useAbility(game); // still on cooldown
  t.equal(game.turrets.length, 1, "second use blocked by cooldown");
});

module.exports = s;

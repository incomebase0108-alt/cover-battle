// Character classes: stats/weapon/ability per class, and the climber's ledge
// shortcut (climbers cross ledges that block everyone else).

const { newGame, loadGame } = require("./harness");
const { suite } = require("./assert");

const s = suite();

s.test("applyClass sets weapon, scaled HP and abilities", (t) => {
  const sb = loadGame();
  const heavy = new sb.Unit(0, 0, "blue");
  heavy.applyClass("heavy");
  const scout = new sb.Unit(0, 0, "blue");
  scout.applyClass("scout");
  t.equal(heavy.weaponKey, "shotgun", "heavy carries a shotgun");
  t.greaterThan(heavy.maxHp, scout.maxHp, "heavy is tougher than scout");
  t.greaterThan(scout.classSpeedMul, heavy.classSpeedMul, "scout is faster than heavy");
  t.equal(scout.hp, scout.maxHp, "spawns at full (scaled) HP");
});

s.test("only the climber can pass a ledge", (t) => {
  const { game } = newGame(0); // STAGE 1 has ledges
  t.ok(game.map.ledges.length > 0, "stage has ledges");
  const l = game.map.ledges[0];
  const cx = l.x + l.w / 2;
  const cy = l.y + l.h / 2;
  const blocked = game.map.resolveCollision(cx, cy, 14, false);
  const climbed = game.map.resolveCollision(cx, cy, 14, true);
  t.equal(game.map.inLedge(blocked.x, blocked.y), false, "non-climber is pushed off the ledge");
  t.equal(game.map.inLedge(climbed.x, climbed.y), true, "climber stays on/through the ledge");
});

s.test("each team fields one unit per class", (t) => {
  const { sb, game } = newGame(0);
  const blue = game.units.filter((u) => u.team === "blue");
  const keys = blue.map((u) => u.cls);
  for (const c of sb.CLASSES) t.ok(keys.indexOf(c.key) >= 0, "class present: " + c.key);
});

module.exports = s;

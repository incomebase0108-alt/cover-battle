// Terrain: rivers slow movement, mountains block line of sight (and bullets),
// and the open field does neither.

const { newGame } = require("./harness");
const { suite } = require("./assert");

const s = suite();

s.test("inRiver detects a point inside a river rectangle", (t) => {
  const { game } = newGame(0);
  const r = game.map.rivers[0];
  t.ok(game.map.inRiver(r.x + r.w / 2, r.y + r.h / 2), "river centre is in river");
  t.equal(game.map.inRiver(r.x - 50, r.y + 5), false, "point left of river is not in river");
});

s.test("movement is slower in a river than in the open", (t) => {
  const { sb, game } = newGame(0);
  const river = game.map.rivers[0];

  // In-river unit near the top edge: inside the river but clear of the central
  // rock/mountain cluster, so collision-resolution doesn't perturb the measured
  // displacement.
  const inR = new sb.Unit(river.x + river.w / 2, 80, "blue");
  const x0 = inR.x;
  inR.move(1, 0, game);
  const dIn = inR.x - x0;

  // Open-field unit far from river and obstacles.
  const outR = new sb.Unit(120, 80, "blue");
  const ox0 = outR.x;
  outR.move(1, 0, game);
  const dOut = outR.x - ox0;

  t.greaterThan(dOut, 0, "open unit actually moved");
  t.lessThan(dIn, dOut - 0.01, "river movement strictly slower than open movement");
});

s.test("river slowdown factor matches CONFIG.riverSpeedMul", (t) => {
  const { sb, game } = newGame(0);
  const CONFIG = sb.CONFIG;
  const river = game.map.rivers[0];

  // Top of the river, clear of solids (see note in the previous test).
  const inR = new sb.Unit(river.x + river.w / 2, 80, "blue");
  const x0 = inR.x;
  inR.move(1, 0, game);
  const dIn = inR.x - x0;

  const expected = CONFIG.unit.speed * CONFIG.riverSpeedMul;
  t.close(dIn, expected, 0.001, "in-river displacement = speed * riverSpeedMul");
});

s.test("a line straight through a mountain is blocked", (t) => {
  const { game } = newGame(0);
  const m = game.map.mountains[0];
  const blocked = game.map.blockedBetween(m.x - 120, m.y, m.x + 120, m.y);
  t.ok(blocked, "horizontal line through mountain centre is blocked");
});

s.test("a clear line over open ground is not blocked", (t) => {
  const { game } = newGame(0);
  // Top edge of stage 1 is clear of solids.
  t.equal(game.map.blockedBetween(40, 20, 920, 20), false, "open top edge not blocked");
});

s.test("a bullet is destroyed when it reaches a mountain", (t) => {
  const { sb, game } = newGame(0);
  const CONFIG = sb.CONFIG;
  const m = game.map.mountains[0];
  // Fire a bullet from just left of the mountain, moving right into it.
  const b = new sb.Bullet(m.x - m.r - 2, m.y, 1, 0, "blue", {
    damage: CONFIG.bullet.damage,
    speed: CONFIG.bullet.speed,
    life: CONFIG.bullet.life,
  });
  game.bullets = [b];
  // Step a few frames; the bullet should enter the mountain and die.
  for (let i = 0; i < 5 && !b.dead; i++) b.update(16, game);
  t.ok(b.dead, "bullet dies upon hitting a mountain");
});

module.exports = s;

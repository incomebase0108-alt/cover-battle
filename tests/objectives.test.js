// Mid-field objectives + special weapons: treasure chests grant temporary
// special guns, piercing rounds pass through enemies, control points capture
// and heal, and desert sand is detected for the slow.

const { newGame } = require("./harness");
const { suite } = require("./assert");

const s = suite();

s.test("opening a chest grants a temporary special weapon", (t) => {
  const { sb, game } = newGame(0);
  const u = new sb.Unit(100, 100, "blue");
  const c = new sb.Chest(100, 100);
  c.open(u, game);
  t.equal(u.special, true, "unit is now holding a special");
  t.ok(sb.CHEST_LOOT.indexOf(u.weaponKey) >= 0, "weapon is one of the chest loot");
});

s.test("a piercing round damages multiple enemies in a line", (t) => {
  const { sb, game } = newGame(0);
  const e1 = new sb.Unit(510, 500, "red");
  const e2 = new sb.Unit(520, 500, "red");
  game.units = [e1, e2];
  const b = new sb.Bullet(500, 500, 1, 0, "blue", { damage: 20, speed: 12, life: 1000, pierce: true });
  game.bullets = [b];
  b.update(16, game);
  t.lessThan(e1.hp, sb.CONFIG.unit.maxHp, "first enemy hit");
  t.lessThan(e2.hp, sb.CONFIG.unit.maxHp, "second enemy also hit");
  t.equal(b.dead, false, "piercing round keeps going");
});

s.test("a lone unit captures a control point and then heals on it", (t) => {
  const { sb, game } = newGame(0);
  const cp = game.capturePoints[0];
  const u = new sb.Unit(cp.x, cp.y, "blue");
  u.hp = 40;
  game.units = [u];
  for (let acc = 0; acc <= sb.CONFIG.capture.captureTime + 100; acc += 50) game._updateCapture(50);
  t.equal(cp.owner, "blue", "point captured by the present team");
  t.equal(game.capturedPointFor(cp.x, cp.y, "blue"), true, "captured point heals blue");
});

s.test("contested control point does not flip", (t) => {
  const { sb, game } = newGame(0);
  const cp = game.capturePoints[0];
  game.units = [new sb.Unit(cp.x, cp.y, "blue"), new sb.Unit(cp.x, cp.y, "red")];
  for (let acc = 0; acc <= sb.CONFIG.capture.captureTime + 100; acc += 50) game._updateCapture(50);
  t.equal(cp.owner, null, "stays neutral while contested");
});

s.test("desert sand is detected (stage 7)", (t) => {
  const { game } = newGame(6); // STAGE 7 — 砂漠とオアシス
  // Sand rect {x:120,w:720} in design space -> scaled; world (1200,750) is inside.
  t.equal(game.map.inSand(1200, 750), true, "point inside the desert is sand");
});

module.exports = s;

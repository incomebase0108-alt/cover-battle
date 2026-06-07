// Magazine / reload behaviour: a Unit fires magSize rounds, then is forced into
// a reload (ammo=0, reloading=true), and after reloadTime ms the magazine is
// refilled and firing resumes.

const { newGame } = require("./harness");
const { suite } = require("./assert");

const s = suite();

s.test("rifle fires exactly magSize rounds before forced reload", (t) => {
  const { sb, game } = newGame(0);
  const u = new sb.Unit(500, 300, "blue");
  game.units = [u];

  const mag = u.magSizeVal();
  let fired = 0;
  // Reset cooldown each attempt so cooldown never blocks a shot.
  for (let i = 0; i < mag + 5; i++) {
    const before = u.ammo;
    u.cooldown = 0;
    u.tryShoot(game);
    if (u.ammo < before) fired++;
  }
  t.equal(fired, mag, "shots fired before empty should equal magSize");
});

s.test("emptying the magazine sets reloading=true and ammo=0", (t) => {
  const { sb, game } = newGame(0);
  const u = new sb.Unit(500, 300, "blue");
  game.units = [u];
  for (let i = 0; i < u.magSizeVal(); i++) {
    u.cooldown = 0;
    u.tryShoot(game);
  }
  t.equal(u.ammo, 0, "ammo should be 0 after emptying mag");
  t.ok(u.reloading, "unit should be reloading after emptying mag");
});

s.test("cannot fire while reloading", (t) => {
  const { sb, game } = newGame(0);
  const u = new sb.Unit(500, 300, "blue");
  game.units = [u];
  for (let i = 0; i < u.magSizeVal(); i++) {
    u.cooldown = 0;
    u.tryShoot(game);
  }
  const bulletsBefore = game.bullets.length;
  u.cooldown = 0;
  u.tryShoot(game); // should be ignored: reloading
  t.equal(game.bullets.length, bulletsBefore, "no bullet should spawn while reloading");
});

s.test("reload completes after reloadTime and refills magazine", (t) => {
  const { sb, game } = newGame(0);
  const u = new sb.Unit(500, 300, "blue");
  game.units = [u];
  for (let i = 0; i < u.magSizeVal(); i++) {
    u.cooldown = 0;
    u.tryShoot(game);
  }
  // Partial reload: still reloading just before the timer elapses.
  u.update(u.reloadTimeVal() - 50, game);
  t.ok(u.reloading, "still reloading just before reloadTime elapses");
  // Finish it.
  u.update(100, game);
  t.equal(u.reloading, false, "reload should be done after reloadTime");
  t.equal(u.ammo, u.magSizeVal(), "magazine refilled to full after reload");
});

s.test("fireCooldown blocks back-to-back shots within a magazine", (t) => {
  const { sb, game } = newGame(0);
  const u = new sb.Unit(500, 300, "blue");
  game.units = [u];
  const before = u.ammo;
  u.cooldown = 0;
  u.tryShoot(game);
  t.equal(u.ammo, before - 1, "first shot consumes one round");
  // Cooldown now > 0, immediate retry should be a no-op.
  u.tryShoot(game);
  t.equal(u.ammo, before - 1, "second immediate shot blocked by cooldown");
});

module.exports = s;

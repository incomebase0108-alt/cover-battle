// Passive ammo recovery: after CONFIG.unit.ammoRegenDelay ms without firing,
// rounds trickle back one per ammoRegenInterval. Firing resets the delay, and
// regen never exceeds the magazine size or runs while reloading.

const { newGame } = require("./harness");
const { suite } = require("./assert");

const s = suite();

s.test("ammo regenerates after the regen delay while not firing", (t) => {
  const { sb, game } = newGame(0);
  const CONFIG = sb.CONFIG;
  const u = new sb.Unit(400, 400, "blue");
  game.units = [u];
  u.ammo = 2;
  u.sinceShot = CONFIG.unit.ammoRegenDelay; // already past the delay
  u.update(CONFIG.unit.ammoRegenInterval + 5, game);
  t.equal(u.ammo, 3, "one round restored after one interval");
});

s.test("no regen immediately after firing (within the delay)", (t) => {
  const { sb, game } = newGame(0);
  const u = new sb.Unit(400, 400, "blue");
  game.units = [u];
  u.cooldown = 0;
  u.tryShoot(game); // sinceShot resets to 0
  const after = u.ammo;
  u.update(50, game); // well under ammoRegenDelay
  t.equal(u.ammo, after, "no regen right after a shot");
});

s.test("regen never exceeds the magazine size", (t) => {
  const { sb, game } = newGame(0);
  const CONFIG = sb.CONFIG;
  const u = new sb.Unit(400, 400, "blue");
  game.units = [u];
  u.ammo = u.magSizeVal() - 1;
  u.sinceShot = CONFIG.unit.ammoRegenDelay;
  u.update(CONFIG.unit.ammoRegenInterval * 10, game);
  t.equal(u.ammo, u.magSizeVal(), "capped at full magazine");
});

s.test("emptying the magazine still forces a full reload", (t) => {
  const { sb, game } = newGame(0);
  const u = new sb.Unit(400, 400, "blue");
  game.units = [u];
  for (let i = 0; i < u.magSizeVal() + 2; i++) { u.cooldown = 0; u.tryShoot(game); }
  t.equal(u.reloading, true, "reloading after emptying the magazine");
  t.equal(u.ammo, 0, "magazine is empty during reload");
});

module.exports = s;

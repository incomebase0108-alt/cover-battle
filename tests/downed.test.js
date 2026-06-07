// Downed-but-not-out: at 0 HP a unit is incapacitated (SOS), and a teammate can
// carry it home to the fort to revive it at a fraction of max HP.

const { newGame } = require("./harness");
const { suite } = require("./assert");

const s = suite();

s.test("a unit at 0 HP is downed, not dead", (t) => {
  const { sb, game } = newGame(0);
  const u = new sb.Unit(500, 500, "blue");
  u.takeDamage(u.maxHp + 50);
  t.equal(u.alive, false, "no longer an active combatant");
  t.equal(u.downed, true, "downed (rescuable), not permanently dead");
});

s.test("a teammate carries a downed ally home and revives it", (t) => {
  const { sb, game } = newGame(0);
  const base = game.map.baseOf("blue");
  const downed = new sb.Unit(base.x, base.y, "blue");
  downed.takeDamage(downed.maxHp);
  const carrier = new sb.Unit(base.x, base.y, "blue");
  game.units = [carrier, downed];
  for (let acc = 0; acc <= sb.RESCUE.reviveTime + 200; acc += 50) game._updateRescue(50);
  t.equal(downed.alive, true, "revived");
  t.equal(downed.downed, false, "no longer downed");
  t.greaterThan(downed.hp, 0, "comes back with some HP");
  t.equal(downed.hp <= Math.ceil(downed.maxHp * sb.RESCUE.reviveFrac), true, "revives at a fraction of max HP");
});

s.test("a downed unit is not picked up by an enemy", (t) => {
  const { sb, game } = newGame(0);
  const downed = new sb.Unit(500, 500, "blue");
  downed.takeDamage(downed.maxHp);
  const enemy = new sb.Unit(500, 500, "red");
  game.units = [enemy, downed];
  game._updateRescue(50);
  t.equal(downed.carrier, null, "enemies can't carry your downed");
});

module.exports = s;

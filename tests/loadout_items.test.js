// Smart item pickup + AI loadout: a full-HP unit leaves health packs, a hurt
// unit takes them, and the AI swaps weapons to suit the engagement range.

const { newGame } = require("./harness");
const { suite } = require("./assert");

const s = suite();

s.test("a full-HP unit does NOT consume a health pack", (t) => {
  const { sb, game } = newGame(0);
  const u = new sb.Unit(700, 700, "blue");
  u.hp = sb.CONFIG.unit.maxHp;
  const it = new sb.Item(700, 700, "heal");
  game.units = [u];
  game.items = [it];
  game._handlePickups();
  t.equal(it.dead, false, "health pack left for someone who needs it");
});

s.test("a hurt unit picks up the health pack and heals", (t) => {
  const { sb, game } = newGame(0);
  const u = new sb.Unit(700, 700, "blue");
  u.hp = 20;
  const it = new sb.Item(700, 700, "heal");
  game.units = [u];
  game.items = [it];
  game._handlePickups();
  t.equal(it.dead, true, "health pack consumed");
  t.greaterThan(u.hp, 20, "unit healed");
});

s.test("wantsItem reflects whether a buff is still useful", (t) => {
  const { sb, game } = newGame(0);
  const u = new sb.Unit(700, 700, "blue");
  u.hp = sb.CONFIG.unit.maxHp;
  t.equal(u.wantsItem(new sb.Item(0, 0, "heal")), false, "no heal at full HP");
  u.hp = 50;
  t.equal(u.wantsItem(new sb.Item(0, 0, "heal")), true, "heal wanted when hurt");
  t.equal(u.wantsItem(new sb.Item(0, 0, "speed")), true, "speed wanted by default");
});

s.test("pickWeapon keeps the unit's class weapon (no range swapping)", (t) => {
  const { sb, game } = newGame(0);
  const u = new sb.Unit(700, 700, "blue");
  u.applyClass("archer"); // 弓兵
  u.ai = new sb.AIController();
  game.units = [u];
  u.ai.pickWeapon(u, 500, 9999); // 遠距離
  t.equal(u.weaponKey, "yumi", "遠距離でも弓のまま");
  u.ai.pickWeapon(u, 100, 9999); // 近距離
  t.equal(u.weaponKey, "yumi", "近距離でも弓のまま（持ち替えない）");
});

module.exports = s;

// Class abilities: smoke clouds conceal, the ninja drops smoke, cavalry/general
// dash for a burst of speed (with a cooldown), and water movement (canClimb).

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

s.test("忍者の特殊は煙幕を落とす", (t) => {
  const { sb, game } = newGame(0);
  const ninja = new sb.Unit(500, 500, "blue");
  ninja.applyClass("ninja");
  game.units = [ninja];
  game.smokes = [];
  ninja.useAbility(game);
  t.greaterThan(game.smokes.length, 0, "煙幕が展開された");
});

s.test("騎馬のダッシュは一瞬だけ移動が速くなる", (t) => {
  const { sb, game } = newGame(0);
  const a = new sb.Unit(1500, 200, "blue"); // open ground
  a.applyClass("cavalry");
  game.units = [a];
  a.x = 1500; a.y = 200;
  const base = a.move(1, 0, game);
  a.x = 1500; a.y = 200;
  a.useAbility(game);
  const dashed = a.move(1, 0, game);
  t.greaterThan(dashed, base + 0.5, "dash step is longer than a normal step");
});

s.test("騎馬のダッシュは時間クールダウンで制限される", (t) => {
  const { sb, game } = newGame(0);
  const a = new sb.Unit(1500, 200, "blue");
  a.applyClass("cavalry");
  game.units = [a];
  a.useAbility(game);
  t.ok(a.abilityCd > 0, "ダッシュ後はクールダウン中");
  t.equal(a.abilityRemaining(game), null, "個数制ではないので残数はnull");
});

s.test("canClimb のユニットは川の上を通常兵より速く移動する", (t) => {
  const { sb, game } = newGame(0);
  const river = game.map.rivers[0];
  const rx = river.x + river.w / 2;
  const ry = river.y + river.h / 2;
  const normal = new sb.Unit(rx, ry, "blue");          // 通常兵（川で減速）
  const marine = new sb.Unit(rx, ry, "blue");
  marine.canClimb = true;                              // 川で加速
  game.units = [normal, marine];
  const dn = normal.move(0, -1, game);                 // 川に沿って上へ1歩
  marine.x = rx; marine.y = ry;
  const dm = marine.move(0, -1, game);
  t.greaterThan(dm, dn, "canClimb の方が川で速く進む");
});

module.exports = s;

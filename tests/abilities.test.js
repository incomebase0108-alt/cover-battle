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

s.test("AI動物使いは野生動物に向かって捕獲する", (t) => {
  const { sb, game } = newGame(0);
  const tamer = new sb.Unit(500, 500, "blue");
  tamer.applyClass("tamer");
  tamer.name = "AI獣";
  tamer.ai = new sb.AIController();
  game.units = [tamer];
  const beast = new sb.Beast(560, 500, "tiger"); // 60px = 捕獲射程内
  game.beasts = [beast];
  tamer.ai.update(tamer, 16, game);
  t.equal(beast.team, "blue", "AI動物使いが射程内の野生動物を捕獲した");
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

s.test("個数制アビリティは上限まで設置できる(工兵=砲台 最大2)", (t) => {
  const { sb, game } = newGame(0);
  t.equal(sb.getClass("engineer").abilityMax, 2, "工兵の設置上限は2");
  const eng = new sb.Unit(500, 500, "blue");
  eng.applyClass("engineer");
  game.units = [eng];
  eng.useAbility(game);
  eng.useAbility(game);
  t.equal(game.turrets.length, 2, "2基まで設置できる");
  t.equal(eng.abilityRemaining(game), 0, "残り0");
  eng.useAbility(game); // 上限超過
  t.equal(game.turrets.length, 2, "3基目は上限で設置されない");
});

s.test("突撃兵のダッシュは時間クールダウンで制限される", (t) => {
  const { sb, game } = newGame(0);
  const a = new sb.Unit(1500, 200, "blue");
  a.applyClass("assault");
  game.units = [a];
  a.useAbility(game);
  t.ok(a.abilityCd > 0, "ダッシュ後はクールダウン中");
  t.equal(a.abilityRemaining(game), null, "個数制ではないので残数はnull");
});

s.test("山岳海兵は川の上を通常兵より速く移動する", (t) => {
  const { sb, game } = newGame(0);
  const river = game.map.rivers[0];
  const rx = river.x + river.w / 2;
  const ry = river.y + river.h / 2;
  const normal = new sb.Unit(rx, ry, "blue");          // 通常兵（川で減速）
  const marine = new sb.Unit(rx, ry, "blue");
  marine.canClimb = true;                              // 山岳海兵（川で加速）
  game.units = [normal, marine];
  const dn = normal.move(0, -1, game);                 // 川に沿って上へ1歩
  marine.x = rx; marine.y = ry;
  const dm = marine.move(0, -1, game);
  t.greaterThan(dm, dn, "山岳海兵の方が川で速く進む");
});

module.exports = s;

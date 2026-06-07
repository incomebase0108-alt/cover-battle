// 合戦テーマの新メカニクス：刀の近接攻撃、弓/刀の装填不要、鉄砲の装填、
// そして大将ルール（回復ゾーン無効化・士気低下・討死サドンデス）。

const { newGame, loadGame } = require("./harness");
const { suite } = require("./assert");

const s = suite();

s.test("刀は前方の敵を斬り、背後の敵には当たらない（弾も減らない）", (t) => {
  const { sb, game } = newGame(0);
  const a = new sb.Unit(1500, 300, "blue");
  a.applyClass("ashigaru"); // 刀
  a.aim = 0;                 // +X（右）を向く
  const front = new sb.Unit(1530, 300, "red"); // 正面
  const back = new sb.Unit(1470, 300, "red");  // 真後ろ
  const fHp = front.hp, bHp = back.hp, ammo0 = a.ammo;
  game.units = [a, front, back];
  a.tryShoot(game);
  t.lessThan(front.hp, fHp, "正面の敵は斬られる");
  t.equal(back.hp, bHp, "背後の敵は斬られない");
  t.equal(a.ammo, ammo0, "刀は弾を消費しない");
  t.equal(a.reloading, false, "刀は装填しない");
});

s.test("弓は装填不要：撃っても弾が減らず装填もしない", (t) => {
  const { sb, game } = newGame(0);
  const u = new sb.Unit(1500, 300, "blue");
  u.applyClass("archer"); // 弓
  const ammo0 = u.ammo;
  game.bullets = [];
  u.tryShoot(game);
  t.greaterThan(game.bullets.length, 0, "矢が放たれる");
  t.equal(u.ammo, ammo0, "弓は弾が減らない");
  t.equal(u.reloading, false, "弓は装填しない");
});

s.test("鉄砲は一発撃つと装填に入る（magSize=1・装填あり）", (t) => {
  const { sb, game } = newGame(0);
  const u = new sb.Unit(1500, 300, "blue");
  u.applyClass("gunner"); // 鉄砲
  game.bullets = [];
  t.equal(u.ammo, 1, "装填数は1");
  u.tryShoot(game);
  t.greaterThan(game.bullets.length, 0, "弾が出る");
  t.equal(u.reloading, true, "撃ったら装填に入る");
});

s.test("大将が倒れると自陣の回復ゾーンが無効化される", (t) => {
  const { sb, game } = newGame(0);
  const base = game.map.bases.find((b) => b.team === "blue");
  const g = game.generalOf("blue");
  const u = new sb.Unit(base.x, base.y, "blue");
  u.hp = 40;
  // 大将 健在 → 回復する。
  u.update(1000, game);
  t.greaterThan(u.hp, 40, "大将健在なら回復ゾーンで回復する");
  // 大将 戦闘不能 → 回復しない。
  g.alive = false; g.downed = true;
  u.hp = 40;
  u.update(1000, game);
  t.equal(u.hp, 40, "大将が倒れている間は回復しない");
});

s.test("大将が倒れている間は味方が士気低下（moraleMul<1）", (t) => {
  const { sb, game } = newGame(0);
  const g = game.generalOf("blue");
  g.alive = false; g.downed = true;
  game._updateGenerals(16);
  const ally = game.units.find((u) => u.team === "blue" && u.cls !== "general");
  t.lessThan(ally.moraleMul, 1, "味方の士気倍率が下がる");
  t.equal(game.generalOkFor("blue"), false, "大将不在(倒れている)＝回復/士気ペナルティ");
});

s.test("大将が救出されず一定時間経つと討死(状態2)＝サドンデス", (t) => {
  const { sb, game } = newGame(0);
  const g = game.generalOf("blue");
  g.alive = false; g.downed = true;
  game._genDownMs = { blue: (sb.CONFIG.morale.discardMs + 100), red: 0 };
  t.equal(game.generalStatus("blue"), 2, "討死(状態2)になる");
  game._update(16);
  t.equal(game.stormActive, true, "討死でサドンデス(storm)が発動する");
});

s.test("味方AIは倒れた総大将を最優先で救出に向かう", (t) => {
  const { sb, game } = newGame(0);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const gen = game.generalOf("blue");
  gen.x = 1800; gen.y = 1100; gen.alive = false; gen.downed = true; gen.carrier = null;
  const ally = game.units.find((u) => u.team === "blue" && u.cls !== "general");
  ally.x = 1500; ally.y = 1100; ally.hp = ally.maxHp;
  ally.ai = new sb.AIController();
  game.units = [gen, ally]; // 周囲を空にして救出行動を見る
  const before = dist(ally, gen);
  ally.ai.update(ally, 50, game);
  t.lessThan(dist(ally, gen), before, "味方が倒れた大将へ近づく");
});

s.test("山城決戦ステージが読み込め、地形が揃っている", (t) => {
  const sb = loadGame();
  const idx = sb.STAGES.findIndex((st) => st.name === "山城決戦");
  t.greaterThan(idx, -1, "STAGESに山城決戦がある");
  const { game } = newGame(idx);
  t.ok(game.map.mountains.length > 0, "山(本丸)がある");
  t.ok(game.map.rivers.length > 0, "堀(川)がある");
  t.ok(game.map.rocks.length > 0, "石垣(岩)がある");
  t.ok(game.map.forests.length > 0, "森林帯がある");
  t.equal(game.units.filter((u) => u.team === "blue").length, sb.CONFIG.teamSize, "青6人が配置される");
});

module.exports = s;

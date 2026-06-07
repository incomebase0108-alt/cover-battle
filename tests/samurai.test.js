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

s.test("武器はクラス固定：手動の持ち替え(cycleWeapon)は無効", (t) => {
  const sb = loadGame();
  const u = new sb.Unit(0, 0, "blue");
  u.applyClass("ashigaru"); // 刀
  u.cycleWeapon(1);
  t.equal(u.weaponKey, "katana", "Fキー相当でも武器は変わらない");
});

s.test("攻撃するとモーション(swingMs)が立つ（刀も弓も）", (t) => {
  const { sb, game } = newGame(0);
  const katana = new sb.Unit(1500, 300, "blue");
  katana.applyClass("ashigaru");
  game.units = [katana, new sb.Unit(1530, 300, "red")];
  katana.tryShoot(game);
  t.greaterThan(katana.swingMs, 0, "刀の攻撃でモーションが立つ");
  const bow = new sb.Unit(1500, 800, "blue");
  bow.applyClass("archer");
  game.bullets = [];
  bow.tryShoot(game);
  t.greaterThan(bow.swingMs, 0, "弓の攻撃でもモーションが立つ");
});

s.test("刀を振ると体力が減り、止まれば回復する", (t) => {
  const { sb, game } = newGame(0);
  const a = new sb.Unit(1500, 300, "blue");
  a.applyClass("ashigaru");
  game.units = [a, new sb.Unit(1530, 300, "red")];
  const full = a.stamina;
  a.tryShoot(game); // 刀を振る
  t.lessThan(a.stamina, full, "刀を振ると体力が減る");
  const drained = a.stamina;
  a.cooldown = 0;
  a.update(1000, game); // 攻撃せず1秒
  t.greaterThan(a.stamina, drained, "止まれば体力が回復する");
});

s.test("弓は体力を消費しない", (t) => {
  const { sb, game } = newGame(0);
  const u = new sb.Unit(1500, 300, "blue");
  u.applyClass("archer");
  game.bullets = [];
  const full = u.stamina;
  u.tryShoot(game);
  t.equal(u.stamina, full, "飛び道具(弓)は体力を消費しない");
});

s.test("体力が低いと移動が遅くなる", (t) => {
  const { sb, game } = newGame(0);
  const a = new sb.Unit(1500, 200, "blue"); // open ground
  a.applyClass("ashigaru");
  game.units = [a];
  a.x = 1500; a.y = 200;
  const fast = a.move(1, 0, game); // 体力満タンで1歩
  a.stamina = 0;
  a.x = 1500; a.y = 200;
  const slow = a.move(1, 0, game); // 体力0で1歩
  t.lessThan(slow, fast, "体力0だと移動量が小さい");
});

s.test("弓の連射間隔は控えめ(>=600ms)", (t) => {
  const sb = loadGame();
  t.greaterThan(sb.WEAPONS.yumi.fireCooldown, 599, "弓のfireCooldownは600ms以上");
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

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

s.test("弓も体力を消費する（全攻撃で消費）", (t) => {
  const { sb, game } = newGame(0);
  const u = new sb.Unit(1500, 300, "blue");
  u.applyClass("archer");
  game.bullets = [];
  const full = u.stamina;
  u.tryShoot(game);
  t.lessThan(u.stamina, full, "弓を撃つと体力が減る");
});

s.test("刀は仲間にした浪人(同チーム)を斬らない（友軍誤射しない）", (t) => {
  const { sb, game } = newGame(0);
  const a = new sb.Unit(1500, 300, "blue");
  a.applyClass("ashigaru");
  const friend = new sb.Beast(1530, 300, "nobushi");
  friend.team = "blue"; // 説得で仲間になった野武士
  const enemy = new sb.Beast(1530, 330, "nobushi"); // 中立はまだ斬れる
  game.units = [a];
  game.beasts = [friend, enemy];
  a.aim = 0;
  a.tryShoot(game);
  t.equal(friend.hp, friend.maxHp, "仲間の浪人は斬られない");
  t.lessThan(enemy.hp, enemy.maxHp, "中立の浪人は斬れる");
});

s.test("体力切れでは攻撃できない（連打抑止＝駆け引き）", (t) => {
  const { sb, game } = newGame(0);
  const a = new sb.Unit(1500, 300, "blue");
  a.applyClass("ashigaru");
  const enemy = new sb.Unit(1530, 300, "red");
  game.units = [a, enemy];
  a.aim = 0;
  a.stamina = 5; // 体力切れ（swingCost 未満）
  a.cooldown = 0;
  a.tryShoot(game);
  t.equal(enemy.hp, enemy.maxHp, "体力切れだと刀を振れない（敵は無傷）");
  a.stamina = a.maxStamina; // 回復
  a.cooldown = 0;
  a.tryShoot(game);
  t.lessThan(enemy.hp, enemy.maxHp, "体力が戻れば斬れる");
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

s.test("仲間になった浪人は敵の砦へ進軍する（退かず前進）", (t) => {
  const { sb, game } = newGame(0);
  const redBase = game.map.baseOf("red");
  const b = new sb.Beast(sb.CONFIG.world.width / 2, sb.CONFIG.world.height / 2, "nobushi");
  b.team = "blue"; // 仲間
  game.units = []; // 周囲に敵ユニットなし → 砦へ進軍
  game.beasts = [b];
  const d0 = Math.hypot(b.x - redBase.x, b.y - redBase.y);
  for (let i = 0; i < 10; i++) b.update(50, game);
  const d1 = Math.hypot(b.x - redBase.x, b.y - redBase.y);
  t.lessThan(d1, d0, "敵の砦(赤)に近づく");
});

s.test("仲間の浪人は敵砦に到達するとコアを攻撃する", (t) => {
  const { sb, game } = newGame(0);
  const redBase = game.map.baseOf("red");
  const b = new sb.Beast(redBase.x, redBase.y, "nobushi"); // 砦中心に配置
  b.team = "blue"; b.attackCd = 0;
  game.units = [];
  game.beasts = [b];
  const hp0 = redBase.hp;
  b.update(16, game);
  t.lessThan(redBase.hp, hp0, "敵砦コアにダメージが入る");
});

s.test("拠点は3つ・中立の浪人は弱体(速度/威力ダウン)", (t) => {
  const { sb, game } = newGame(0);
  t.equal(game.capturePoints.length, 3, "拠点は3つ配置される");
  const nob = new sb.Beast(0, 0, "nobushi");
  const ken = new sb.Beast(0, 0, "kengo");
  t.lessThan(nob.speed, 2.0, "野武士の速度は控えめ");
  t.lessThan(ken.speed, 2.0, "剣豪の速度も控えめ");
  t.lessThan(nob.damage, 16, "野武士の威力は以前(16)より低い");
});

s.test("槍兵は槍を持ち、刀より長い間合い", (t) => {
  const sb = loadGame();
  const sp = new sb.Unit(0, 0, "blue");
  sp.applyClass("spearman");
  t.equal(sp.weaponKey, "yari", "槍兵は槍を装備");
  t.greaterThan(sb.WEAPONS.yari.meleeRange, sb.WEAPONS.katana.meleeRange, "槍は刀より長いリーチ");
});

s.test("じゃんけん三角の相性：槍＞剣＞弓＞槍", (t) => {
  const sb = loadGame();
  const b = sb.CONFIG.rps.bonus;
  t.equal(sb.rpsBonus("spear", "sword"), b, "槍は剣に有利");
  t.equal(sb.rpsBonus("sword", "bow"), b, "剣は弓に有利");
  t.equal(sb.rpsBonus("bow", "spear"), b, "弓は槍に有利");
  t.equal(sb.rpsBonus("sword", "spear"), 1, "剣→槍は等倍（不利側）");
  t.equal(sb.rpsBonus("bow", "sword"), 1, "弓→剣は等倍（不利側）");
});

s.test("槍兵の突きは剣士に有利ダメージが乗る（実戦）", (t) => {
  const { sb, game } = newGame(0);
  const spear = new sb.Unit(1500, 300, "blue");
  spear.applyClass("spearman");
  const sword = new sb.Unit(1550, 300, "red");
  sword.applyClass("ashigaru"); // 刀
  spear.aim = 0;
  game.units = [spear, sword];
  const hp0 = sword.hp;
  spear.tryShoot(game);
  t.lessThan(sword.hp, hp0 - sb.WEAPONS.yari.damage, "剣士には素の槍ダメージより多く入る（相性有利）");
});

s.test("軍師：aura(近くの味方)と采配(味方全体)で与ダメ強化、敵は対象外", (t) => {
  const { sb, game } = newGame(0);
  const A = sb.ABILITY;
  const gunshi = new sb.Unit(1500, 300, "blue"); gunshi.applyClass("gunshi");
  const near = new sb.Unit(1550, 300, "blue"); near.applyClass("ashigaru");   // aura圏内(50px)
  const far  = new sb.Unit(1500, 1000, "blue"); far.applyClass("ashigaru");   // aura圏外(700px)
  const foe  = new sb.Unit(1550, 320, "red"); foe.applyClass("ashigaru");     // 敵
  game.units = [gunshi, near, far, foe];

  // 采配前：近い味方だけ aura、遠い味方と敵は等倍。
  game._updateCommand(16);
  t.close(near.cmdDmgMul, A.auraDmgMul, 1e-9, "近い味方は aura で与ダメ強化");
  t.equal(far.cmdDmgMul, 1, "遠い味方は aura 圏外で等倍");
  t.equal(foe.cmdDmgMul, 1, "敵は軍師バフの対象外");

  // 采配後：味方全体が rally、敵は依然 等倍。近い味方は rally×aura で最大。
  gunshi.useAbility(game);
  game._updateCommand(16);
  t.greaterThan(far.cmdDmgMul, 1, "采配で遠い味方も強化される");
  t.greaterThan(near.cmdDmgMul, far.cmdDmgMul, "近い味方は rally×aura でさらに強い");
  t.equal(foe.cmdDmgMul, 1, "采配中も敵は強化されない");
});

s.test("軍師：倒れると aura が消える（強化が外れる）", (t) => {
  const { sb, game } = newGame(0);
  const gunshi = new sb.Unit(1500, 300, "blue"); gunshi.applyClass("gunshi");
  const near = new sb.Unit(1550, 300, "blue"); near.applyClass("ashigaru");
  game.units = [gunshi, near];
  game._updateCommand(16);
  t.greaterThan(near.cmdDmgMul, 1, "生存中は aura で強化");
  gunshi.alive = false; // 討死
  game._updateCommand(16);
  t.equal(near.cmdDmgMul, 1, "軍師が倒れると強化は消える");
});

s.test("8vs8：各チーム CONFIG.teamSize(=8) 人が配置される（軍師追加）", (t) => {
  const { sb, game } = newGame(0);
  t.equal(sb.CONFIG.teamSize, 8, "teamSize は8");
  t.equal(game.units.filter((u) => u.team === "blue").length, 8, "青8人");
  t.equal(game.units.filter((u) => u.team === "red").length, 8, "赤8人");
});

s.test("大筒は大きな砲丸で、直撃＋着弾点周囲にも衝撃が及ぶ", (t) => {
  const { sb, game } = newGame(0);
  game.beasts = []; game.map.rocks = []; game.map.mountains = []; // 障害物を除いて検証
  const direct = new sb.Unit(1800, 1125, "red");
  const nearby = new sb.Unit(1800, 1155, "red"); // 直撃点の近く（splash圏内）
  game.units = [direct, nearby];
  const ball = new sb.Bullet(1800, 1125, 1, 0, "blue", { damage: 72, speed: 0, life: 1000, ball: true, splash: 78 });
  t.greaterThan(ball.radius, sb.CONFIG.bullet.radius, "砲丸は通常弾より大きい");
  game.bullets = [ball];
  ball.update(16, game);
  t.lessThan(direct.hp, direct.maxHp, "直撃した敵がダメージ");
  t.lessThan(nearby.hp, nearby.maxHp, "周囲の敵にも衝撃ダメージ");
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

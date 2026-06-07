// Fortress gates (城門): allies pass, enemies are blocked until they destroy
// the gate, and gates take damage from enemy fire / explosions.

const { newGame } = require("./harness");
const { suite } = require("./assert");

const s = suite();

s.test("each fort has gates", (t) => {
  const { game } = newGame(0);
  t.ok(game.map.gates.length >= 2, "gates exist (top & bottom per fort)");
});

s.test("an enemy is blocked by a gate but an ally passes", (t) => {
  const { game } = newGame(0);
  const g = game.map.gates[0]; // belongs to g.team
  const cx = g.x + g.w / 2;
  const cy = g.y + g.h / 2;
  const enemyTeam = g.team === "blue" ? "red" : "blue";
  const blocked = game.map.resolveCollision(cx, cy, 14, false, enemyTeam);
  const ally = game.map.resolveCollision(cx, cy, 14, false, g.team);
  t.equal(blocked.x === cx && blocked.y === cy, false, "enemy is pushed out of the gate");
  t.equal(ally.x, cx, "ally passes through its own gate");
  t.equal(ally.y, cy, "ally passes through its own gate (y)");
});

s.test("enemy fire damages a gate; friendly fire passes", (t) => {
  const { sb, game } = newGame(0);
  const g = game.map.gates[0];
  const cx = g.x + g.w / 2;
  const cy = g.y + g.h / 2;
  const enemyTeam = g.team === "blue" ? "red" : "blue";
  const before = g.hp;
  const eb = new sb.Bullet(cx, cy, 0, 0, enemyTeam, { damage: 16, speed: 0, life: 1000 });
  game.bullets = [eb];
  eb.update(16, game);
  t.lessThan(g.hp, before, "enemy bullet damaged the gate");
  const hp2 = g.hp;
  const fb = new sb.Bullet(cx, cy, 0, 0, g.team, { damage: 16, speed: 0, life: 1000 });
  fb.update(16, game);
  t.equal(g.hp, hp2, "friendly fire does not damage your own gate");
});

s.test("a destroyed gate no longer blocks", (t) => {
  const { game } = newGame(0);
  const g = game.map.gates[0];
  g.hp = 0;
  const cx = g.x + g.w / 2;
  const cy = g.y + g.h / 2;
  const enemyTeam = g.team === "blue" ? "red" : "blue";
  const out = game.map.resolveCollision(cx, cy, 14, false, enemyTeam);
  t.equal(out.x, cx, "enemy passes a broken gate");
});

s.test("fort walls block the enemy but allies pass their own fort", (t) => {
  const { game } = newGame(0);
  t.ok(game.map.walls.length > 0, "fort has walls");
  const w = game.map.walls[0];
  const cx = w.x + w.w / 2;
  const cy = w.y + w.h / 2;
  const enemyTeam = w.team === "blue" ? "red" : "blue";
  const ally = game.map.resolveCollision(cx, cy, 14, false, w.team);
  const enemy = game.map.resolveCollision(cx, cy, 14, false, enemyTeam);
  t.equal(ally.x === cx && ally.y === cy, true, "ally passes its own wall");
  t.equal(enemy.x === cx && enemy.y === cy, false, "enemy is blocked by the wall");
});

s.test("自軍の爆発は自分の砦を傷つけない(誤爆防止)", (t) => {
  const { sb, game } = newGame(0);
  const blue = game.map.baseOf("blue");
  const before = blue.hp;
  const owner = { team: "blue", activeBombs: 1 };
  const bomb = new sb.Bomb(blue.x, blue.y, owner);
  if (typeof bomb.explode === "function") bomb.explode(game);
  else bomb.detonate(game);
  t.equal(blue.hp, before, "自軍の爆弾は自分の砦を壊さない");
});

s.test("敵砦への攻撃は自軍砦を巻き込まない", (t) => {
  const { sb, game } = newGame(0);
  const blue = game.map.baseOf("blue");
  const red = game.map.baseOf("red");
  const blueBefore = blue.hp;
  const redBefore = red.hp;
  const owner = { team: "blue", activeBombs: 1 };
  const bomb = new sb.Bomb(red.x, red.y, owner);
  if (typeof bomb.explode === "function") bomb.explode(game);
  else bomb.detonate(game);
  t.lessThan(red.hp, redBefore, "敵砦は減る");
  t.equal(blue.hp, blueBefore, "自軍砦は無傷");
});

s.test("敵弾は砦の壁で止まる(壁越しに砦を撃てない)", (t) => {
  const { sb, game } = newGame(0);
  // 門ではない、チーム所属の壁を1枚選ぶ。
  const w = game.map.walls.find((w) => w.team);
  const enemyTeam = w.team === "blue" ? "red" : "blue";
  const cx = w.x + w.w / 2;
  const cy = w.y + w.h / 2;
  const fort = game.map.baseOf(w.team);
  const fortBefore = fort.hp;
  const bullet = new sb.Bullet(cx, cy, 0, 0, enemyTeam, { damage: 16, speed: 0, life: 1000 });
  game.bullets = [bullet];
  bullet.update(16, game);
  t.equal(bullet.dead, true, "敵弾は壁で消える");
  t.equal(fort.hp, fortBefore, "壁が弾を止めるので砦は無傷");
});

s.test("自軍の弾は自分の砦の壁を通り抜ける(砦から撃ち出せる)", (t) => {
  const { sb, game } = newGame(0);
  const w = game.map.walls.find((w) => w.team);
  const cx = w.x + w.w / 2;
  const cy = w.y + w.h / 2;
  const friendly = new sb.Bullet(cx, cy, 0, 0, w.team, { damage: 16, speed: 0, life: 1000 });
  game.bullets = [friendly];
  friendly.update(16, game);
  t.equal(friendly.dead, false, "自軍の弾は自分の壁では消えない");
});

module.exports = s;

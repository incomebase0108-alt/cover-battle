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

module.exports = s;

// Dynamite: a fort-buster with a 3s fuse that the ENEMY can shoot to defuse
// before it detonates. One live stick per unit; detonation wrecks forts.

const { newGame } = require("./harness");
const { suite } = require("./assert");

const s = suite();

s.test("placing dynamite creates one and caps at a single live stick", (t) => {
  const { sb, game } = newGame(0);
  const u = new sb.Unit(500, 500, "blue");
  game.units = [u];
  u.placeDynamite(game);
  u.placeDynamite(game); // second should be refused
  t.equal(game.dynamites.length, 1, "only one live dynamite per unit");
  t.equal(u.activeDynamite, 1, "owner tracks its live stick");
});

s.test("dynamite detonates after its fuse and wrecks a nearby fort", (t) => {
  const { sb, game } = newGame(0);
  const red = game.map.baseOf("red");
  const before = red.hp;
  const d = new sb.Dynamite(red.x, red.y, null);
  game.dynamites = [d];
  d.update(sb.CONFIG.dynamite.fuse + 20, game);
  t.equal(d.exploded, true, "fuse ran out -> exploded");
  t.lessThan(red.hp, before - 100, "fort took heavy dynamite damage");
});

s.test("an enemy bullet defuses dynamite before it blows", (t) => {
  const { sb, game } = newGame(0);
  const owner = new sb.Unit(500, 500, "blue");
  const d = new sb.Dynamite(500, 500, owner);
  d.hp = sb.CONFIG.bullet.damage; // one shot will finish it
  game.dynamites = [d];
  const enemyBullet = new sb.Bullet(500, 500, 0, 0, "red", { damage: sb.CONFIG.bullet.damage, speed: 0, life: 1000 });
  game.bullets = [enemyBullet];
  enemyBullet.update(16, game);
  t.equal(d.defused, true, "enemy fire defused it");
  t.equal(d.exploded, false, "it never detonated");
});

s.test("the owner's own bullets do not defuse their dynamite", (t) => {
  const { sb, game } = newGame(0);
  const owner = new sb.Unit(500, 500, "blue");
  const d = new sb.Dynamite(500, 500, owner);
  game.dynamites = [d];
  const friendly = new sb.Bullet(500, 500, 0, 0, "blue", { damage: 999, speed: 0, life: 1000 });
  t.equal(d.hitBy(friendly), false, "friendly fire passes through dynamite");
  t.equal(d.defused, false, "still armed");
});

module.exports = s;

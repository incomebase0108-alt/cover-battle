// Fort durability + win/lose: destroying the enemy fort wins the stage; losing
// your own fort is a defeat. Bullets damage the enemy fort core; your own fort
// blocks your bullets without taking damage. Bombs damage forts in their blast.

const { newGame } = require("./harness");
const { suite } = require("./assert");

const s = suite();

s.test("destroying the red fort wins the stage", (t) => {
  const { game, ended } = newGame(0);
  game.map.baseOf("red").hp = 0;
  game._update(16);
  t.ok(ended.value && ended.value.win === true, "win when red fort is destroyed");
});

s.test("losing the blue fort is a defeat", (t) => {
  const { game, ended } = newGame(0);
  game.map.baseOf("blue").hp = 0;
  game._update(16);
  t.ok(ended.value && ended.value.win === false, "lose when blue fort is destroyed");
});

s.test("a blue bullet damages the red fort core and is consumed", (t) => {
  const { sb, game } = newGame(0);
  const red = game.map.baseOf("red");
  const before = red.hp;
  const b = new sb.Bullet(red.x, red.y, 0, 0, "blue", { damage: 16, speed: 0, life: 1000 });
  game.bullets = [b];
  b.update(16, game);
  t.lessThan(red.hp, before, "red fort hp dropped");
  t.equal(b.dead, true, "bullet consumed on the fort");
});

s.test("a unit's own fort blocks its bullet without taking damage", (t) => {
  const { sb, game } = newGame(0);
  const blue = game.map.baseOf("blue");
  const before = blue.hp;
  const b = new sb.Bullet(blue.x, blue.y, 0, 0, "blue", { damage: 16, speed: 0, life: 1000 });
  game.bullets = [b];
  b.update(16, game);
  t.equal(blue.hp, before, "own fort takes no damage");
  t.equal(b.dead, true, "bullet still stops at own fort");
});

s.test("a bomb damages a fort within its blast", (t) => {
  const { sb, game } = newGame(0);
  const red = game.map.baseOf("red");
  const before = red.hp;
  const bomb = new sb.Bomb(red.x, red.y, null);
  bomb.detonate(game);
  t.lessThan(red.hp, before, "fort hp dropped from the explosion");
});

module.exports = s;

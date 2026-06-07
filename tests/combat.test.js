// Destructible rocks + item drops.
//
// Rocks take CONFIG.bullet.rockDamage from bullets and CONFIG.bomb.rockDamage
// from bombs. At 0 hp they shatter (are removed from the map) and may drop an
// item (CONFIG.rock.dropChance). shatterRock / dropFromRock / damageRocksInRadius
// drive this. Bombs also damage units in their blast and flatten rocks in range.

const { newGame } = require("./harness");
const { suite } = require("./assert");

const s = suite();

// Find a rock and put a bullet just touching its left edge, moving right.
function bulletAtRock(sb, game, rock) {
  const CONFIG = sb.CONFIG;
  const b = new sb.Bullet(rock.x - rock.r - 1, rock.y, 1, 0, "blue", {
    damage: CONFIG.bullet.damage,
    speed: CONFIG.bullet.speed,
    life: CONFIG.bullet.life,
  });
  game.bullets = [b];
  return b;
}

s.test("a bullet damages a rock by CONFIG.bullet.rockDamage and dies", (t) => {
  const { sb, game } = newGame(0);
  const CONFIG = sb.CONFIG;
  const rock = game.map.rocks[0];
  const hp0 = rock.hp;
  const b = bulletAtRock(sb, game, rock);
  // Step until the bullet reaches the rock.
  for (let i = 0; i < 5 && !b.dead; i++) b.update(16, game);
  t.ok(b.dead, "bullet dies on hitting a rock");
  t.equal(rock.hp, hp0 - CONFIG.bullet.rockDamage, "rock loses exactly rockDamage hp");
});

s.test("enough bullet hits shatter a rock and remove it from the map", (t) => {
  const { sb, game } = newGame(0);
  const CONFIG = sb.CONFIG;
  const rock = game.map.rocks[0];
  const startCount = game.map.rocks.length;
  const hitsNeeded = Math.ceil(rock.hp / CONFIG.bullet.rockDamage);
  for (let h = 0; h < hitsNeeded; h++) {
    const b = bulletAtRock(sb, game, rock);
    for (let i = 0; i < 5 && !b.dead; i++) b.update(16, game);
  }
  t.equal(rock.hp <= 0, true, "rock hp reduced to 0 or below");
  t.ok(!game.map.rocks.includes(rock), "shattered rock removed from map");
  t.equal(game.map.rocks.length, startCount - 1, "rock count drops by one");
});

s.test("shatterRock removes the rock and (with forced RNG) drops an item", (t) => {
  const { sb, game } = newGame(0);
  const rock = game.map.rocks[0];
  const before = game.map.rocks.length;
  const itemsBefore = game.items.length;
  // Force the drop roll to always succeed (Math.random < dropChance).
  const realRandom = Math.random;
  Math.random = () => 0; // guarantees a drop and a valid item-type index
  try {
    game.shatterRock(rock);
  } finally {
    Math.random = realRandom;
  }
  t.equal(game.map.rocks.length, before - 1, "shatterRock removes the rock");
  t.equal(game.items.length, itemsBefore + 1, "an item drops when RNG favours it");
  t.close(game.items[itemsBefore].x, rock.x, 0.001, "item drops at the rock's x");
  t.close(game.items[itemsBefore].y, rock.y, 0.001, "item drops at the rock's y");
});

s.test("dropFromRock drops nothing when the RNG roll fails", (t) => {
  const { game } = newGame(0);
  const rock = game.map.rocks[0];
  const itemsBefore = game.items.length;
  const realRandom = Math.random;
  Math.random = () => 1; // 1 > dropChance -> no drop
  try {
    game.dropFromRock(rock);
  } finally {
    Math.random = realRandom;
  }
  t.equal(game.items.length, itemsBefore, "no item drops when the roll fails");
});

s.test("a bomb flattens rocks within its blast radius", (t) => {
  const { sb, game } = newGame(0);
  const CONFIG = sb.CONFIG;
  // bombRockDamage >= rock.hp so any rock the blast touches is destroyed.
  t.greaterThan(CONFIG.bomb.rockDamage, CONFIG.rock.hp - 1, "bombs out-damage rock hp");
  const rock = game.map.rocks[0];
  const before = game.map.rocks.length;
  const bomb = new sb.Bomb(rock.x, rock.y, null);
  game.bombs = [bomb];
  // Suppress drops so the assertion focuses on destruction.
  const realRandom = Math.random;
  Math.random = () => 1;
  try {
    bomb.detonate(game);
  } finally {
    Math.random = realRandom;
  }
  t.ok(!game.map.rocks.includes(rock), "rock at blast centre is destroyed");
  t.lessThan(game.map.rocks.length, before, "rock count drops after the blast");
});

s.test("a bomb damages units inside its blast radius", (t) => {
  const { sb, game } = newGame(0);
  const CONFIG = sb.CONFIG;
  // Open spot away from rocks; put a unit at the blast centre.
  const victim = new sb.Unit(120, 120, "red");
  const hp0 = victim.hp;
  game.units = [victim];
  const bomb = new sb.Bomb(victim.x, victim.y, null);
  bomb.detonate(game);
  t.equal(victim.hp, hp0 - CONFIG.bomb.damage, "unit at blast centre takes bomb damage");
});

s.test("damageRocksInRadius reports and removes exactly the rocks it breaks", (t) => {
  const { sb, game } = newGame(0);
  const CONFIG = sb.CONFIG;
  const rock = game.map.rocks[0];
  const before = game.map.rocks.length;
  const broken = game.map.damageRocksInRadius(
    rock.x, rock.y, 1, CONFIG.rock.hp // tiny radius, lethal damage -> just this rock
  );
  t.equal(broken.length, 1, "exactly one rock reported broken");
  t.equal(broken[0], rock, "the reported rock is the targeted one");
  t.equal(game.map.rocks.length, before - 1, "broken rock removed from the map");
});

module.exports = s;

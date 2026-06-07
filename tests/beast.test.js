// Wild beasts: neutral animals that maul any nearby unit and can be shot down
// by either team.

const { newGame } = require("./harness");
const { suite } = require("./assert");

const s = suite();

s.test("a beast claws a unit standing next to it", (t) => {
  const { sb, game } = newGame(0);
  const beast = new sb.Beast(800, 800, "nobushi");
  const u = new sb.Unit(805, 800, "blue");
  game.units = [u];
  game.beasts = [beast];
  beast.update(16, game);
  t.lessThan(u.hp, sb.CONFIG.unit.maxHp, "adjacent unit took a hit");
});

s.test("a bullet (either team) wounds a beast", (t) => {
  const { sb, game } = newGame(0);
  const beast = new sb.Beast(800, 800, "nobushi");
  game.beasts = [beast];
  game.units = [];
  const before = beast.hp;
  const b = new sb.Bullet(800, 800, 1, 0, "red", { damage: 30, speed: 0, life: 1000 });
  game.bullets = [b];
  b.update(16, game);
  t.lessThan(beast.hp, before, "beast wounded by gunfire");
  t.equal(b.dead, true, "normal round stops on the beast");
});

s.test("enough damage kills a beast", (t) => {
  const { sb, game } = newGame(0);
  const beast = new sb.Beast(800, 800, "nobushi");
  beast.takeDamage(beast.maxHp);
  t.equal(beast.dead, true, "beast dies when HP hits 0");
});

s.test("a tamed beast is friendly: allies ignore it and it spares them", (t) => {
  const { sb, game } = newGame(0);
  const beast = new sb.Beast(800, 800, "nobushi");
  beast.team = "blue"; // tamed by blue
  const ally = new sb.Unit(810, 800, "blue");
  const ai = new sb.AIController();
  game.beasts = [beast];
  game.units = [ally];
  t.equal(ai.nearestBeast(ally, game, 300), null, "allies don't target their own beast");
  const hp0 = ally.hp;
  beast.update(16, game);
  t.equal(ally.hp, hp0, "tamed beast does not maul its own team");
});

module.exports = s;

// Wild beasts: neutral animals that maul any nearby unit and can be shot down
// by either team.

const { newGame } = require("./harness");
const { suite } = require("./assert");

const s = suite();

s.test("a beast claws a unit standing next to it", (t) => {
  const { sb, game } = newGame(0);
  const beast = new sb.Beast(800, 800, "tiger");
  const u = new sb.Unit(805, 800, "blue");
  game.units = [u];
  game.beasts = [beast];
  beast.update(16, game);
  t.lessThan(u.hp, sb.CONFIG.unit.maxHp, "adjacent unit took a hit");
});

s.test("a bullet (either team) wounds a beast", (t) => {
  const { sb, game } = newGame(0);
  const beast = new sb.Beast(800, 800, "tiger");
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
  const beast = new sb.Beast(800, 800, "tiger");
  beast.takeDamage(beast.maxHp);
  t.equal(beast.dead, true, "beast dies when HP hits 0");
});

s.test("a tamed beast is friendly: allies ignore it and it spares them", (t) => {
  const { sb, game } = newGame(0);
  const beast = new sb.Beast(800, 800, "tiger");
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

s.test("動物使いは2匹まで捕獲でき、3匹目は上限で捕獲できない", (t) => {
  const { sb, game } = newGame(0);
  t.equal(sb.getClass("tamer").abilityMax, 2, "捕獲上限は2匹");
  const tamer = new sb.Unit(800, 800, "blue");
  tamer.cls = "tamer";
  tamer.name = "P1";
  const b1 = new sb.Beast(810, 800, "tiger");
  const b2 = new sb.Beast(815, 800, "bear");
  const b3 = new sb.Beast(820, 800, "tiger");
  game.beasts = [b1, b2, b3];
  game.units = [tamer];
  t.equal(tamer.abilityRemaining(game), 2, "最初は残り2");
  tamer.useAbility(game); // 1匹目
  tamer.useAbility(game); // 2匹目
  const tamed = [b1, b2, b3].filter((b) => b.team === "blue").length;
  t.equal(tamed, 2, "2匹まで捕獲できる");
  t.equal(tamer.abilityRemaining(game), 0, "残り0");
  tamer.useAbility(game); // 3匹目は上限で捕獲できない
  t.equal([b1, b2, b3].filter((b) => b.team === "blue").length, 2, "3匹目は捕獲されない");
  // 1匹が死ぬと枠が空き、また捕獲できる。
  const tamedBeast = [b1, b2, b3].find((b) => b.team === "blue");
  tamedBeast.dead = true;
  t.equal(tamer.abilityRemaining(game), 1, "1匹死ぬと残り1に回復");
  tamer.useAbility(game);
  t.equal([b1, b2, b3].filter((b) => b.team === "blue" && !b.dead).length, 2, "空いた枠で再捕獲できる");
});

module.exports = s;

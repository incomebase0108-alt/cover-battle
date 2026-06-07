// Squad tactics: units get roles, and the team stance reacts to fort health.

const { newGame } = require("./harness");
const { suite } = require("./assert");

const s = suite();

s.test("team fields 6 units per side (12 total)", (t) => {
  const { sb, game } = newGame(0);
  t.equal(game.units.filter((u) => u.team === "blue").length, sb.CONFIG.teamSize, "6 blue");
  t.equal(game.units.filter((u) => u.team === "red").length, sb.CONFIG.teamSize, "6 red");
});

s.test("assignRole spreads defenders/attackers/flankers across the squad", (t) => {
  const { sb, game } = newGame(0);
  const ai = new sb.AIController();
  const roles = {};
  for (const u of game.units.filter((x) => x.team === "red")) {
    const r = ai.assignRole(u, game);
    roles[r] = (roles[r] || 0) + 1;
  }
  t.ok(roles.DEFENDER > 0, "has a defender");
  t.ok(roles.ATTACKER > 0, "has an attacker");
  t.ok(roles.FLANKER > 0, "has a flanker");
});

s.test("teamStance is DEFEND when the home fort is badly hurt", (t) => {
  const { sb, game } = newGame(0);
  const ai = new sb.AIController();
  game.map.baseOf("blue").hp = game.map.baseOf("blue").maxHp * 0.3;
  t.equal(ai.teamStance("blue", game), "DEFEND", "low fort -> DEFEND");
});

s.test("teamStance is PUSH when the enemy fort is weaker", (t) => {
  const { sb, game } = newGame(0);
  const ai = new sb.AIController();
  game.map.baseOf("red").hp = game.map.baseOf("red").maxHp * 0.4; // enemy weaker
  t.equal(ai.teamStance("blue", game), "PUSH", "enemy fort lower -> PUSH");
});

module.exports = s;

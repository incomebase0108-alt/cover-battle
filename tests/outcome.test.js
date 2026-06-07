// Win/lose detection: when all reds are dead the player wins (onEnd(true,...)),
// when all blues are dead the player loses (onEnd(false,...)). hasNext reflects
// whether a further stage exists.

const { newGame } = require("./harness");
const { suite } = require("./assert");

const s = suite();

s.test("killing every red triggers a win via onEnd", (t) => {
  const { game, ended } = newGame(0);
  for (const u of game.units) if (u.team === "red") u.alive = false;
  game._update(16);
  t.ok(ended.value, "onEnd was called");
  t.equal(ended.value.win, true, "win flag is true when all reds dead");
});

s.test("losing every blue triggers a loss via onEnd", (t) => {
  const { game, ended } = newGame(0);
  for (const u of game.units) if (u.team === "blue") u.alive = false;
  game._update(16);
  t.ok(ended.value, "onEnd was called");
  t.equal(ended.value.win, false, "win flag is false when all blues dead");
});

s.test("no end is signalled while both teams have survivors", (t) => {
  const { game, ended } = newGame(0);
  game._update(16);
  t.equal(ended.value, null, "game continues while both sides alive");
});

s.test("hasNext is true on stage 0 and false on the last stage", (t) => {
  const a = newGame(0);
  for (const u of a.game.units) if (u.team === "red") u.alive = false;
  a.game._update(16);
  t.equal(a.ended.value.hasNext, true, "stage 0 has a next stage");

  const lastIndex = a.sb.STAGES.length - 1;
  const b = newGame(lastIndex);
  for (const u of b.game.units) if (u.team === "red") u.alive = false;
  b.game._update(16);
  t.equal(b.ended.value.hasNext, false, "final stage has no next stage");
  t.equal(b.ended.value.idx, lastIndex, "onEnd reports the stage index");
});

s.test("aliveCount reflects the surviving units per team", (t) => {
  const { sb, game } = newGame(0);
  const blue0 = game.aliveCount("blue");
  t.greaterThan(blue0, 0, "blue team starts with survivors");
  const victim = game.units.find((u) => u.team === "blue" && u.alive);
  victim.alive = false;
  t.equal(game.aliveCount("blue"), blue0 - 1, "aliveCount drops by one after a death");
});

module.exports = s;

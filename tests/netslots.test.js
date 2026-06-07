// LAN slot control: a player can take an AI slot and hand it back. Releasing a
// slot must restore its default name (青N/赤N) so tapping through several slots
// in the lobby doesn't leave a trail of slots still labelled with the player's
// name. Regression test for "everyone shows as Player".

const { newGame } = require("./harness");
const { suite } = require("./assert");

const s = suite();

s.test("loadStage gives every slot a default name", (t) => {
  const { game } = newGame(0);
  for (const u of game.units) {
    t.ok(!!u.defaultName, "unit has a defaultName");
    t.equal(u.name, u.defaultName, "name starts as the default");
  }
});

s.test("assignControl takes a slot and releaseControl restores its name", (t) => {
  const { game } = newGame(0);
  const slot = 1;
  const u = game.assignControl("blue", slot);
  t.ok(u, "a free slot is assigned");
  t.equal(u.controller, "net", "slot is now net-controlled");
  const original = u.defaultName;
  u.name = "Player"; // server sets the human's name on pick
  game.releaseControl(u);
  t.equal(u.controller, null, "slot released back to AI");
  t.ok(!!u.ai, "AI re-attached to the freed slot");
  t.equal(u.name, original, "name restored to its default (not left as 'Player')");
});

s.test("tapping through several blue slots leaves only one human, names intact", (t) => {
  const { game } = newGame(0);
  // Simulate one client picking slot after slot (like browsing characters):
  // each pick releases the previous slot.
  let held = null;
  for (const slot of [0, 2, 4, 3]) {
    if (held) game.releaseControl(held);
    held = game.assignControl("blue", slot);
    held.name = "Player";
  }
  const blue = game.units.filter((u) => u.team === "blue");
  const humans = blue.filter((u) => u.controller === "net");
  t.equal(humans.length, 1, "only the currently held slot is human");
  // Every other blue slot shows its default name, not 'Player'.
  const stalePlayers = blue.filter((u) => u.controller !== "net" && u.name === "Player");
  t.equal(stalePlayers.length, 0, "no abandoned slots left labelled 'Player'");
});

module.exports = s;

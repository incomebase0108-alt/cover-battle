// Selectable AI difficulty. A single coefficient `aiSkill` (0..1) is set on every
// AI unit from CONFIG.difficulty, and it drives the shooting model in ai.js
// (aim error, reaction delay, fire rate, engage range) plus a bullet-damage
// multiplier. The char-select and the LAN lobby both expose this so "AIが強すぎる"
// can be dialled down; the default is the gentlest level.

const { loadGame, makeCanvas } = require("./harness");
const { suite } = require("./assert");

const s = suite();

// Build a fresh game on `stageIndex` with CONFIG.difficulty pre-set, so the
// coefficient is applied while units are spawned.
function gameWithDifficulty(level, stageIndex = 0) {
  const sb = loadGame();
  sb.CONFIG.difficulty = level;
  const game = new sb.Game(makeCanvas(), { onHud: () => {}, onEnd: () => {} });
  game.loadStage(stageIndex);
  return { sb, game };
}

s.test("aiSkillFor maps each level (and falls back to normal)", (t) => {
  const { sb } = gameWithDifficulty("normal");
  t.equal(sb.aiSkillFor("easy"), 0.35, "easy = 0.35");
  t.equal(sb.aiSkillFor("normal"), 0.6, "normal = 0.6");
  t.equal(sb.aiSkillFor("hard"), 0.85, "hard = 0.85");
  t.equal(sb.aiSkillFor("???"), 0.6, "unknown -> normal value");
});

s.test("the default difficulty is the gentlest (easy)", (t) => {
  const sb = loadGame();
  t.equal(sb.CONFIG.difficulty, "easy", "ships defaulting to easy");
});

s.test("every AI unit gets aiSkill / skill / damageMul from the difficulty", (t) => {
  const { sb, game } = gameWithDifficulty("hard");
  const expected = sb.aiSkillFor("hard");
  for (const u of game.units) {
    if (!u.ai || u.isPlayer) continue;
    t.equal(u.aiSkill, expected, "aiSkill = level value");
    t.equal(u.skill, expected, "skill mirrors aiSkill");
    t.close(u.damageMul, 0.7 + 0.3 * expected, 1e-9, "damageMul = 0.7 + 0.3*skill");
  }
});

s.test("easy makes the AI weaker than hard across the board", (t) => {
  const easy = gameWithDifficulty("easy");
  const hard = gameWithDifficulty("hard");
  const e = easy.game.units.find((u) => u.team === "red");
  const h = hard.game.units.find((u) => u.team === "red");
  t.ok(e.aiSkill < h.aiSkill, "easy aiSkill < hard aiSkill");
  t.ok(e.damageMul < h.damageMul, "easy bullets hit softer than hard");
});

s.test("engageRange shrinks and aim error grows as aiSkill drops", (t) => {
  const { sb, game } = gameWithDifficulty("easy");
  const ai = new sb.AIController();
  const weak = { aiSkill: 0.2, skill: 0.2, x: 0, y: 0 };
  const strong = { aiSkill: 0.9, skill: 0.9, x: 0, y: 0 };
  t.ok(ai.engageRange(weak) < ai.engageRange(strong), "weaker AI engages from closer");
  // engageRange = range * (0.6 + 0.4*sk)
  t.close(ai.engageRange(strong), sb.CONFIG.unit.range * (0.6 + 0.4 * 0.9), 1e-9, "formula matches");
});

s.test("applyDifficultyToAi re-skills live AI units when difficulty changes", (t) => {
  const { sb, game } = gameWithDifficulty("hard");
  sb.CONFIG.difficulty = "easy";
  game.applyDifficultyToAi();
  const expected = sb.aiSkillFor("easy");
  for (const u of game.units) {
    if (!u.ai || u.isPlayer) continue;
    t.equal(u.aiSkill, expected, "live AI re-skilled to easy");
  }
});

s.test("a weak AI holds fire briefly after acquiring a target (reaction delay)", (t) => {
  const { sb, game } = gameWithDifficulty("easy");
  game.units = [];
  game.beasts = []; game.items = []; game.smokes = []; game.turrets = [];
  // Open ground, clear LOS, point blank so range/LOS never block the shot.
  const u = new sb.Unit(600, 100, "blue");
  u.ai = new sb.AIController();
  game.applyAiSkill(u); // easy -> low skill -> long reaction
  game.units.push(u);
  const enemy = new sb.Unit(660, 100, "red");
  enemy.ai = new sb.AIController();
  game.units.push(enemy);

  const realRandom = Math.random;
  Math.random = () => 0; // force any probabilistic gate to pass
  try {
    // First couple of frames fall inside the reaction window -> no shot yet.
    u.cooldown = 0; u.ai.update(u, 16, game);
    u.cooldown = 0; u.ai.update(u, 16, game);
    t.equal(game.bullets.length, 0, "no shot during the reaction delay");
    // After enough time passes the reaction delay clears and it fires.
    let fired = 0;
    for (let i = 0; i < 80; i++) { u.cooldown = 0; u.ai.update(u, 16, game); fired += game.bullets.length; game.bullets = []; }
    t.greaterThan(fired, 0, "fires once the reaction delay has elapsed");
  } finally {
    Math.random = realRandom;
  }
});

module.exports = s;

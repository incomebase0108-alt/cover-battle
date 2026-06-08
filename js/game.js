// Core game state + loop. Builds a stage, runs the simulation, detects win/lose.
class Game {
  constructor(canvas, callbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.callbacks = callbacks || {};
    this.stageIndex = 0;
    this.playerTeam = "blue"; // the human side; the enemy can't see this side in forests
    this.playerIndex = 0;     // which blue slot the human controls (character select)
    this.serverMode = false;  // true on the LAN server: no local player, humans attach over the net
    this.cam = { x: 0, y: 0 }; // top-left of the visible viewport in world space
    this.running = false;
    this.over = false; // 試合終了フラグ（終了処理を一度だけ＆終了後は更新停止）
    this.units = [];
    this.bullets = [];
    this.items = [];
    this.bombs = [];
    this.chests = [];
    this.capturePoints = [];
    this.beasts = [];
    this.smokes = [];
    this.turrets = [];
    this.map = null;
    this.blueFortAlert = 0; // ms remaining on the "fort under attack" warning
    this._prevBlueFort = null;
    // Anti-stall: if nothing happens (no kill / no fort damage) for a while, the
    // AI rushes the enemy fort so a match always reaches a conclusion.
    this.rushMode = false;
    this.stormActive = false;
    this.idleMs = 0;
    this.elapsedMs = 0;
    this._eventSig = null;
    this.lastTime = 0;
    this._loop = this._loop.bind(this);
  }

  loadStage(index) {
    this.stageIndex = index;
    const stage = STAGES[index];
    this.map = new GameMap(stage);
    this.units = [];
    this.bullets = [];
    this.items = [];
    this.bombs = [];
    this.chests = [];
    this.capturePoints = [];
    this.beasts = [];
    this.smokes = [];
    this.turrets = [];
    this.blueFortAlert = 0;
    this._prevBlueFort = null;
    this.rushMode = false;
    this.stormActive = false;
    this.idleMs = 0;
    this.elapsedMs = 0;
    this._eventSig = null;
    this.over = false; // 新しいステージ＝未終了に戻す

    // クラス未設定スロットの予備武器（通常は classKey(i) が常にクラスを返すので未使用）。
    const loadout = ["katana", "yumi", "teppo"];
    const blueSpawns = this._teamSpawns(this.map.blueSpawns, "blue");
    const redSpawns = this._teamSpawns(this.map.redSpawns, "red");
    const pIdx = V.clamp(this.playerIndex, 0, blueSpawns.length - 1);

    // Blue team: the chosen slot is the human player (single-player only); the
    // rest are AI allies. On the LAN server nobody is a local player — humans
    // attach to slots over the network.
    const classes = (typeof CLASSES !== "undefined") ? CLASSES : null;
    const classKey = (i) => classes ? classes[i % classes.length].key : null;

    blueSpawns.forEach((s, i) => {
      const u = new Unit(s.x, s.y, "blue", !this.serverMode && i === pIdx);
      u.name = u.defaultName = "青" + (i + 1);
      if (classKey(i)) u.applyClass(classKey(i)); // class sets stats + weapon + look
      else u.setWeapon(loadout[i % loadout.length]);
      if (!u.isPlayer) {
        u.ai = new AIController();
        this.applyAiSkill(u);
      }
      this.units.push(u);
    });

    // Red team: all AI. Strength is set by the chosen difficulty (applyAiSkill),
    // not the stage, so the lobby/char-select selector fully controls how hard
    // the enemies play.
    redSpawns.forEach((s, i) => {
      const u = new Unit(s.x, s.y, "red");
      u.name = u.defaultName = "赤" + (i + 1);
      if (classKey(i)) u.applyClass(classKey(i));
      else u.setWeapon(loadout[(i + 1) % loadout.length]);
      u.ai = new AIController();
      this.applyAiSkill(u);
      this.units.push(u);
    });

    this._spawnObjectives();

    this._updateCamera(); // centre on the player before the first frame
    this._syncHud();
  }

  // Set a unit's AI strength from the active difficulty (or an explicit level).
  // aiSkill (0..1) drives accuracy / reaction time / fire rate / engage range in
  // ai.js; `skill` mirrors it so the existing tactical thresholds scale too; and
  // damageMul softens a weak AI's bullets so "やさしい" really is easier.
  applyAiSkill(u, level) {
    const sk = (typeof aiSkillFor === "function") ? aiSkillFor(level || CONFIG.difficulty) : 0.6;
    u.aiSkill = sk;
    u.skill = sk;
    u.damageMul = 0.7 + 0.3 * sk;
  }

  // Re-apply the active difficulty to every AI-controlled unit. Lets a host
  // change difficulty in the lobby and have it take effect on the live roster
  // (empty/abandoned slots are AI), not just on the next match.
  applyDifficultyToAi() {
    for (const u of this.units) {
      if (u.ai && !u.isPlayer && u.controller !== "net") this.applyAiSkill(u);
    }
  }

  // Build CONFIG.teamSize spawn points for a team: use the stage's authored
  // spawns, then generate extra ones fanned out around their centroid (pushed
  // clear of obstacles) so we can field 6-a-side without hand-authoring them.
  _teamSpawns(spawns, team) {
    const n = CONFIG.teamSize || spawns.length;
    const pts = spawns.map((s) => ({ x: s.x, y: s.y }));
    let cx = 0;
    let cy = 0;
    for (const s of spawns) { cx += s.x; cy += s.y; }
    cx /= spawns.length; cy /= spawns.length;
    let i = pts.length;
    while (pts.length < n) {
      const ang = i * 2.3999; // golden angle -> even fan
      const rad = 50 + 24 * i;
      const p = this.map.resolveCollision(
        cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad, CONFIG.unit.radius, false, team);
      pts.push(p);
      i++;
    }
    return pts.slice(0, n);
  }

  // --- LAN multiplayer helpers --------------------------------------------

  // Hand a unit to a remote player (server side). Returns the unit, or null.
  assignControl(team, slot) {
    const list = this.units.filter((u) => u.team === team);
    const u = list[slot];
    if (!u || u.controller === "net") return null;
    u.controller = "net";
    u.netInput = { mx: 0, my: 0, aim: u.aim, shoot: false };
    return u;
  }

  releaseControl(unit) {
    if (!unit) return;
    unit.controller = null;
    unit.netInput = null;
    // Restore the slot's default name (青N/赤N) so a player who taps through
    // several slots doesn't leave a trail of abandoned slots still labelled with
    // their name ("Player") — only the slot they currently hold shows as human.
    if (unit.defaultName) unit.name = unit.defaultName;
    if (!unit.ai) unit.ai = new AIController(); // hand the slot back to the AI
    this.applyAiSkill(unit); // the AI plays at the current difficulty
  }

  // Lobby view: which team/slot pairs are taken by humans.
  rosterState() {
    const roster = { blue: [], red: [] };
    for (const team of ["blue", "red"]) {
      const list = this.units.filter((u) => u.team === team);
      roster[team] = list.map((u) => ({ name: u.name, human: u.controller === "net", alive: u.alive }));
    }
    return roster;
  }

  // Stage/world data sent once to a client so it can rebuild terrain.
  serializeStatic() {
    return { stage: this.stageIndex, world: CONFIG.world };
  }

  // Compact per-tick snapshot broadcast to all clients.
  serialize() {
    const half = (h, max) => Math.max(0, h / max);
    return {
      u: this.units.map((u, i) => ({
        i, x: Math.round(u.x), y: Math.round(u.y), a: +u.aim.toFixed(2),
        t: u.team === "blue" ? 0 : 1, h: Math.round(u.hp), al: u.alive ? 1 : 0,
        n: u.name, w: u.weaponKey, mv: u.movingTimer > 0 ? 1 : 0,
        cl: u.cls, mh: u.maxHp, dn: u.downed ? 1 : 0,
        am: u.ammo, mg: u.magSizeVal(), rl: u.reloading ? 1 : 0,
        nr: u.weapon().noReload ? 1 : 0, // 装填不要（刀/弓）＝HUDで弾を出さない
        sw: u.swingMs > 0 ? Math.round(u.swingMs) : 0, // 刀の振り残り時間（ms）
        st: u.maxStamina ? +(u.stamina / u.maxStamina).toFixed(2) : 1, // 体力(0..1)
        bf: u.buffed ? 1 : 0, // 軍師の強化中（描画で光輪）
      })),
      b: this.bullets.map((b) => ({ x: Math.round(b.x), y: Math.round(b.y), t: b.team === "blue" ? 0 : 1, f: b.fire ? 1 : 0, bl: b.ball ? 1 : 0, br: b.ball ? Math.round(b.radius) : 0 })),
      bo: this.bombs.map((b) => ({ x: Math.round(b.x), y: Math.round(b.y), e: b.exploded ? 1 : 0, fl: Math.round(b.flash) })),
      c: this.chests.map((c) => ({ x: Math.round(c.x), y: Math.round(c.y), o: c.opened ? 1 : 0 })),
      be: this.beasts.map((b) => ({ x: Math.round(b.x), y: Math.round(b.y), a: +b.aim.toFixed(2), ty: b.type, h: half(b.hp, b.maxHp), tm: b.team || null })),
      sm: this.smokes.map((s) => ({ x: Math.round(s.x), y: Math.round(s.y), r: Math.round(s.r), l: Math.round(s.life) })),
      tr: this.turrets.map((t) => ({ x: Math.round(t.x), y: Math.round(t.y), a: +t.aim.toFixed(2), tm: t.team === "blue" ? 0 : 1, h: half(t.hp, t.maxHp) })),
      cp: this.capturePoints.map((c) => ({ x: Math.round(c.x), y: Math.round(c.y), o: c.owner, p: c.progress / CONFIG.capture.captureTime, cb: c.capBy })),
      ga: this.map.gates.map((g) => +(g.hp / g.maxHp).toFixed(2)),
      ft: { b: half(this.map.baseOf("blue").hp, this.map.baseOf("blue").maxHp), r: half(this.map.baseOf("red").hp, this.map.baseOf("red").maxHp) },
      al: { b: this.aliveCount("blue"), r: this.aliveCount("red") },
      rush: this.rushMode ? 1 : 0,
      gen: { b: this.generalStatus("blue"), r: this.generalStatus("red") }, // 大将状態 0健在/1危機/2討死
    };
  }

  // Mid-field objectives: one neutral control point + treasure chests at
  // contested spots.
  _spawnObjectives() {
    const W = CONFIG.world.width;
    const H = CONFIG.world.height;
    // 確保すると味方が回復できる拠点を3つ配置（中央＋対角の北西/南東）。
    this.capturePoints = [
      { x: W * 0.5, y: H * 0.5,  r: CONFIG.capture.radius, owner: null, progress: 0, capBy: null },
      { x: W * 0.3, y: H * 0.32, r: CONFIG.capture.radius, owner: null, progress: 0, capBy: null },
      { x: W * 0.7, y: H * 0.68, r: CONFIG.capture.radius, owner: null, progress: 0, capBy: null },
    ];
    this.chests = [];
    if (typeof Chest !== "undefined") {
      for (const s of [{ x: W / 2, y: H * 0.26 }, { x: W / 2, y: H * 0.74 }]) {
        const p = this.map.resolveCollision(s.x, s.y, 16);
        this.chests.push(new Chest(p.x, p.y));
      }
    }
    // 中立の浪人（野武士/剣豪）が中盤を徘徊。誰にでも斬りかかる。総大将が説得で仲間に。
    this.beasts = [];
    if (typeof Beast !== "undefined") {
      const spots = [
        { x: W * 0.5, y: H * 0.5, t: "kengo" },    // 中央に剣豪（達人）
        { x: W * 0.35, y: H * 0.4, t: "nobushi" },
        { x: W * 0.65, y: H * 0.6, t: "nobushi" },
        { x: W * 0.5, y: H * 0.22, t: "nobushi" },
        { x: W * 0.5, y: H * 0.78, t: "kengo" },
        { x: W * 0.3, y: H * 0.68, t: "nobushi" },
        { x: W * 0.7, y: H * 0.32, t: "kengo" },
      ];
      for (const s of spots) {
        const p = this.map.resolveCollision(s.x, s.y, 22);
        this.beasts.push(new Beast(p.x, p.y, s.t));
      }
    }
  }

  // Downed-ally rescue: alive units pick up downed teammates on contact, carry
  // them (the downed one follows), and reviving happens at the home fort.
  _updateRescue(dt) {
    for (const u of this.units) {
      if (!u.alive) continue;
      if (u.carrying) {
        const c = u.carrying;
        c.x = u.x; c.y = u.y; // slung over the carrier
        if (this.map.inBase(u.x, u.y, u.team)) {
          c.reviveT += dt;
          if (c.reviveT >= RESCUE.reviveTime) {
            c.alive = true; c.downed = false;
            c.hp = Math.max(1, Math.round(c.maxHp * RESCUE.reviveFrac));
            c.reviveT = 0; c.carrier = null; u.carrying = null;
            const b = this.map.baseOf(u.team); c.x = b.x; c.y = b.y;
          }
        } else {
          c.reviveT = 0;
        }
        continue;
      }
      // Pick up a downed teammate on contact (one at a time).
      for (const d of this.units) {
        if (!d.downed || d.carrier || d === u || d.team !== u.team) continue;
        if (V.dist(u.x, u.y, d.x, d.y) <= u.radius + d.radius + 6) {
          u.carrying = d; d.carrier = u; d.reviveT = 0;
          break;
        }
      }
    }
  }

  _updateBeasts(dt) {
    for (const b of this.beasts) {
      const wasDead = b.dead;
      b.update(dt, this);
      if (b.dead && !wasDead) {
        // Reward whoever felled it with a guaranteed item drop.
        const type = ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)];
        this.items.push(new Item(b.x, b.y, type));
      }
    }
    this.beasts = this.beasts.filter((b) => !b.dead);
  }

  // True if (x,y) is inside a control point owned by `team` (heals them).
  capturedPointFor(x, y, team) {
    for (const cp of this.capturePoints) {
      if (cp.owner === team && V.dist(x, y, cp.x, cp.y) <= cp.r) return true;
    }
    return false;
  }

  _updateCapture(dt) {
    for (const cp of this.capturePoints) {
      let b = 0;
      let r = 0;
      for (const u of this.units) {
        if (!u.alive) continue;
        if (V.dist(u.x, u.y, cp.x, cp.y) <= cp.r) { u.team === "blue" ? b++ : r++; }
      }
      const dom = b > r ? "blue" : r > b ? "red" : null;
      if (dom && dom !== cp.owner) {
        cp.capBy = dom;
        cp.progress += dt;
        if (cp.progress >= CONFIG.capture.captureTime) { cp.owner = dom; cp.progress = 0; cp.capBy = null; }
      } else {
        cp.capBy = null;
        cp.progress = Math.max(0, cp.progress - dt * 0.5);
      }
    }
  }

  // Pick up any chest a unit is standing on.
  _handleChests(dt) {
    for (const c of this.chests) {
      if (c.dead) continue;
      c.update(dt, this);
      if (c.opened) continue;
      for (const u of this.units) {
        if (!u.alive) continue;
        if (V.dist(c.x, c.y, u.x, u.y) <= (c.radius || 16) + u.radius) { c.open(u, this); break; }
      }
    }
    this.chests = this.chests.filter((c) => !c.dead);
  }

  start() {
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame(this._loop);
  }

  stop() {
    this.running = false;
  }

  aliveCount(team) {
    return this.units.filter((u) => u.team === team && u.alive).length;
  }

  // --- 大将ルール ---------------------------------------------------------
  // 各チームの総大将（slot0＝cls "general"）。
  generalOf(team) {
    return this.units.find((u) => u.team === team && u.cls === "general");
  }

  // 総大将が健在か。回復ゾーンの有効/無効と士気の判定に使う。
  // 大将が「居るのに倒れている」時だけペナルティを課す（実戦では slot0 に必ず大将が
  // 居る。大将そのものが存在しない最小構成では健在＝OK扱いにして副作用を出さない）。
  generalOkFor(team) {
    const g = this.generalOf(team);
    return !g || g.alive;
  }

  // 大将の状態：0=健在 / 1=危機(SOSで倒れている) / 2=討死(救出されず一定時間経過＝サドンデス)。
  generalStatus(team) {
    const g = this.generalOf(team);
    if (!g) return 0; // 大将不在（最小構成/テスト）は健在扱い＝サドンデスを誤発火させない
    if (g.alive) return 0;
    const ms = (this._genDownMs && this._genDownMs[team]) || 0;
    const limit = (CONFIG.morale && CONFIG.morale.discardMs) || 14000;
    return ms >= limit ? 2 : 1;
  }

  // 倒れている時間を計測し、各ユニットに士気倍率を乗せる（ユニット更新の前に呼ぶ）。
  _updateGenerals(dt) {
    if (!this._genDownMs) this._genDownMs = { blue: 0, red: 0 };
    for (const team of ["blue", "red"]) {
      const g = this.generalOf(team);
      const downed = !!(g && !g.alive);
      this._genDownMs[team] = downed ? this._genDownMs[team] + dt : 0;
    }
    const debuff = (CONFIG.morale && CONFIG.morale.debuffMul) || 0.7;
    for (const u of this.units) {
      u.moraleMul = this.generalOkFor(u.team) ? 1 : debuff;
    }
  }

  // 軍師の強化(aura)：生存中の軍師の周囲(auraRadius)にいる味方を強化する。近くにいる間は
  // 強化タイマーを満タンに保ち、離れても buffLingerMs の間は強化が持続する（秒数で効果）。
  // buffed フラグで描画に金色の光輪を出す＝強化中が一目で分かる。軍師自身も対象。
  _updateCommand(dt) {
    const gunshi = { blue: [], red: [] };
    for (const u of this.units) {
      if (u.alive && u.cls === "gunshi" && gunshi[u.team]) gunshi[u.team].push(u);
    }
    const r2 = ABILITY.auraRadius * ABILITY.auraRadius;
    for (const u of this.units) {
      let near = false;
      if (u.alive) {
        for (const g of (gunshi[u.team] || [])) {
          const dx = g.x - u.x, dy = g.y - u.y;
          if (dx * dx + dy * dy <= r2) { near = true; break; }
        }
      }
      if (near) u.buffMs = ABILITY.buffLingerMs;          // 近くにいる間は満タンに保つ
      else u.buffMs = Math.max(0, (u.buffMs || 0) - dt);  // 離れたら秒数で減衰
      const on = u.alive && u.buffMs > 0;
      u.buffed = on;
      u.cmdSpeedMul = on ? ABILITY.auraSpeedMul : 1;
      u.cmdDmgMul = on ? ABILITY.auraDmgMul : 1;
    }
  }

  // Forest stealth: the player always sees allies and themself. An enemy
  // hidden in a forest is invisible until a friendly unit gets close enough
  // to spot them (matching the AI's own detection rule).
  unitVisibleToPlayer(u) {
    if (u.team === this.playerTeam || u.isPlayer) return true;
    // Concealed by a forest OR a smoke cloud?
    if (!this.map.inForest(u.x, u.y) && !this.inSmoke(u.x, u.y)) return true;
    for (const a of this.units) {
      if (a.alive && a.team === this.playerTeam &&
          V.dist(a.x, a.y, u.x, u.y) <= CONFIG.forestDetectRange) {
        return true;
      }
    }
    return false;
  }

  // Is (x,y) inside any live smoke cloud?
  inSmoke(x, y) {
    for (const s of this.smokes) if (s.contains(x, y)) return true;
    return false;
  }

  _loop(now) {
    if (!this.running) return;
    let dt = now - this.lastTime;
    this.lastTime = now;
    if (dt > 50) dt = 50; // clamp huge frame gaps (e.g. tab was backgrounded)

    this._update(dt);
    this._render();

    requestAnimationFrame(this._loop);
  }

  _update(dt) {
    if (this.over) return; // 試合終了後は一切更新しない（サーバーの多重終了/多重再戦を防ぐ）
    this._updateGenerals(dt); // 大将ルール：士気倍率と「討死」までの計時をユニット更新前に確定
    this._updateCommand(dt);  // 軍師の強化(aura)：近くの味方を一定秒数強化＋buffedフラグ
    for (const u of this.units) u.update(dt, this);
    for (const b of this.bullets) b.update(dt, this);
    for (const b of this.bombs) b.update(dt, this);
    for (const it of this.items) it.update(dt);

    for (const sm of this.smokes) sm.update(dt);
    for (const tr of this.turrets) tr.update(dt, this);
    this.smokes = this.smokes.filter((s) => !s.dead);
    this.turrets = this.turrets.filter((t) => !t.dead);

    this._handlePickups();
    this._handleChests(dt);
    this._updateCapture(dt);
    this._updateBeasts(dt);
    this._updateRescue(dt);

    this.bullets = this.bullets.filter((b) => !b.dead);
    this.bombs = this.bombs.filter((b) => !b.dead);
    this.items = this.items.filter((it) => !it.dead);

    this._updateCamera();

    // Win/lose: wipe out the enemy team OR destroy their fort.
    const blue = this.aliveCount("blue");
    const red = this.aliveCount("red");
    let blueFort = this.map.baseOf("blue").hp;
    let redFort = this.map.baseOf("red").hp;

    // Anti-stall escalation: reset the idle timer whenever something meaningful
    // changes (a death or fort damage). If it stays idle too long the AI RUSHES
    // (no HP drain — just makes the CPU aggressive to break the deadlock).
    // 砦の自動ドレインは「誰も攻撃していないのに砦が減る」誤体験を生むため、
    // アイドル発動を廃止。試合終了の保証は3分経過のサドンデスのみに限定する。
    const sig = blue + "|" + red + "|" + Math.round(blueFort) + "|" + Math.round(redFort);
    if (!this.stormActive && sig !== this._eventSig) { this._eventSig = sig; this.idleMs = 0; }
    else this.idleMs += dt;
    // Hard cap: force sudden death only after 3 minutes so a match always ends.
    this.elapsedMs += dt;
    if (this.elapsedMs > 180000) this.stormActive = true;
    // 大将ルール：どちらかの総大将が「討死」（救出されず一定時間経過）したら、
    // 弱体化に加えてサドンデス(storm)を発動し、決着を促す。
    if (this.generalStatus("blue") === 2 || this.generalStatus("red") === 2) this.stormActive = true;
    this.rushMode = this.idleMs > 12000 || this.stormActive;
    if (this.stormActive) {
      const drain = 45 * dt / 1000;
      const bb = this.map.baseOf("blue");
      const rb = this.map.baseOf("red");
      bb.hp = Math.max(0, bb.hp - drain);
      rb.hp = Math.max(0, rb.hp - drain);
      blueFort = bb.hp;
      redFort = rb.hp;
    }

    // "Fort under attack" warning: trigger when our fort loses HP, or when an
    // enemy bomb is set near it. サドンデス(storm)のドレインは攻撃では
    // ないので、storm中はHP減少による警告を出さない(誤警告の防止)。
    if (this.blueFortAlert > 0) this.blueFortAlert -= dt;
    if (!this.stormActive && this._prevBlueFort != null && blueFort < this._prevBlueFort - 0.01) {
      this.blueFortAlert = 1500;
    } else if (!this.stormActive && this._enemyThreatNearBlueFort()) {
      this.blueFortAlert = Math.max(this.blueFortAlert, 600);
    }
    this._prevBlueFort = blueFort;

    this._syncHud();

    if (red === 0 || redFort <= 0) {
      this._end(true);
    } else if (blue === 0 || blueFort <= 0) {
      this._end(false);
    }
  }

  // Centre the camera on the player (or the blue centroid if the player died),
  // clamped so it never shows outside the world.
  _updateCamera() {
    let fx;
    let fy;
    const p = this.units.find((u) => u.isPlayer && u.alive);
    if (p) {
      fx = p.x; fy = p.y;
    } else {
      const blues = this.units.filter((u) => u.team === "blue" && u.alive);
      if (blues.length) {
        fx = blues.reduce((s, u) => s + u.x, 0) / blues.length;
        fy = blues.reduce((s, u) => s + u.y, 0) / blues.length;
      } else {
        fx = this.cam.x + CONFIG.width / 2; fy = this.cam.y + CONFIG.height / 2;
      }
    }
    this.cam.x = V.clamp(fx - CONFIG.width / 2, 0, CONFIG.world.width - CONFIG.width);
    this.cam.y = V.clamp(fy - CONFIG.height / 2, 0, CONFIG.world.height - CONFIG.height);
  }

  // The fort belonging to the opposing team (used by the AI to assault it).
  enemyBaseOf(unit) {
    return this.map.bases.find((b) => b.team !== unit.team);
  }

  // Is there a live enemy bomb set close to the player's fort?
  _enemyThreatNearBlueFort() {
    const b = this.map.baseOf("blue");
    const near = b.coreR + 150;
    for (const bo of this.bombs) {
      if (!bo.exploded && bo.owner && bo.owner.team === "red" &&
          V.dist(bo.x, bo.y, b.x, b.y) <= near) return true;
    }
    return false;
  }

  _handlePickups() {
    for (const it of this.items) {
      if (it.dead) continue;
      for (const u of this.units) {
        if (!u.alive) continue;
        if (V.dist(it.x, it.y, u.x, u.y) <= it.radius + u.radius) {
          if (!u.wantsItem(it)) continue; // leave items a unit can't benefit from
          it.applyTo(u);
          it.dead = true;
          break;
        }
      }
    }
  }

  // Called when a bullet breaks a rock: remove it and maybe drop an item.
  shatterRock(rock) {
    this.map.rocks = this.map.rocks.filter((r) => r !== rock);
    this.dropFromRock(rock);
  }

  // Roll for an item drop at a (now destroyed) rock's location.
  dropFromRock(rock) {
    if (Math.random() > CONFIG.rock.dropChance) return;
    const type = ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)];
    this.items.push(new Item(rock.x, rock.y, type));
  }

  _end(win) {
    if (this.over) return; // 終了処理は一度だけ
    this.over = true;
    this.running = false;
    const hasNext = this.stageIndex + 1 < STAGES.length;
    if (this.callbacks.onEnd) this.callbacks.onEnd(win, hasNext, this.stageIndex);
  }

  _syncHud() {
    if (!this.callbacks.onHud) return;
    const p = this.units.find((u) => u.isPlayer);
    this.callbacks.onHud({
      stage: STAGES[this.stageIndex].name,
      blue: this.aliveCount("blue"),
      red: this.aliveCount("red"),
      blueFort: this.map.baseOf("blue").hp / this.map.baseOf("blue").maxHp,
      redFort: this.map.baseOf("red").hp / this.map.baseOf("red").maxHp,
      fortAlert: this.blueFortAlert > 0,
      general: this.generalStatus(this.playerTeam || "blue"),     // 自軍の大将 0健在/1危機/2討死
      enemyGeneral: this.generalStatus(this.playerTeam === "red" ? "blue" : "red"),
      player: p ? {
        alive: p.alive,
        ammo: p.ammo,
        magSize: p.magSizeVal(),
        reloading: p.reloading,
        reloadPct: 1 - p.reloadTimer / p.reloadTimeVal(),
        hp: Math.round(p.hp),
        lockMode: p.lockMode,
        noReload: !!p.weapon().noReload,
        weapon: p.weapon().label,
        weaponKey: p.weaponKey,
        cls: p.cls,
        healing: !!p.healing,
        abilityRemaining: p.abilityRemaining ? p.abilityRemaining(this) : null,
      } : null,
    });
  }

  _render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CONFIG.width, CONFIG.height);
    ctx.save();
    ctx.translate(-Math.round(this.cam.x), -Math.round(this.cam.y));
    this.map.draw(ctx);
    this._drawCapturePoints(ctx);

    // Dead units first (faint markers), then bullets, then live units, then rocks on top.
    for (const u of this.units) {
      if (u.alive) continue;
      if (u.downed) this._drawDowned(ctx, u); else this._drawWreck(ctx, u);
    }
    for (const c of this.chests) c.draw(ctx);
    for (const tr of this.turrets) tr.draw(ctx);
    for (const beast of this.beasts) beast.draw(ctx);
    for (const it of this.items) it.draw(ctx);
    for (const b of this.bullets) b.draw(ctx);
    for (const u of this.units) {
      if (!this.unitVisibleToPlayer(u)) continue;
      u.draw(ctx, this);
      // Mark an enemy that is only visible because they were spotted in a forest.
      if (u.alive && u.team !== this.playerTeam && this.map.inForest(u.x, u.y)) {
        this._drawSpotted(ctx, u);
      }
    }
    this.map.drawSolids(ctx);
    // Smoke clouds over units (so they actually hide what's underneath).
    for (const sm of this.smokes) sm.draw(ctx);
    // Bombs/explosions on top so blasts read clearly over everything.
    for (const b of this.bombs) b.draw(ctx);
    this._drawLockOn(ctx);
    if (typeof Overlay !== "undefined") Overlay.drawNames(ctx, this);
    ctx.restore();
    // Screen-space overlays (outside the camera transform).
    if (typeof Overlay !== "undefined") Overlay.drawMinimap(ctx, this);
  }

  // Neutral / captured control point: a ring + capture progress arc + label.
  _drawCapturePoints(ctx) {
    for (const cp of this.capturePoints) {
      const col = cp.owner === "blue" ? "47,123,255" : cp.owner === "red" ? "255,77,77" : "210,200,150";
      const g = ctx.createRadialGradient(cp.x, cp.y, cp.r * 0.2, cp.x, cp.y, cp.r);
      g.addColorStop(0, `rgba(${col},0.22)`);
      g.addColorStop(1, `rgba(${col},0.03)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cp.x, cp.y, cp.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(${col},0.7)`;
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cp.x, cp.y, cp.r, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      // Capture progress arc while someone is taking it.
      if (cp.capBy && cp.progress > 0) {
        const frac = cp.progress / CONFIG.capture.captureTime;
        const cc = cp.capBy === "blue" ? "#4f9bff" : "#ff5a5a";
        ctx.strokeStyle = cc;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(cp.x, cp.y, cp.r - 6, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
        ctx.stroke();
      }
      // Flag pole.
      ctx.fillStyle = `rgba(${col},0.95)`;
      ctx.fillRect(cp.x - 2, cp.y - 26, 4, 26);
      ctx.fillRect(cp.x + 2, cp.y - 26, 18, 12);
      ctx.fillStyle = "#10141c";
      ctx.font = "bold 12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(cp.owner ? "確保" : "拠点", cp.x, cp.y + 4);
      ctx.textAlign = "left";
    }
  }

  // Reticle over the player's locked-on target.
  _drawLockOn(ctx) {
    const player = this.units.find((u) => u.isPlayer && u.alive);
    // ロックオン中だけレティクル＋線を表示（スマホは攻撃スティック式なので出さない）。
    if (!player || !player.lockMode) return;
    const t = player.lockTarget;
    if (!t || !t.alive || !this.unitVisibleToPlayer(t)) return;
    const r = t.radius + 8;
    ctx.strokeStyle = "#ffe14a";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
    ctx.stroke();
    // Corner ticks.
    ctx.beginPath();
    for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      ctx.moveTo(t.x + Math.cos(a) * (r - 4), t.y + Math.sin(a) * (r - 4));
      ctx.lineTo(t.x + Math.cos(a) * (r + 5), t.y + Math.sin(a) * (r + 5));
    }
    ctx.stroke();
    // Aim line from player to target.
    ctx.strokeStyle = "rgba(255,225,74,0.35)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    ctx.lineTo(t.x, t.y);
    ctx.stroke();
  }

  // Enemies the player can currently see (used for lock-on).
  visibleEnemiesOf(unit) {
    return this.units.filter((u) =>
      u.alive && u.team !== unit.team && this.unitVisibleToPlayer(u));
  }

  nearestVisibleEnemy(unit) {
    let best = null;
    let bestD = Infinity;
    for (const e of this.visibleEnemiesOf(unit)) {
      const d = V.dist(unit.x, unit.y, e.x, e.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  // Cycle to the next visible enemy after `current` (by distance order).
  nextVisibleEnemy(unit, current) {
    const list = this.visibleEnemiesOf(unit)
      .sort((a, b) => V.dist(unit.x, unit.y, a.x, a.y) - V.dist(unit.x, unit.y, b.x, b.y));
    if (list.length === 0) return null;
    const i = list.indexOf(current);
    return list[(i + 1) % list.length];
  }

  // "!" alert over a forest-hidden enemy the moment they're spotted.
  _drawSpotted(ctx, u) {
    const x = u.x;
    const y = u.y - u.radius - 20;
    ctx.fillStyle = "#ffd24a";
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 3;
    ctx.font = "bold 16px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeText("!", x, y);
    ctx.fillText("!", x, y);
    ctx.textAlign = "left";
  }

  // A downed (incapacitated) unit: a fallen body + pulsing SOS marker.
  _drawDowned(ctx, u) {
    const col = u.team === "blue" ? "#2f7bff" : "#ff4d4d";
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "#2a2f3a";
    ctx.beginPath();
    ctx.ellipse(u.x, u.y, u.radius * 1.1, u.radius * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(u.x, u.y, u.radius * 1.1, u.radius * 0.7, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
    // Pulsing SOS bubble + 倒れた人の名前（誰を助けたいか分かるように）。
    const pulse = 0.6 + 0.4 * Math.sin(Date.now() * 0.008);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    if (u.name) {
      ctx.globalAlpha = 1;
      ctx.font = "bold 12px system-ui, sans-serif";
      ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,0.75)";
      ctx.fillStyle = col; // チーム色で誰かを明示
      ctx.strokeText(u.name, u.x, u.y - u.radius - 28);
      ctx.fillText(u.name, u.x, u.y - u.radius - 28);
    }
    ctx.globalAlpha = pulse;
    ctx.fillStyle = "#ffd24a";
    ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = 3;
    ctx.font = "bold 15px system-ui, sans-serif";
    ctx.strokeText("SOS", u.x, u.y - u.radius - 12);
    ctx.fillText("SOS", u.x, u.y - u.radius - 12);
    ctx.textAlign = "left";
    ctx.globalAlpha = 1;
  }

  _drawWreck(ctx, u) {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#2a2a2a";
    ctx.beginPath();
    ctx.arc(u.x, u.y, u.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = u.team === "blue" ? "#2f7bff" : "#ff4d4d";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(u.x - 7, u.y - 7); ctx.lineTo(u.x + 7, u.y + 7);
    ctx.moveTo(u.x + 7, u.y - 7); ctx.lineTo(u.x - 7, u.y + 7);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

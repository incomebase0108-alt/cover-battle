// "Brainy" AI used by every non-player unit (allies and enemies).
//
// The controller runs a small finite-state model each frame. `desiredState`
// inspects the world (HP, ammo, nearby enemies, line-of-sight) and returns one
// of the STATE.* labels below; `update` then dispatches to the matching
// behaviour. Most of the decision logic lives in small pure-ish helper methods
// (nearestForest, nearestCover, shouldRetreat, desiredState, ...) so it can be
// unit-tested without running a full game loop.
//
// State overview:
//   RETREAT  low HP -> fall back to the home fort to heal, dodging via cover.
//   HIDE     healthy but exposed -> slip into the nearest forest to ambush.
//   ENGAGE   trade fire while keeping range / strafing; peek from cover.
//   COVER    pressured (reloading / low ammo / no LOS while exposed) -> put a
//            rock or mountain between self and the enemy.
//   ASSAULT  push the enemy fort (assaulters only, when healthy & unpressured).
//   ADVANCE  no target visible but pressing toward the enemy half.
//   WANDER   nothing to do; drift toward the enemy side so fights start.
const STATE = {
  RETREAT: "RETREAT",
  HIDE: "HIDE",
  ENGAGE: "ENGAGE",
  COVER: "COVER",
  ASSAULT: "ASSAULT",
  ADVANCE: "ADVANCE",
  WANDER: "WANDER",
  GUARD: "GUARD", // defender role: hold near the home fort and intercept
};

// Squad roles assigned per unit so a team fights with a plan, not as a blob.
const ROLES = ["DEFENDER", "ATTACKER", "FLANKER", "ATTACKER", "DEFENDER", "ATTACKER", "FLANKER"];

// HP thresholds expressed as a fraction of CONFIG.unit.maxHp.
const RETREAT_HP_FRAC = 0.4; // drop below this -> break off and heal
const RECOVER_HP_FRAC = 0.8; // climb above this while retreating -> rejoin

class AIController {
  constructor() {
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.strafeTimer = V.randRange(600, 1400);
    this.repathTimer = 0;
    this.wanderAngle = Math.random() * Math.PI * 2;
    // ~40% of units are "assaulters" that push the enemy fort when not pinned
    // by a nearby foe — this makes the destroy-the-fort condition a real threat.
    this.assaulter = Math.random() < 0.4;
    // Sticky retreat flag: once we commit to healing we keep retreating until
    // HP recovers past RECOVER_HP_FRAC (hysteresis avoids dithering at 40%).
    this.retreating = false;
    this.state = STATE.WANDER;
    // Anti-stuck: if a unit stops making progress it briefly walks a random way
    // so a wedged bot can never stall the whole match.
    this.lastX = null;
    this.lastY = null;
    this.stuckMs = 0;
    this.unstickMs = 0;
    this.unstickAng = 0;
    // Throttle weapon switching so bots don't thrash (each switch reloads).
    this.weaponTimer = 0;
    // --- difficulty model (driven by self.aiSkill 0..1) ---------------------
    // A local clock accumulated from dt (works in tests, which step dt by hand,
    // and on the LAN server). aimSince marks when the current target was first
    // acquired (reaction delay); lastFireMs throttles bursts so weak AI fires in
    // slow, dodgeable bursts rather than a constant beam.
    this.clock = 0;
    this.aimSince = 0;
    this.lastTarget = null;
    this.lastFireMs = -1e9;
  }

  // The skill coefficient that governs this unit's shooting (0 = weak, 1 =
  // strong). Falls back to the legacy `skill` when aiSkill isn't set (tests).
  aiSkillOf(self) {
    return (self.aiSkill != null) ? self.aiSkill : self.skill;
  }

  // Distance at which the AI is willing to open fire. Weaker AI must close in
  // before it starts shooting (so it's less of a long-range hitscan threat).
  engageRange(self) {
    const sk = this.aiSkillOf(self);
    return CONFIG.unit.range * (0.6 + 0.4 * sk);
  }

  // Centralised AI trigger. Applies the difficulty model on top of the weapon's
  // own fire cooldown:
  //   • reaction delay  — hold fire for a beat after acquiring a target
  //   • burst & rest    — enforce a minimum gap between AI shots
  //   • aim error       — bend each shot by a skill/distance based random offset
  // Returns true when a round was actually loosed. Every shooting state routes
  // through here so the chosen difficulty is felt everywhere.
  aiTryShoot(self, game, target) {
    if (self.reloading || self.ammo <= 0 || self.cooldown > 0) return false;
    const sk = this.aiSkillOf(self);
    // Reset the reaction timer whenever the engaged target changes.
    if (target !== this.lastTarget) { this.lastTarget = target; this.aimSince = this.clock; }
    const reactionMs = 150 + (1 - sk) * 450;
    if (this.clock - this.aimSince < reactionMs) return false;
    const fireGap = 180 + (1 - sk) * 420;
    if (this.clock - this.lastFireMs < fireGap) return false;
    if (target) {
      const dist = V.dist(self.x, self.y, target.x, target.y);
      const aimError = (1 - sk) * 0.28 + (dist / 2000) * (1 - sk);
      self.aim += (Math.random() * 2 - 1) * aimError;
    }
    self.tryShoot(game);
    this.lastFireMs = this.clock;
    return true;
  }

  // 合戦版：各兵は自分の職分（クラス）の武器を持ち続ける。刀/弓/鉄砲はクラス固定で、
  // 距離に応じた持ち替えはしない（足軽が弓を持つ等を防ぐ）。宝箱で拾った特殊武器
  // (self.special) はその効果が切れるまで優先され、切れれば baseWeaponKey に戻る。
  pickWeapon(self, dist, dt) {
    return;
  }

  // Nearest item this unit would actually benefit from, within `range`.
  nearestWantedItem(self, game, range) {
    if (!game.items) return null;
    let best = null;
    let bestD = range;
    for (const it of game.items) {
      if (it.dead || !self.wantsItem(it)) continue;
      const d = V.dist(self.x, self.y, it.x, it.y);
      if (d < bestD) { bestD = d; best = it; }
    }
    return best;
  }

  // ---- team tactics -------------------------------------------------------

  // Assign a squad role once, based on the unit's slot within its team so each
  // side fields a mix of defenders / attackers / flankers.
  assignRole(self, game) {
    if (self._role) return self._role;
    const mates = game.units.filter((u) => u.team === self.team);
    const idx = Math.max(0, mates.indexOf(self));
    self._role = ROLES[idx % ROLES.length];
    return self._role;
  }

  // The team's overall plan, from fort health and head-count. DEFEND when our
  // fort is hurting/threatened, PUSH when we're ahead, else BALANCED.
  teamStance(team, game) {
    const own = game.map.baseOf(team);
    const foe = game.enemyBaseOf({ team });
    const ownFrac = own.hp / own.maxHp;
    const foeFrac = foe.hp / foe.maxHp;
    const allies = game.units.filter((u) => u.alive && u.team === team).length;
    const enemies = game.units.filter((u) => u.alive && u.team !== team).length;
    const threatened = team === "blue" && game.blueFortAlert > 0;
    if (ownFrac < 0.45 || threatened) return "DEFEND";
    if (foeFrac < ownFrac - 0.05 || allies > enemies + 1) return "PUSH";
    return "BALANCED";
  }

  // High-stage coordination: the squad concentrates fire on one enemy (the
  // weakest one it can see), so late stages feel like the enemy "has a plan".
  // Returns a shared focus target, or null. Only kicks in from stage 7+.
  teamFocus(self, game) {
    if ((game.stageIndex || 0) < 6) return null;
    let best = null;
    let bestHp = Infinity;
    for (const u of game.units) {
      if (!u.alive || u.team === self.team) continue;
      const d = V.dist(self.x, self.y, u.x, u.y);
      if (d > CONFIG.unit.range) continue;
      if (game.map.inForest(u.x, u.y) && d > CONFIG.forestDetectRange) continue;
      if (u.hp < bestHp) { bestHp = u.hp; best = u; }
    }
    return best;
  }

  // Nearest downed teammate not already being carried, within `range`.
  nearestDowned(self, game, range) {
    let best = null;
    let bd = range;
    for (const u of game.units) {
      if (!u.downed || u.carrier || u.team !== self.team) continue;
      const d = V.dist(self.x, self.y, u.x, u.y);
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  }

  // Nearest standing enemy gate within `range` (center distance), or null.
  nearestEnemyGate(self, game, range) {
    if (!game.map.gates) return null;
    let best = null;
    let bd = range;
    for (const g of game.map.gates) {
      if (g.hp <= 0 || g.team === self.team) continue;
      const d = V.dist(self.x, self.y, g.x + g.w / 2, g.y + g.h / 2);
      if (d < bd) { bd = d; best = g; }
    }
    return best;
  }

  // Nearest living wild beast within `range`, or null.
  nearestBeast(self, game, range) {
    if (!game.beasts) return null;
    let best = null;
    let bd = range;
    for (const b of game.beasts) {
      if (b.dead || b.team === self.team) continue; // ignore our own tamed beasts
      const d = V.dist(self.x, self.y, b.x, b.y);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  // 動物使いAI: 最も近い「野生(未捕獲)」動物へ向かい、射程に入ったら捕獲する。
  // 捕獲枠が空いていて野生動物がいる限り、戦闘より優先して動く。返り値=この
  // フレームの行動を引き受けたか。
  huntBeastAsTamer(self, game) {
    const cls = (typeof getClass === "function") ? getClass(self.cls) : null;
    if (!cls || cls.ability !== "capture") return false;
    if (self.abilityRemaining && self.abilityRemaining(game) <= 0) return false; // 上限まで捕獲済み
    let best = null;
    let bd = 900; // 広めに索敵して率先して向かう
    for (const b of (game.beasts || [])) {
      if (b.dead || b.team) continue; // 野生のみが対象
      const d = V.dist(self.x, self.y, b.x, b.y);
      if (d < bd) { bd = d; best = b; }
    }
    if (!best) return false;
    this.aimAt(self, best.x, best.y);
    if (bd <= ABILITY.captureRange - 10) {
      self.useAbility(game); // 射程内：捕獲（クマ/トラを仲間に）
    } else {
      this.moveTo(self, best.x, best.y, game); // まだ遠い：近づく
    }
    return true;
  }

  // Nearest living enemy within `range` of a point (for fort defence).
  nearestEnemyNear(self, game, x, y, range) {
    let best = null;
    let bestD = range;
    for (const u of game.units) {
      if (!u.alive || u.team === self.team) continue;
      const d = V.dist(x, y, u.x, u.y);
      if (d < bestD) { bestD = d; best = u; }
    }
    return best;
  }

  // GUARD behaviour: intercept intruders near the home fort, else hold a ring
  // between the fort and the battlefield, facing the enemy side.
  doGuard(self, dt, game) {
    const home = game.map.baseOf(self.team);
    const intruder = this.nearestEnemyNear(self, game, home.x, home.y, home.r + 260);
    if (intruder) return this.doEngage(self, dt, game, intruder);
    // Hold a guard post on the enemy-facing side of the fort.
    const toCenter = Math.atan2(CONFIG.world.height / 2 - home.y, CONFIG.world.width / 2 - home.x);
    const gx = home.x + Math.cos(toCenter) * (home.r + 70);
    const gy = home.y + Math.sin(toCenter) * (home.r + 70);
    if (V.dist(self.x, self.y, gx, gy) > 30) this.moveTo(self, gx, gy, game);
    self.aim = toCenter;
  }

  // ---- decision helpers (kept side-effect free for testing) ---------------

  // HP fraction of max.
  hpFrac(self) {
    return self.hp / CONFIG.unit.maxHp;
  }

  // Should this unit prioritise self-preservation (fall back to heal)? Sticky:
  // returns true from when HP first dips below RETREAT_HP_FRAC until it climbs
  // back above RECOVER_HP_FRAC. Pure given the persistent `retreating` flag.
  shouldRetreat(self) {
    const frac = this.hpFrac(self);
    if (frac < RETREAT_HP_FRAC) this.retreating = true;
    else if (frac >= RECOVER_HP_FRAC) this.retreating = false;
    return this.retreating;
  }

  // True once HP has recovered enough to return to the front.
  healedEnough(self) {
    return this.hpFrac(self) >= RECOVER_HP_FRAC;
  }

  // True when the unit can't meaningfully fight right now: mid-reload or only a
  // couple of rounds left. Such a unit should seek cover rather than push.
  isPressured(self) {
    if (self.reloading) return true;
    const mag = self.magSizeVal ? self.magSizeVal() : CONFIG.unit.magSize;
    return self.ammo <= Math.max(1, Math.ceil(mag * 0.2));
  }

  // The unit's own home fort ({x,y,r,coreR,hp,...}).
  homeBase(self, game) {
    return game.map.baseOf(self.team);
  }

  // 最寄りの回復地点を返す。自陣の砦だけでなく、自軍が確保した制圧点や中立オアシス
  // も体力が回復するので、いちばん近い回復ポイントへ退避できるようにする。
  nearestHealZone(self, game) {
    const base = this.homeBase(self, game);
    let best = base ? { x: base.x, y: base.y } : null;
    let bd = best ? V.dist(self.x, self.y, best.x, best.y) : Infinity;
    for (const cp of (game.capturePoints || [])) {
      if (cp.owner !== self.team) continue; // 自軍が確保した拠点のみ回復できる
      const d = V.dist(self.x, self.y, cp.x, cp.y);
      if (d < bd) { bd = d; best = { x: cp.x, y: cp.y }; }
    }
    if (game.map.oases) {
      for (const o of game.map.oases) {
        const d = V.dist(self.x, self.y, o.x, o.y);
        if (d < bd) { bd = d; best = { x: o.x, y: o.y }; }
      }
    }
    return best;
  }

  // Nearest forest circle ({x,y,r}) to a point, or null if there are none.
  nearestForest(self, game, fromX, fromY) {
    const px = fromX == null ? self.x : fromX;
    const py = fromY == null ? self.y : fromY;
    let best = null;
    let bestDist = Infinity;
    for (const f of game.map.forests) {
      const d = V.dist(px, py, f.x, f.y);
      if (d < bestDist) { bestDist = d; best = f; }
    }
    return best;
  }

  // Nearest destructible rock (legacy helper, retained for low-HP cover dives).
  nearestRock(self, game) {
    let best = null;
    let bestDist = Infinity;
    for (const rock of game.map.rocks) {
      const d = V.dist(self.x, self.y, rock.x, rock.y);
      if (d < bestDist) { bestDist = d; best = rock; }
    }
    return best;
  }

  // The solid obstacle (rock or mountain) that best serves as cover between the
  // unit and `target`: i.e. one that is roughly on the line to the target and
  // not too far away. Returns the obstacle or null. Used to choose a peek spot.
  nearestCover(self, target, game) {
    if (!target) return null;
    const tAngle = Math.atan2(target.y - self.y, target.x - self.x);
    let best = null;
    let bestScore = Infinity;
    for (const o of game.map.solids()) {
      const d = V.dist(self.x, self.y, o.x, o.y);
      // Ignore cover that's further than the enemy (it won't shield us).
      const dToTarget = V.dist(self.x, self.y, target.x, target.y);
      if (d > dToTarget + o.r) continue;
      const oAngle = Math.atan2(o.y - self.y, o.x - self.x);
      let diff = Math.abs(oAngle - tAngle);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      // Prefer obstacles closely aligned with the enemy and nearby. Reject ones
      // way off the firing line (more than ~50deg).
      if (diff > 0.9) continue;
      const score = d + diff * 200;
      if (score < bestScore) { bestScore = score; best = o; }
    }
    return best;
  }

  // A point just behind `cover` relative to `target`, where the cover blocks the
  // enemy's line of fire. The unit moves toward this to break LOS / peek.
  coverSpot(self, cover, target) {
    // Direction from the target to the cover; stand a bit past the cover on
    // that side so the obstacle sits between us and the enemy.
    const ang = Math.atan2(cover.y - target.y, cover.x - target.x);
    const off = cover.r + self.radius + 6;
    return { x: cover.x + Math.cos(ang) * off, y: cover.y + Math.sin(ang) * off };
  }

  // Count living enemies currently visible to `self` (respecting forest stealth
  // and line of sight). Used to judge whether a fight is favourable.
  countVisibleEnemies(self, game) {
    let n = 0;
    for (const u of game.units) {
      if (!u.alive || u.team === self.team) continue;
      const d = V.dist(self.x, self.y, u.x, u.y);
      if (game.map.inForest(u.x, u.y) && d > CONFIG.forestDetectRange) continue;
      n++;
    }
    return n;
  }

  // Count friendly living units near `self` (within `range`), excluding self.
  countNearbyAllies(self, game, range) {
    let n = 0;
    for (const u of game.units) {
      if (!u.alive || u === self || u.team !== self.team) continue;
      if (V.dist(self.x, self.y, u.x, u.y) <= range) n++;
    }
    return n;
  }

  // The high-level decision. Returns a STATE.* label. Pure aside from the
  // sticky retreat flag updated via shouldRetreat.
  desiredState(self, game) {
    const target = this.findTarget(self, game);

    // 1.命を大事に: low HP always wins — break off and heal.
    if (this.shouldRetreat(self)) return STATE.RETREAT;

    // No enemy in sight: assault the fort, otherwise advance/wander.
    if (!target) {
      if (this.assaulter) {
        const fort = game.enemyBaseOf(self);
        if (fort && fort.hp > 0) return STATE.ASSAULT;
      }
      return STATE.WANDER;
    }

    const d = V.dist(self.x, self.y, target.x, target.y);
    const hasLOS = !game.map.blockedBetween(self.x, self.y, target.x, target.y);
    const pressured = this.isPressured(self);

    // 3. リロード/残弾管理: can't shoot well -> get behind cover.
    if (pressured) return STATE.COVER;

    // Assaulters keep pushing the fort while healthy and not pinned up close.
    if (this.assaulter && d > 240) {
      const fort = game.enemyBaseOf(self);
      if (fort && fort.hp > 0) return STATE.ASSAULT;
    }

    // 慎重さ：森への伏撃(HIDE)は「FLANKER役」だけが使う戦術に限定した（後段の役割分岐）。
    // 以前はスキルが高いほど HIDE/COVER を選び、結果『強い設定ほど戦わない』不具合があった
    // ため、スキル依存の消極化を撤廃。COVER は「手負い」かつ「明確な数的不利」のときだけ。
    if (hasLOS && !game.map.inForest(self.x, self.y)) {
      const enemies = this.countVisibleEnemies(self, game);
      const allies = this.countNearbyAllies(self, game, 260);
      const outnumbered = enemies > allies + 1;
      const cautious = this.hpFrac(self) < 0.55; // スキルではなくHPで判断（健康なら前へ）
      if (outnumbered && cautious) {
        if (this.nearestCover(self, target, game)) return STATE.COVER;
      }
    }

    return STATE.ENGAGE;
  }

  // ---- main loop ----------------------------------------------------------

  update(self, dt, game) {
    this.clock += dt; // advance the local clock (reaction delay + fire-gap timing)
    // Progress made since last frame (used for anti-stuck below).
    const prog = this.lastX === null ? 99 : V.dist(self.x, self.y, this.lastX, this.lastY);
    this.lastX = self.x;
    this.lastY = self.y;

    // If currently unsticking, keep walking the random escape heading.
    if (this.unstickMs > 0) {
      this.unstickMs -= dt;
      self.move(Math.cos(this.unstickAng), Math.sin(this.unstickAng), game);
      return;
    }

    // Rescue: once carrying a downed ally, head straight home; otherwise, when
    // safe, go pick up a nearby downed teammate.
    if (self.carrying) {
      const home = game.map.baseOf(self.team);
      this.moveTo(self, home.x, home.y, game);
      const t = this.findTarget(self, game);
      if (t && !game.map.blockedBetween(self.x, self.y, t.x, t.y) &&
          V.dist(self.x, self.y, t.x, t.y) <= this.engageRange(self)) {
        this.aimAt(self, t.x, t.y); this.aiTryShoot(self, game, t);
      }
      return;
    }
    // 軍師（後方支援）：再起不能(ダウン)の味方がいれば近づいて『蘇生』する。運搬ではなく
    // その場復活が主務。対象がいなければ後段で自陣付近に留まる（基本戦わない）。
    if (self.cls === "gunshi" && !this.shouldRetreat(self)) {
      const downed = this.nearestDowned(self, game, 1200);
      if (downed) {
        const dd = V.dist(self.x, self.y, downed.x, downed.y);
        if (dd <= ABILITY.reviveRange - 12) {
          if (self.abilityCd <= 0) self.useAbility(game); // 蘇生（CD中は近くで待機）
        } else {
          this.moveTo(self, downed.x, downed.y, game);
        }
        // 近づく途中で敵が至近なら最低限の応戦。
        const t = this.findTarget(self, game);
        if (t && V.dist(self.x, self.y, t.x, t.y) < 170 &&
            !game.map.blockedBetween(self.x, self.y, t.x, t.y)) {
          this.aimAt(self, t.x, t.y); this.aiTryShoot(self, game, t);
        }
        return;
      }
    }
    if (!this.shouldRetreat(self)) {
      // 大将ルール：自軍の総大将が倒れていたら、距離を問わず最優先で救出に向かう
      // （味方みんなで大将を守る）。回復ゾーン無効＋士気低下を解除する唯一の手段。
      const gen = (game.generalOf && game.generalOf(self.team)) || null;
      if (gen && gen.downed && !gen.carrier && gen !== self) {
        this.moveTo(self, gen.x, gen.y, game); return;
      }
      const d = this.nearestDowned(self, game, 430);
      if (d) { this.moveTo(self, d.x, d.y, game); return; }
    }

    // 動物使い(総大将)は野武士を捕獲しに行くが、近くに交戦可能な敵がいる時は戦闘を優先。
    // （以前は敵がいても捕獲へ向かい『戦わない』一因になっていた）。
    {
      const foe = this.findTarget(self, game);
      const foeClose = foe && V.dist(self.x, self.y, foe.x, foe.y) < 360;
      if (!this.shouldRetreat(self) && !foeClose && this.huntBeastAsTamer(self, game)) return;
    }

    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeDir *= -1;
      this.strafeTimer = V.randRange(600, 1400);
    }

    let target = this.findTarget(self, game);
    if (target) this.pickWeapon(self, V.dist(self.x, self.y, target.x, target.y), dt);
    // High stages: concentrate fire on the squad's shared focus target.
    const focus = this.teamFocus(self, game);
    if (focus) target = focus;

    // Use the class ability situationally.
    if (self.abilityCd <= 0 && typeof getClass === "function") {
      const cls = getClass(self.cls);
      if (cls && cls.ability && target) {
        const d = V.dist(self.x, self.y, target.x, target.y);
        if (cls.ability === "turret" && d < CONFIG.unit.range && Math.random() < 0.012) self.useAbility(game);
        else if (cls.ability === "smoke" && d < 280 && Math.random() < 0.02) self.useAbility(game);
        else if (cls.ability === "dash" && (d > 280 || this.shouldRetreat(self)) && Math.random() < 0.03) self.useAbility(game);
        else if (cls.ability === "fastreload" && self.reloading && Math.random() < 0.06) self.useAbility(game); // 早合：装填中に即完了
        // 軍師の蘇生は update 前段の専用処理（ダウン味方へ接近して復活）で発動する。
      }
    }

    // Break an enemy gate that's blocking the way to our objective.
    if (target) {
      const gate = this.nearestEnemyGate(self, game, 175);
      if (gate) {
        const gx = gate.x + gate.w / 2;
        const gy = gate.y + gate.h / 2;
        const ag = Math.atan2(gy - self.y, gx - self.x);
        const at = Math.atan2(target.y - self.y, target.x - self.x);
        let diff = Math.abs(ag - at);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (diff < 0.8 || V.dist(self.x, self.y, gx, gy) < 95) {
          this.aimAt(self, gx, gy);
          this.aiTryShoot(self, game, gate);
          this.moveTo(self, gx, gy, game);
          return;
        }
      }
    }

    // Self-defence: a nearby wild beast is an immediate threat — shoot it and
    // back off if it's right on top of us.
    const beast = this.nearestBeast(self, game, 200);
    if (beast && !this.shouldRetreat(self)) {
      this.aimAt(self, beast.x, beast.y);
      if (V.dist(self.x, self.y, beast.x, beast.y) < 90) {
        this.moveTo(self, self.x + (self.x - beast.x), self.y + (self.y - beast.y), game);
      }
      this.aiTryShoot(self, game, beast);
      return;
    }

    let state = this.desiredState(self, game);
    // 軍師は支援役：倒れると味方の強化(采配/aura)が消えるため前線に突っ込ませない。
    // 敵が近い時だけ応戦し、基本は自陣付近で守って采配を撒く。
    if (self.cls === "gunshi" && !this.shouldRetreat(self)) {
      const foe = target ? V.dist(self.x, self.y, target.x, target.y) : Infinity;
      state = foe < 230 ? STATE.ENGAGE : STATE.GUARD;
    }
    // Anti-stall: when the match has gone quiet too long, everyone charges the
    // enemy fort so it always reaches a conclusion (unless badly hurt).
    if (game.rushMode && !this.shouldRetreat(self)) {
      const fort = game.enemyBaseOf(self);
      if (fort && fort.hp > 0) state = STATE.ASSAULT;
    }

    // Squad tactics: bias behaviour by role + the team's current plan (skipped
    // while retreating or rushing, which take priority).
    if (!game.rushMode && !this.shouldRetreat(self)) {
      const role = this.assignRole(self, game);
      const stance = this.teamStance(self.team, game);
      const home = game.map.baseOf(self.team);
      const dTgt = target ? V.dist(self.x, self.y, target.x, target.y) : Infinity;
      if (role === "DEFENDER" && stance !== "PUSH") {
        const intruder = this.nearestEnemyNear(self, game, home.x, home.y, home.r + 260);
        // Intercept a threat to home; otherwise return only when not busy fighting.
        if (intruder) state = STATE.GUARD;
        else if (!target && V.dist(self.x, self.y, home.x, home.y) > home.r + 200) {
          state = STATE.GUARD;
        }
      } else if (role === "FLANKER" && stance !== "DEFEND" && dTgt > 220 &&
                 (state === STATE.ENGAGE || state === STATE.WANDER)) {
        const forest = this.nearestForest(self, game);
        if (forest && !game.map.inForest(self.x, self.y)) state = STATE.HIDE;
      } else if (role === "ATTACKER" && stance === "PUSH") {
        const fort = game.enemyBaseOf(self);
        if (fort && fort.hp > 0 &&
            (!target || V.dist(self.x, self.y, target.x, target.y) > 260)) {
          state = STATE.ASSAULT;
        }
      }
    }
    this.state = state;

    // Anti-stuck: while travelling (not deliberately holding or healing at base),
    // a unit that has barely moved for a moment breaks free so it can never wedge
    // and stall the match when the player isn't around.
    // 交戦中(ENGAGE)でも相手が遠い（＝本来は近づこうと動いているはず）なら対象に含める：
    // 以前は ENGAGE が対象外で、岩や城壁に押し付けられたまま固まるケースが残っていた。
    const engagedButFar = state === STATE.ENGAGE && target &&
      V.dist(self.x, self.y, target.x, target.y) > 220;
    const travelling = state === STATE.RETREAT || state === STATE.ADVANCE ||
      state === STATE.ASSAULT || state === STATE.WANDER || state === STATE.HIDE ||
      state === STATE.GUARD || engagedButFar;
    if (travelling && !game.map.inBase(self.x, self.y, self.team)) {
      if (prog < 0.35) this.stuckMs += dt; else this.stuckMs = 0;
      if (this.stuckMs > 650) {
        // 脱出方向はランダムではなく「実際に進める方向」から選ぶ：8方向を試し、
        // 一番遠くまで動けた向きへ歩く（ランダムだと壁に向き直してまたハマっていた）。
        let bestA = Math.random() * Math.PI * 2;
        let bestM = -1;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + Math.random() * 0.4;
          const probe = 46; // 試しに進む距離
          const c = game.map.resolveCollision(
            self.x + Math.cos(a) * probe, self.y + Math.sin(a) * probe,
            self.radius, self.canClimb, self.team);
          const m = V.dist(self.x, self.y, c.x, c.y);
          if (m > bestM) { bestM = m; bestA = a; }
        }
        this.unstickMs = 800;
        this.unstickAng = bestA;
        this.stuckMs = 0;
        self.move(Math.cos(this.unstickAng), Math.sin(this.unstickAng), game);
        return;
      }
    } else {
      this.stuckMs = 0;
    }

    // Opportunistic item grab when not locked in a close fight.
    if (state === STATE.ENGAGE || state === STATE.WANDER || state === STATE.HIDE) {
      const item = this.nearestWantedItem(self, game, 240);
      const dTarget = target ? V.dist(self.x, self.y, target.x, target.y) : Infinity;
      if (item && dTarget > 180) {
        this.moveTo(self, item.x, item.y, game);
        if (target) {
          this.aimAt(self, target.x, target.y);
          if (!game.map.blockedBetween(self.x, self.y, target.x, target.y) &&
              V.dist(self.x, self.y, target.x, target.y) <= this.engageRange(self)) {
            this.aiTryShoot(self, game, target);
          }
        }
        return;
      }
    }

    switch (state) {
      case STATE.RETREAT: return this.doRetreat(self, dt, game, target);
      case STATE.HIDE:    return this.doHide(self, dt, game, target);
      case STATE.COVER:   return this.doCover(self, dt, game, target);
      case STATE.ASSAULT: {
        const fort = game.enemyBaseOf(self);
        if (fort && fort.hp > 0) return this.assaultFort(self, dt, game, fort);
        return this.wander(self, dt, game);
      }
      case STATE.ENGAGE:  return this.doEngage(self, dt, game, target);
      case STATE.GUARD:   return this.doGuard(self, dt, game);
      case STATE.WANDER:
      default:
        if (target) return this.doAdvance(self, dt, game, target);
        return this.wander(self, dt, game);
    }
  }

  // Aim straight at a point. Tracking is precise; the miss-chance now lives in
  // aiTryShoot, which bends each individual shot by a skill/distance aim error
  // (so between shots the unit faces its target cleanly).
  aimAt(self, x, y) {
    const baseAngle = Math.atan2(y - self.y, x - self.x);
    self.aim = baseAngle;
    return baseAngle;
  }

  moveTo(self, x, y, game, scaleX, scaleY) {
    const mx = (x - self.x);
    const my = (y - self.y);
    const len = Math.hypot(mx, my) || 1;
    self.move((mx / len) * (scaleX == null ? 1 : scaleX),
              (my / len) * (scaleY == null ? 1 : scaleY), game);
  }

  // RETREAT: head for the home fort to heal. Prefer routing via cover/forest so
  // we don't eat fire on the way. Keep facing (and discouraging) any chaser but
  // do not advance on them.
  doRetreat(self, dt, game, target) {
    // 自陣・確保した制圧点・オアシスのうち最寄りの回復地点へ退避する。
    let dest = this.nearestHealZone(self, game) || { x: self.x, y: self.y };

    // If a forest or solid cover lies roughly between us and home, route through
    // it to break line of sight while falling back.
    if (target) {
      const forest = this.nearestForest(self, game);
      if (forest) {
        const towardHome = V.dist(forest.x, forest.y, dest.x, dest.y) <
                           V.dist(self.x, self.y, dest.x, dest.y);
        const awayFromEnemy = V.dist(forest.x, forest.y, target.x, target.y) >
                              V.dist(self.x, self.y, target.x, target.y);
        if (towardHome && awayFromEnemy && !game.map.inForest(self.x, self.y)) {
          dest = { x: forest.x, y: forest.y };
        }
      }
    }

    // Aim back at the threat so we can return fire if it gets a clean shot, but
    // only actually shoot when we still have LOS and ammo (opportunistic).
    if (target) {
      const d = V.dist(self.x, self.y, target.x, target.y);
      this.aimAt(self, target.x, target.y);
      const hasLOS = !game.map.blockedBetween(self.x, self.y, target.x, target.y);
      if (hasLOS && d <= this.engageRange(self)) this.aiTryShoot(self, game, target);
    }

    this.moveTo(self, dest.x, dest.y, game);
  }

  // HIDE: move into the nearest forest, then ambush. Once inside, behave like
  // ENGAGE (shoot spotted foes) while enjoying concealment.
  doHide(self, dt, game, target) {
    if (game.map.inForest(self.x, self.y)) {
      return this.doEngage(self, dt, game, target);
    }
    const forest = this.nearestForest(self, game);
    if (!forest) return this.doEngage(self, dt, game, target);
    if (target) this.aimAt(self, target.x, target.y);
    this.moveTo(self, forest.x, forest.y, game);
  }

  // COVER: position so a rock/mountain sits between us and the enemy, then peek
  // and shoot when we have a shot. If no cover is found, back off instead.
  doCover(self, dt, game, target) {
    if (!target) return this.wander(self, dt, game);
    const baseAngle = this.aimAt(self, target.x, target.y);
    const cover = this.nearestCover(self, target, game);
    if (cover) {
      const spot = this.coverSpot(self, cover, target);
      this.moveTo(self, spot.x, spot.y, game);
    } else {
      // Nothing to hide behind: retreat away from the enemy.
      self.move(-Math.cos(baseAngle), -Math.sin(baseAngle), game);
    }
    // Only shoot if we actually have a clear line and ammo (true peek & shoot).
    const d = V.dist(self.x, self.y, target.x, target.y);
    const hasLOS = !game.map.blockedBetween(self.x, self.y, target.x, target.y);
    if (hasLOS && d <= this.engageRange(self)) this.aiTryShoot(self, game, target);
  }

  // ENGAGE: hold a comfortable range, strafe, and shoot when on target. Advance
  // when there's no clear shot to find an angle.
  doEngage(self, dt, game, target) {
    if (!target) return this.wander(self, dt, game);
    const d = V.dist(self.x, self.y, target.x, target.y);
    const hasLOS = !game.map.blockedBetween(self.x, self.y, target.x, target.y);
    const baseAngle = this.aimAt(self, target.x, target.y);

    if (hasLOS && d <= CONFIG.unit.range) {
      const preferred = 220;
      let mx = 0;
      let my = 0;

      // Advantage assessment: press when the enemy is reloading or we have the
      // numbers; ease back when outnumbered.
      const allies = this.countNearbyAllies(self, game, 260);
      const enemies = this.countVisibleEnemies(self, game);
      const advantage = (target.reloading ? 1 : 0) + (allies >= enemies ? 1 : 0);

      if (d > preferred + 30) {        // close in
        mx = Math.cos(baseAngle);
        my = Math.sin(baseAngle);
      } else if (d < preferred - 40 && advantage < 1) { // back off when not winning
        mx = -Math.cos(baseAngle);
        my = -Math.sin(baseAngle);
      }
      // Strafe perpendicular to the target.
      mx += Math.cos(baseAngle + Math.PI / 2) * this.strafeDir * 0.7;
      my += Math.sin(baseAngle + Math.PI / 2) * this.strafeDir * 0.7;

      const len = Math.hypot(mx, my);
      if (len > 0) self.move(mx / len, my / len, game);

      // Weaker AI only opens fire once it has closed inside its engage range.
      if (d <= this.engageRange(self)) this.aiTryShoot(self, game, target);
    } else {
      // No clear shot: advance toward the target to find an angle.
      this.moveTo(self, target.x, target.y, game);
    }
  }

  // ADVANCE: a target exists but we're in WANDER fallback — close in.
  doAdvance(self, dt, game, target) {
    this.aimAt(self, target.x, target.y);
    this.moveTo(self, target.x, target.y, game);
  }

  findTarget(self, game) {
    let best = null;
    let bestDist = Infinity;
    for (const u of game.units) {
      if (!u.alive || u.team === self.team) continue;
      const d = V.dist(self.x, self.y, u.x, u.y);
      // Units hiding in a forest or smoke are only spotted up close.
      if ((game.map.inForest(u.x, u.y) || (game.inSmoke && game.inSmoke(u.x, u.y))) &&
          d > CONFIG.forestDetectRange) continue;
      if (d < bestDist) {
        bestDist = d;
        best = u;
      }
    }
    return best;
  }

  // Advance on the enemy fort core and shoot it down.
  assaultFort(self, dt, game, fort) {
    const baseAngle = Math.atan2(fort.y - self.y, fort.x - self.x);
    const d = V.dist(self.x, self.y, fort.x, fort.y);
    const hasLOS = !game.map.blockedBetween(self.x, self.y, fort.x, fort.y);
    self.aim = baseAngle;
    if (hasLOS && d <= CONFIG.unit.range) {
      // Close in; lob a bomb point-blank to crack the fort, otherwise pour fire.
      if (d > fort.coreR + 70) {
        self.move(Math.cos(baseAngle), Math.sin(baseAngle), game);
      } else if (Math.random() < 0.02) {
        // Right next to the fort: drop a bomb, then peel off.
        self.placeBomb(game);
        self.move(-Math.cos(baseAngle), -Math.sin(baseAngle), game);
      } else {
        self.move(-Math.cos(baseAngle), -Math.sin(baseAngle), game); // back off a touch
      }
      this.aiTryShoot(self, game, fort);
    } else {
      self.move(Math.cos(baseAngle), Math.sin(baseAngle), game);
    }
  }

  wander(self, dt, game) {
    this.repathTimer -= dt;
    if (this.repathTimer <= 0) {
      this.wanderAngle += V.randRange(-0.8, 0.8);
      this.repathTimer = V.randRange(500, 1200);
    }
    // Drift toward the enemy half of the map so fights actually start.
    const towardCenter = self.team === "blue" ? 0 : Math.PI;
    const ang = this.wanderAngle * 0.5 + towardCenter * 0.5;
    self.aim = ang;
    self.move(Math.cos(ang), Math.sin(ang), game);
  }
}

// Expose state labels for tests and any future tooling.
AIController.STATE = STATE;

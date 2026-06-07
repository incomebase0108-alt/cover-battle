// 中立の浪人（野武士 / 剣豪）。どのチームにも属さず、近づいた誰にでも斬りかかる。
// 弾で倒せて、倒すとアイテムを落とす。総大将が「説得(capture)」すると仲間になる
// （仲間になると team が付き、味方は襲わない）。元は野生動物(トラ/クマ)だったポジション。
//   nobushi : 野武士 — 数で湧く軽量の浪人。速いが脆い。
//   kengo   : 剣豪   — まれに現れる達人。重く頑丈で一撃が痛い。
const BEAST_TYPES = {
  nobushi: { label: "野武士", hp: 150, radius: 22, speed: 2.6, damage: 16, sense: 260, attackRange: 26, attackCd: 600,
             body: "#6b5e4a", dark: "#2f281d", head: "#caa98a" },
  kengo:   { label: "剣豪",   hp: 300, radius: 26, speed: 2.5, damage: 36, sense: 300, attackRange: 32, attackCd: 820,
             body: "#4a4f5a", dark: "#23262e", head: "#d8c7a8" },
};

// 人型（浪人）のベクター描画。ユニットの回転フレーム内（局所 +X＝前方）で呼ぶこと。
// スプライトが無いときのフォールバック＝足・胴・刀・頭の一体シルエット。
function drawRoninBody(ctx, type, r, flash, walkPhase) {
  const t = BEAST_TYPES[type] || BEAST_TYPES.nobushi;
  const wp = walkPhase || 0;
  const bob = Math.abs(Math.sin(wp)) * r * 0.1;
  ctx.save();
  ctx.translate(bob, 0);
  // 足（左右が逆位相で前後）
  const sw = Math.sin(wp) * r * 0.3;
  ctx.fillStyle = "#241f19";
  ctx.beginPath(); ctx.ellipse(-r * 0.1 + sw, -r * 0.4, r * 0.36, r * 0.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-r * 0.1 - sw,  r * 0.4, r * 0.36, r * 0.2, 0, 0, Math.PI * 2); ctx.fill();
  // 胴（着物/鎧）
  ctx.fillStyle = flash > 0 ? "#ff6a4a" : t.body;
  ctx.beginPath(); ctx.ellipse(0, 0, r * 1.0, r * 0.82, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = t.dark; ctx.lineWidth = 2.5; ctx.stroke();
  // 刀（前方へ構える）：刃＋柄
  ctx.strokeStyle = "#dfe4ec"; ctx.lineWidth = 3; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(r * 0.7, r * 0.08); ctx.lineTo(r * 1.95, -r * 0.16); ctx.stroke();
  ctx.strokeStyle = "#6b4a2a"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(r * 0.42, r * 0.2); ctx.lineTo(r * 0.78, r * 0.06); ctx.stroke();
  ctx.lineCap = "butt";
  // 頭（笠/月代）
  ctx.fillStyle = t.head;
  ctx.beginPath(); ctx.arc(r * 0.12, 0, r * 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = t.dark; ctx.lineWidth = 2; ctx.stroke();
  // 剣豪は赤い鉢巻＋前立てで「達人」感を出す
  if (type === "kengo") {
    ctx.fillStyle = "#c23b2f";
    ctx.fillRect(-r * 0.02, -r * 0.52, r * 0.28, r * 0.12);
    ctx.beginPath(); ctx.moveTo(r * 0.12, -r * 0.5); ctx.lineTo(r * 0.12, -r * 0.95); ctx.lineWidth = 3; ctx.strokeStyle = "#e8c84a"; ctx.stroke();
  }
  ctx.restore();
}

class Beast {
  constructor(x, y, type) {
    this.x = x;
    this.y = y;
    this.type = BEAST_TYPES[type] ? type : "nobushi";
    this.team = null; // neutral — hostile to everyone
    const t = BEAST_TYPES[this.type];
    this.hp = t.hp;
    this.maxHp = t.hp;
    this.radius = t.radius;
    this.speed = t.speed;
    this.damage = t.damage;
    this.sense = t.sense;
    this.attackRange = t.attackRange;
    this.attackCdMax = t.attackCd;
    this.attackCd = 0;
    this.aim = Math.random() * Math.PI * 2;
    this.walkPhase = 0;
    this.flash = 0;       // brief red flash when it lands a hit
    this.wanderAng = Math.random() * Math.PI * 2;
    this.wanderT = 0;
    this.dead = false;
  }

  takeDamage(amount) {
    if (this.dead) return;
    this.hp -= amount;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
  }

  _move(dx, dy, game, scale) {
    const sp = this.speed * (scale == null ? 1 : scale);
    // 仲間になった浪人は自軍の城門を通れるよう team を渡す（中立は null＝全ゲートで阻まれる）。
    const n = game.map.resolveCollision(this.x + dx * sp, this.y + dy * sp, this.radius, false, this.team);
    const moved = V.dist(this.x, this.y, n.x, n.y);
    this.x = n.x;
    this.y = n.y;
    if (moved > 0.05) this.walkPhase += moved * 0.4;
  }

  update(dt, game) {
    if (this.dead) return;
    if (this.attackCd > 0) this.attackCd -= dt;
    if (this.flash > 0) this.flash -= dt;

    // Hunt the nearest living unit within sense range. A neutral ronin (no team)
    // attacks anyone; a recruited ronin attacks only the opposing team.
    let tgt = null;
    let bd = this.sense;
    for (const u of game.units) {
      if (!u.alive) continue;
      if (this.team && u.team === this.team) continue; // don't cut down your own side
      const d = V.dist(this.x, this.y, u.x, u.y);
      if (d < bd) { bd = d; tgt = u; }
    }

    if (!tgt) {
      // 仲間になった浪人は味方として敵の砦へ進軍する。回復できない＝退かず前進あるのみ。
      // 砦に到達したらコアを攻撃して攻城に加わる。
      if (this.team && game.map.bases) {
        const enemyBase = game.map.bases.find((b) => b.team !== this.team);
        if (enemyBase) {
          this.aim = Math.atan2(enemyBase.y - this.y, enemyBase.x - this.x);
          const d = V.dist(this.x, this.y, enemyBase.x, enemyBase.y);
          if (d <= (enemyBase.coreR || 30) + this.attackRange + 12) {
            if (this.attackCd <= 0) {
              enemyBase.hp = Math.max(0, enemyBase.hp - Math.min(this.damage, 12)); // 砦へは控えめダメージ
              this.attackCd = this.attackCdMax;
              this.flash = 140;
              if (game.sound && game.sound.hit) game.sound.hit();
            }
          } else {
            this._move(Math.cos(this.aim), Math.sin(this.aim), game, 1);
          }
          return;
        }
      }
      // 中立の浪人は徘徊する。
      this.wanderT -= dt;
      if (this.wanderT <= 0) { this.wanderAng += V.randRange(-1, 1); this.wanderT = V.randRange(800, 1700); }
      this.aim = this.wanderAng;
      this._move(Math.cos(this.wanderAng), Math.sin(this.wanderAng), game, 0.5);
      return;
    }

    this.aim = Math.atan2(tgt.y - this.y, tgt.x - this.x);
    if (bd <= this.attackRange + tgt.radius) {
      if (this.attackCd <= 0) {
        tgt.takeDamage(this.damage);
        this.attackCd = this.attackCdMax;
        this.flash = 140;
        if (game.sound && game.sound.hit) game.sound.hit();
      }
    } else {
      this._move(Math.cos(this.aim), Math.sin(this.aim), game, 1);
    }
  }

  draw(ctx) {
    if (this.dead) return;
    const t = BEAST_TYPES[this.type];
    const r = this.radius;
    // 影
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath(); ctx.ellipse(this.x, this.y + r * 0.5, r * 1.0, r * 0.6, 0, 0, Math.PI * 2); ctx.fill();

    const sprite = (typeof Assets !== "undefined" && Assets.ready("beast_" + this.type)) ? Assets.get("beast_" + this.type) : null;
    if (sprite && typeof Assets.drawSprite === "function") {
      // DQ風3/4：上向き固定＋左右反転。
      if (this.flash > 0) ctx.globalAlpha = 0.85;
      Assets.drawSprite(ctx, sprite, this.x, this.y, this.aim, r, this.walkPhase);
      ctx.globalAlpha = 1;
    } else {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.aim);
      drawRoninBody(ctx, this.type, r, this.flash, this.walkPhase);
      ctx.restore();
    }

    // 仲間になったらチームの輪を描く。
    if (this.team) {
      ctx.strokeStyle = this.team === "blue" ? "#5ad6ff" : "#ff6b6b";
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(this.x, this.y, r + 4, 0, Math.PI * 2); ctx.stroke();
    }

    // 名前（野武士/剣豪）。
    ctx.fillStyle = "rgba(232,232,238,0.92)";
    ctx.font = "bold 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(t.label, this.x, this.y - r - 14);
    ctx.textAlign = "left";

    // HPバー。
    const w = r * 2;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(this.x - w / 2, this.y - r - 10, w, 4);
    ctx.fillStyle = "#caa14a";
    ctx.fillRect(this.x - w / 2, this.y - r - 10, w * (this.hp / this.maxHp), 4);
  }
}

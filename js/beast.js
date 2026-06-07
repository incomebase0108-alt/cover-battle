// Neutral wild animals (tiger / bear) that roam the map and attack ANY unit
// indiscriminately. They can be shot down (by either team), and drop an item
// when killed — a shared environmental threat that adds risk to the battlefield.
const BEAST_TYPES = {
  tiger: { hp: 120, radius: 18, speed: 2.7, damage: 13, sense: 250, attackRange: 8, attackCd: 650, body: "#d98a2b", dark: "#7a4a12" },
  bear:  { hp: 210, radius: 23, speed: 1.9, damage: 24, sense: 210, attackRange: 10, attackCd: 1000, body: "#6b4a32", dark: "#3a2718" },
};

class Beast {
  constructor(x, y, type) {
    this.x = x;
    this.y = y;
    this.type = BEAST_TYPES[type] ? type : "tiger";
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
    const n = game.map.resolveCollision(this.x + dx * sp, this.y + dy * sp, this.radius);
    const moved = V.dist(this.x, this.y, n.x, n.y);
    this.x = n.x;
    this.y = n.y;
    if (moved > 0.05) this.walkPhase += moved * 0.4;
  }

  update(dt, game) {
    if (this.dead) return;
    if (this.attackCd > 0) this.attackCd -= dt;
    if (this.flash > 0) this.flash -= dt;

    // Hunt the nearest living unit (any team) within sense range.
    let tgt = null;
    let bd = this.sense;
    for (const u of game.units) {
      if (!u.alive) continue;
      const d = V.dist(this.x, this.y, u.x, u.y);
      if (d < bd) { bd = d; tgt = u; }
    }

    if (!tgt) {
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
    // Shadow.
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath(); ctx.ellipse(this.x, this.y + r * 0.5, r * 1.1, r * 0.7, 0, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.aim);
    // Body.
    const bob = Math.sin(this.walkPhase) * r * 0.08;
    ctx.fillStyle = this.flash > 0 ? "#ff5a3c" : t.body;
    ctx.beginPath(); ctx.ellipse(bob, 0, r * 1.15, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = t.dark; ctx.lineWidth = 2; ctx.stroke();
    // Tiger stripes / bear shading.
    ctx.fillStyle = t.dark;
    if (this.type === "tiger") {
      for (let i = -1; i <= 1; i++) ctx.fillRect(i * r * 0.4, -r * 0.7, r * 0.12, r * 1.4);
    }
    // Head + ears.
    ctx.fillStyle = t.body;
    ctx.beginPath(); ctx.arc(r * 0.95, 0, r * 0.55, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = t.dark; ctx.stroke();
    ctx.fillStyle = t.dark;
    ctx.beginPath(); ctx.arc(r * 0.75, -r * 0.45, r * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.75, r * 0.45, r * 0.16, 0, Math.PI * 2); ctx.fill();
    // Eyes.
    ctx.fillStyle = "#ffe14a";
    ctx.beginPath(); ctx.arc(r * 1.15, -r * 0.18, r * 0.08, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 1.15, r * 0.18, r * 0.08, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // HP bar.
    const w = r * 2;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(this.x - w / 2, this.y - r - 10, w, 4);
    ctx.fillStyle = "#caa14a";
    ctx.fillRect(this.x - w / 2, this.y - r - 10, w * (this.hp / this.maxHp), 4);
  }
}

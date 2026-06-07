// Neutral wild animals (tiger / bear) that roam the map and attack ANY unit
// indiscriminately. They can be shot down (by either team), and drop an item
// when killed — a shared environmental threat that adds risk to the battlefield.
const BEAST_TYPES = {
  tiger: { hp: 140, radius: 23, speed: 2.7, damage: 15, sense: 260, attackRange: 10, attackCd: 650, body: "#e07c1e", dark: "#5a3408" },
  bear:  { hp: 240, radius: 30, speed: 1.9, damage: 26, sense: 220, attackRange: 12, attackCd: 1000, body: "#5e3d24", dark: "#2a1a0e" },
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

    // Hunt the nearest living unit within sense range. A wild beast (no team)
    // attacks anyone; a tamed beast attacks only the opposing team.
    let tgt = null;
    let bd = this.sense;
    for (const u of game.units) {
      if (!u.alive) continue;
      if (this.team && u.team === this.team) continue; // don't bite your owners
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
    // Slight lunge/breathe so the beast feels alive and threatening.
    const lunge = 1 + Math.sin(this.walkPhase) * 0.06;

    // Tail.
    ctx.strokeStyle = t.body;
    ctx.lineWidth = r * 0.22;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-r * 1.1, 0);
    ctx.quadraticCurveTo(-r * 1.7, Math.sin(this.walkPhase) * r * 0.5, -r * 2.0, r * 0.3);
    ctx.stroke();
    // Four legs with claws.
    ctx.strokeStyle = t.dark;
    ctx.lineWidth = r * 0.26;
    for (const [lx, ly] of [[0.45, 0.78], [0.45, -0.78], [-0.55, 0.8], [-0.55, -0.8]]) {
      const sw = Math.sin(this.walkPhase + (lx > 0 ? 0 : Math.PI)) * r * 0.22;
      ctx.beginPath();
      ctx.moveTo(lx * r, ly * r * 0.7);
      ctx.lineTo(lx * r + sw, ly * r);
      ctx.stroke();
      ctx.fillStyle = "#efeae0"; // claws
      ctx.beginPath(); ctx.arc(lx * r + sw, ly * r, r * 0.1, 0, Math.PI * 2); ctx.fill();
    }
    ctx.lineCap = "butt";

    // Body (bigger, fiercer).
    ctx.fillStyle = this.flash > 0 ? "#ff5a3c" : t.body;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.3 * lunge, r * 0.92, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = t.dark; ctx.lineWidth = 2.5; ctx.stroke();
    // Tiger stripes / bear back fur.
    ctx.fillStyle = t.dark;
    if (this.type === "tiger") {
      for (let i = -2; i <= 2; i++) {
        ctx.save(); ctx.translate(i * r * 0.32, 0); ctx.rotate(0.15);
        ctx.fillRect(-r * 0.06, -r * 0.82, r * 0.12, r * 1.64); ctx.restore();
      }
    } else {
      ctx.globalAlpha = 0.3;
      ctx.beginPath(); ctx.ellipse(-r * 0.2, 0, r * 0.9, r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    // Head.
    ctx.fillStyle = t.body;
    ctx.beginPath(); ctx.arc(r * 1.15, 0, r * 0.62, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = t.dark; ctx.lineWidth = 2.5; ctx.stroke();
    // Ears.
    ctx.fillStyle = t.dark;
    ctx.beginPath(); ctx.arc(r * 0.95, -r * 0.5, r * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.95, r * 0.5, r * 0.2, 0, Math.PI * 2); ctx.fill();
    // Snout + fangs.
    ctx.fillStyle = this.type === "tiger" ? "#f6e6c8" : "#caa98a";
    ctx.beginPath(); ctx.arc(r * 1.6, 0, r * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.moveTo(r * 1.7, -r * 0.16); ctx.lineTo(r * 1.95, -r * 0.05); ctx.lineTo(r * 1.7, r * 0.02); ctx.fill();
    ctx.beginPath(); ctx.moveTo(r * 1.7, r * 0.16); ctx.lineTo(r * 1.95, r * 0.05); ctx.lineTo(r * 1.7, -r * 0.02); ctx.fill();
    // Glowing eyes.
    ctx.fillStyle = "#ff3b2f";
    ctx.beginPath(); ctx.arc(r * 1.3, -r * 0.22, r * 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 1.3, r * 0.22, r * 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Team ring when tamed.
    if (this.team) {
      ctx.strokeStyle = this.team === "blue" ? "#5ad6ff" : "#ff6b6b";
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(this.x, this.y, r + 4, 0, Math.PI * 2); ctx.stroke();
    }

    // HP bar.
    const w = r * 2;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(this.x - w / 2, this.y - r - 10, w, 4);
    ctx.fillStyle = "#caa14a";
    ctx.fillRect(this.x - w / 2, this.y - r - 10, w * (this.hp / this.maxHp), 4);
  }
}

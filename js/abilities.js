// Class ability entities: smoke clouds (scout) and auto-firing turrets
// (engineer). Kept node-safe (draw uses ctx only).

const ABILITY = {
  smokeRadius: 95,
  smokeLife: 6000,        // ms a smoke cloud lasts
  turretLife: 13000,      // ms a turret stays before it crumbles
  turretHp: 60,
  turretRange: 320,
  turretCd: 360,          // ms between turret shots
  turretDamage: 12,
  dashMs: 230,            // duration of an assault dash
  dashMul: 2.6,           // speed multiplier during a dash
};

// A smoke cloud: blocks line of sight and conceals units inside it (like a
// forest), then fades.
class Smoke {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.r = ABILITY.smokeRadius;
    this.life = ABILITY.smokeLife;
    this.dead = false;
  }
  update(dt) { this.life -= dt; if (this.life <= 0) this.dead = true; }
  contains(x, y) { return V.dist(x, y, this.x, this.y) <= this.r; }
  draw(ctx) {
    const a = Math.min(1, this.life / 1000) * 0.7; // fade out in the last second
    const grd = ctx.createRadialGradient(this.x, this.y, this.r * 0.2, this.x, this.y, this.r);
    grd.addColorStop(0, `rgba(210,210,215,${a})`);
    grd.addColorStop(1, "rgba(180,180,190,0)");
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2); ctx.fill();
  }
}

// A deployable sentry that auto-fires at the nearest enemy in range.
class Turret {
  constructor(x, y, team, ownerName) {
    this.x = x;
    this.y = y;
    this.team = team;
    this.ownerName = ownerName || "";
    this.hp = ABILITY.turretHp;
    this.maxHp = ABILITY.turretHp;
    this.life = ABILITY.turretLife;
    this.cd = 0;
    this.aim = 0;
    this.dead = false;
    this.radius = 14;
  }
  takeDamage(a) { this.hp -= a; if (this.hp <= 0) { this.hp = 0; this.dead = true; } }
  update(dt, game) {
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    if (this.cd > 0) this.cd -= dt;
    // Acquire nearest visible enemy unit.
    let tgt = null;
    let bd = ABILITY.turretRange;
    for (const u of game.units) {
      if (!u.alive || u.team === this.team) continue;
      const d = V.dist(this.x, this.y, u.x, u.y);
      if (d > bd) continue;
      if ((game.map.inForest(u.x, u.y) || (game.inSmoke && game.inSmoke(u.x, u.y))) && d > CONFIG.forestDetectRange) continue;
      if (game.map.blockedBetween(this.x, this.y, u.x, u.y)) continue;
      bd = d; tgt = u;
    }
    if (tgt) {
      this.aim = Math.atan2(tgt.y - this.y, tgt.x - this.x);
      if (this.cd <= 0) {
        this.cd = ABILITY.turretCd;
        const dx = Math.cos(this.aim);
        const dy = Math.sin(this.aim);
        game.bullets.push(new Bullet(this.x + dx * 18, this.y + dy * 18, dx, dy, this.team, {
          damage: ABILITY.turretDamage, speed: CONFIG.bullet.speed, life: CONFIG.bullet.life,
        }));
        if (game.sound) game.sound.shoot();
      }
    }
  }
  draw(ctx) {
    const col = this.team === "blue" ? "#2f7bff" : "#ff4d4d";
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath(); ctx.arc(this.x, this.y + 4, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#3a3f4a"; // base
    ctx.beginPath(); ctx.arc(this.x, this.y, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col; // turret head
    ctx.beginPath(); ctx.arc(this.x, this.y, 7, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#15181f"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x + Math.cos(this.aim) * 18, this.y + Math.sin(this.aim) * 18); ctx.stroke();
    // HP bar.
    ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(this.x - 12, this.y - 20, 24, 3);
    ctx.fillStyle = col; ctx.fillRect(this.x - 12, this.y - 20, 24 * (this.hp / this.maxHp), 3);
  }
}

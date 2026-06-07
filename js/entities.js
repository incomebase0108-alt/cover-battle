// Combat units (player + AI), bullets, dropped items, and bombs.

class Bullet {
  constructor(x, y, dx, dy, team, opts) {
    this.x = x;
    this.y = y;
    this.dx = dx;
    this.dy = dy;
    this.team = team;       // "blue" | "red"
    this.damage = opts.damage;
    this.speed = opts.speed;
    this.life = opts.life;
    this.radius = CONFIG.bullet.radius;
    this.dead = false;
  }

  update(dt, game) {
    this.x += this.dx * this.speed;
    this.y += this.dy * this.speed;
    this.life -= dt;

    if (this.life <= 0 ||
        this.x < 0 || this.x > CONFIG.width ||
        this.y < 0 || this.y > CONFIG.height) {
      this.dead = true;
      return;
    }

    // Rocks stop bullets and take damage (and may drop an item when broken).
    for (const rock of game.map.rocks) {
      if (V.dist(this.x, this.y, rock.x, rock.y) <= rock.r + this.radius) {
        this.dead = true;
        rock.hp -= CONFIG.bullet.rockDamage;
        if (rock.hp <= 0) game.shatterRock(rock);
        return;
      }
    }

    // Hit the first enemy unit it touches.
    for (const u of game.units) {
      if (!u.alive || u.team === this.team) continue;
      if (V.dist(this.x, this.y, u.x, u.y) <= u.radius + this.radius) {
        u.takeDamage(this.damage);
        this.dead = true;
        return;
      }
    }
  }

  draw(ctx) {
    ctx.fillStyle = this.team === "blue" ? "#bcd6ff" : "#ffd2c2";
    ctx.shadowColor = this.team === "blue" ? "#2f7bff" : "#ff4d4d";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

// A power-up dropped by a shattered rock.
class Item {
  constructor(x, y, type) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.def = CONFIG.items[type];
    this.radius = CONFIG.itemRadius;
    this.dead = false;
    this.bob = Math.random() * Math.PI * 2;
  }

  update(dt) { this.bob += dt * 0.005; }

  applyTo(unit) {
    const d = this.def;
    if (d.heal) unit.hp = Math.min(CONFIG.unit.maxHp, unit.hp + d.heal);
    if (d.speedMul) unit.speedMul = Math.min(2.2, unit.speedMul * d.speedMul);
    if (d.bulletSpeedMul) unit.bulletSpeedMul = Math.min(2.5, unit.bulletSpeedMul * d.bulletSpeedMul);
    if (d.rangeMul) unit.rangeMul = Math.min(2.5, unit.rangeMul * d.rangeMul);
    if (d.bombUp) unit.maxBombs += d.bombUp;
  }

  draw(ctx) {
    const y = this.y + Math.sin(this.bob) * 3;
    ctx.save();
    ctx.shadowColor = this.def.color;
    ctx.shadowBlur = 12;
    ctx.fillStyle = this.def.color;
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.x, y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "#10141c";
    ctx.font = "bold 8px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.def.label, this.x, y + 0.5);
    ctx.textAlign = "left";
  }
}

// Bomberman-style bomb: ticks down, then detonates in a radius.
class Bomb {
  constructor(x, y, owner) {
    this.x = x;
    this.y = y;
    this.owner = owner;     // who placed it (for bomb-count bookkeeping)
    this.fuse = CONFIG.bomb.fuse;
    this.exploded = false;
    this.flash = 0;
    this.dead = false;
  }

  update(dt, game) {
    if (!this.exploded) {
      this.fuse -= dt;
      if (this.fuse <= 0) this.detonate(game);
    } else {
      this.flash -= dt;
      if (this.flash <= 0) this.dead = true;
    }
  }

  detonate(game) {
    this.exploded = true;
    this.flash = CONFIG.bomb.flashTime;
    if (this.owner) this.owner.activeBombs = Math.max(0, this.owner.activeBombs - 1);

    // Damage every unit in range (friendly fire included — watch your step!).
    for (const u of game.units) {
      if (!u.alive) continue;
      if (V.dist(this.x, this.y, u.x, u.y) <= CONFIG.bomb.radius + u.radius) {
        u.takeDamage(CONFIG.bomb.damage);
      }
    }
    // Flatten rocks in range.
    const broken = game.map.damageRocksInRadius(
      this.x, this.y, CONFIG.bomb.radius, CONFIG.bomb.rockDamage
    );
    for (const rock of broken) game.dropFromRock(rock);
  }

  draw(ctx) {
    if (!this.exploded) {
      // Pulsing bomb body.
      const t = 1 - this.fuse / CONFIG.bomb.fuse;
      const pulse = 1 + Math.sin(t * 30) * 0.12;
      ctx.fillStyle = "#1a1a1a";
      ctx.beginPath();
      ctx.arc(this.x, this.y, 10 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = t > 0.66 ? "#ff5a3c" : "#ffae42";
      ctx.beginPath();
      ctx.arc(this.x, this.y - 12, 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const a = this.flash / CONFIG.bomb.flashTime;
      ctx.save();
      ctx.globalAlpha = a;
      const grad = ctx.createRadialGradient(this.x, this.y, 4, this.x, this.y, CONFIG.bomb.radius);
      grad.addColorStop(0, "#fff2b0");
      grad.addColorStop(0.5, "#ff8a3c");
      grad.addColorStop(1, "rgba(255,80,40,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(this.x, this.y, CONFIG.bomb.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

class Unit {
  constructor(x, y, team, isPlayer = false) {
    this.x = x;
    this.y = y;
    this.team = team;
    this.isPlayer = isPlayer;
    this.radius = CONFIG.unit.radius;
    this.hp = CONFIG.unit.maxHp;
    this.alive = true;
    this.aim = team === "blue" ? 0 : Math.PI; // facing angle
    this.cooldown = 0;
    this.skill = 0.7; // AI accuracy/decision quality, overridden per spawn
    this.ai = null;   // assigned for non-player units

    // Buff multipliers (raised by item pickups).
    this.speedMul = 1;
    this.bulletSpeedMul = 1;
    this.rangeMul = 1;
    this.maxBombs = 1;
    this.activeBombs = 0;
  }

  takeDamage(amount) {
    if (!this.alive) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
  }

  // dirX/dirY are a (roughly) unit vector of intended movement.
  move(dirX, dirY, game) {
    const speed = CONFIG.unit.speed * this.speedMul;
    const next = game.map.resolveCollision(
      this.x + dirX * speed,
      this.y + dirY * speed,
      this.radius
    );
    this.x = next.x;
    this.y = next.y;
  }

  tryShoot(game) {
    if (this.cooldown > 0) return;
    this.cooldown = CONFIG.unit.fireCooldown;
    const dx = Math.cos(this.aim);
    const dy = Math.sin(this.aim);
    const bx = this.x + dx * (this.radius + 6);
    const by = this.y + dy * (this.radius + 6);
    game.bullets.push(new Bullet(bx, by, dx, dy, this.team, {
      damage: CONFIG.bullet.damage,
      speed: CONFIG.bullet.speed * this.bulletSpeedMul,
      life: CONFIG.bullet.life * this.rangeMul,
    }));
  }

  placeBomb(game) {
    if (this.activeBombs >= this.maxBombs) return;
    this.activeBombs++;
    game.bombs.push(new Bomb(this.x, this.y, this));
  }

  update(dt, game) {
    if (!this.alive) return;
    if (this.cooldown > 0) this.cooldown -= dt;

    if (this.isPlayer) {
      this.updatePlayer(game);
    } else if (this.ai) {
      this.ai.update(this, dt, game);
    }
  }

  updatePlayer(game) {
    const { dx, dy } = Input.moveVector();
    if (dx !== 0 || dy !== 0) this.move(dx, dy, game);
    this.aim = Math.atan2(Input.mouseY - this.y, Input.mouseX - this.x);
    if (Input.shooting) this.tryShoot(game);
    if (Input.consumeBomb()) this.placeBomb(game);
  }

  draw(ctx, game) {
    if (!this.alive) return;

    const concealed = game.map.inForest(this.x, this.y);
    ctx.globalAlpha = concealed ? 0.55 : 1;

    // Body
    const color = this.team === "blue" ? "#2f7bff" : "#ff4d4d";
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();

    // Gun barrel pointing at aim direction
    ctx.strokeStyle = "#1a1f29";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x + Math.cos(this.aim) * (this.radius + 10),
               this.y + Math.sin(this.aim) * (this.radius + 10));
    ctx.stroke();

    // Player ring marker
    if (this.isPlayer) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;

    // HP bar
    const w = 30;
    const h = 4;
    const hx = this.x - w / 2;
    const hy = this.y - this.radius - 12;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(hx, hy, w, h);
    ctx.fillStyle = this.team === "blue" ? "#7fb0ff" : "#ff8a8a";
    ctx.fillRect(hx, hy, w * (this.hp / CONFIG.unit.maxHp), h);
  }
}

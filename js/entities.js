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

    // Mountains stop bullets but are indestructible.
    for (const m of game.map.mountains) {
      if (V.dist(this.x, this.y, m.x, m.y) <= m.r + this.radius) {
        this.dead = true;
        return;
      }
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
    if (game.sound) game.sound.explosion();
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
    // Equipped weapon (see weapons.js). AI + player default to "rifle", which
    // reproduces the original magazine behaviour exactly.
    this.weaponKey = "rifle";
    this.ammo = this.weapon().magSize ?? CONFIG.unit.magSize; // rounds left
    this.reloading = false;
    this.reloadTimer = 0;
    this.skill = 0.7; // AI accuracy/decision quality, overridden per spawn
    this.ai = null;   // assigned for non-player units

    // Buff multipliers (raised by item pickups).
    this.speedMul = 1;
    this.bulletSpeedMul = 1;
    this.rangeMul = 1;
    this.maxBombs = 1;
    this.activeBombs = 0;

    // Lock-on aiming (player only).
    this.lockMode = false;
    this.lockTarget = null;
  }

  // Current weapon definition (always returns a valid object).
  weapon() {
    return getWeapon(this.weaponKey);
  }

  // Per-weapon stats with CONFIG.unit fallbacks for anything unspecified.
  fireCooldownVal() { return this.weapon().fireCooldown ?? CONFIG.unit.fireCooldown; }
  magSizeVal()      { return this.weapon().magSize ?? CONFIG.unit.magSize; }
  reloadTimeVal()   { return this.weapon().reloadTime ?? CONFIG.unit.reloadTime; }
  damageVal()       { return this.weapon().damage ?? CONFIG.bullet.damage; }

  // Switch to a specific weapon key (no-op for unknown keys). Resets the
  // magazine to the new weapon's full capacity and cancels any reload.
  setWeapon(key) {
    if (!WEAPONS[key] || key === this.weaponKey) return;
    this.weaponKey = key;
    this.ammo = this.magSizeVal();
    this.reloading = false;
    this.reloadTimer = 0;
    this.cooldown = 0;
  }

  // Advance to the next weapon in WEAPON_ORDER (used by the F-key cycle).
  cycleWeapon(dir = 1) {
    const i = WEAPON_ORDER.indexOf(this.weaponKey);
    const base = i < 0 ? 0 : i;
    const n = WEAPON_ORDER.length;
    const next = WEAPON_ORDER[((base + dir) % n + n) % n];
    this.setWeapon(next);
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
    let speed = CONFIG.unit.speed * this.speedMul;
    if (game.map.inRiver(this.x, this.y)) speed *= CONFIG.riverSpeedMul; // wading is slow
    const next = game.map.resolveCollision(
      this.x + dirX * speed,
      this.y + dirY * speed,
      this.radius
    );
    this.x = next.x;
    this.y = next.y;
  }

  tryShoot(game) {
    if (this.cooldown > 0 || this.reloading) return;
    if (this.ammo <= 0) { this.startReload(game); return; }

    const w = this.weapon();
    this.cooldown = this.fireCooldownVal();
    this.ammo--; // one trigger pull = one round, even for multi-pellet weapons

    const pellets = w.pellets ?? 1;
    const spread = w.spread ?? 0;
    const wSpeedMul = w.bulletSpeedMul ?? 1;
    const wRangeMul = w.rangeMul ?? 1;
    const damage = this.damageVal();
    const speed = CONFIG.bullet.speed * wSpeedMul * this.bulletSpeedMul;
    const life = CONFIG.bullet.life * wRangeMul * this.rangeMul;

    for (let i = 0; i < pellets; i++) {
      // Center the spread so a single pellet fires perfectly straight.
      const jitter = pellets > 1
        ? (i / (pellets - 1) - 0.5) * spread + (Math.random() - 0.5) * spread * 0.5
        : (Math.random() - 0.5) * spread;
      const a = this.aim + jitter;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const bx = this.x + dx * (this.radius + 6);
      const by = this.y + dy * (this.radius + 6);
      game.bullets.push(new Bullet(bx, by, dx, dy, this.team, {
        damage, speed, life,
      }));
    }

    if (game.sound) game.sound.shoot();
    if (this.ammo <= 0) this.startReload(game);
  }

  startReload(game) {
    if (this.reloading) return;
    this.reloading = true;
    this.reloadTimer = this.reloadTimeVal();
    if (this.isPlayer && game && game.sound) game.sound.reload();
  }

  placeBomb(game) {
    if (this.activeBombs >= this.maxBombs) return;
    this.activeBombs++;
    game.bombs.push(new Bomb(this.x, this.y, this));
  }

  update(dt, game) {
    if (!this.alive) return;
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.reloading = false;
        this.ammo = this.magSizeVal();
      }
    }

    // Slowly regenerate while standing in your own base/fort.
    if (this.hp < CONFIG.unit.maxHp && game.map.inBase(this.x, this.y, this.team)) {
      this.hp = Math.min(CONFIG.unit.maxHp, this.hp + CONFIG.base.regenPerSec * dt / 1000);
    }

    if (this.isPlayer) {
      this.updatePlayer(game);
    } else if (this.ai) {
      this.ai.update(this, dt, game);
    }
  }

  updatePlayer(game) {
    const { dx, dy } = Input.moveVector();
    if (dx !== 0 || dy !== 0) this.move(dx, dy, game);

    // Weapon switching: number keys select directly, F cycles forward.
    const slot = Input.consumeWeaponSlot();
    if (slot > 0 && WEAPON_ORDER[slot - 1]) this.setWeapon(WEAPON_ORDER[slot - 1]);
    if (Input.consumeWeaponCycle()) this.cycleWeapon(1);

    // Lock-on toggle / cycle.
    if (Input.consumeLockToggle()) {
      this.lockMode = !this.lockMode;
      if (this.lockMode) this.lockTarget = game.nearestVisibleEnemy(this);
    }
    if (this.lockMode && Input.consumeCycle()) {
      this.lockTarget = game.nextVisibleEnemy(this, this.lockTarget);
    }

    if (this.lockMode) {
      // Keep a valid target, then aim straight at it.
      if (!this.lockTarget || !this.lockTarget.alive ||
          !game.unitVisibleToPlayer(this.lockTarget)) {
        this.lockTarget = game.nearestVisibleEnemy(this);
      }
      if (this.lockTarget) {
        this.aim = Math.atan2(this.lockTarget.y - this.y, this.lockTarget.x - this.x);
      } else {
        this.aim = Math.atan2(Input.mouseY - this.y, Input.mouseX - this.x);
      }
    } else {
      this.aim = Math.atan2(Input.mouseY - this.y, Input.mouseX - this.x);
    }

    if (Input.shooting) this.tryShoot(game);
    if (Input.consumeBomb()) this.placeBomb(game);
  }

  draw(ctx, game) {
    if (!this.alive) return;

    const concealed = game.map.inForest(this.x, this.y);
    ctx.globalAlpha = concealed ? 0.55 : 1;

    const r = this.radius;
    const uniform = this.team === "blue" ? "#2f7bff" : "#ff4d4d";
    const dark = this.team === "blue" ? "#17407f" : "#7f2222";

    // Drop shadow.
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + r * 0.5, r * 1.05, r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Draw the soldier oriented toward the aim direction.
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.aim);

    // Backpack.
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.arc(-r * 0.5, 0, r * 0.5, 0, Math.PI * 2);
    ctx.fill();

    // Shoulders / torso (uniform).
    ctx.fillStyle = uniform;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.95, r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Rifle (held forward).
    ctx.fillStyle = "#15181f";
    ctx.fillRect(r * 0.1, -r * 0.18, r * 1.25, r * 0.28); // barrel
    ctx.fillRect(-r * 0.15, -r * 0.12, r * 0.4, r * 0.45); // stock/grip

    // Helmet (top-down dome).
    const hg = ctx.createRadialGradient(-r * 0.1, -r * 0.1, r * 0.1, 0, 0, r * 0.6);
    hg.addColorStop(0, this.team === "blue" ? "#9cc2ff" : "#ffb3b3");
    hg.addColorStop(1, dark);
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Player ring marker (screen-space, not rotated).
    if (this.isPlayer) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(this.x, this.y, r + 6, 0, Math.PI * 2);
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

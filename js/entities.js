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
    this.pierce = !!opts.pierce;       // pass through units (piercing rifle)
    this.breakRock = !!opts.breakRock; // extra rock damage (flamethrower / rockbuster)
    this._hit = this.pierce ? [] : null; // units already hit, so pierce hits each once
    this.dead = false;
  }

  update(dt, game) {
    this.x += this.dx * this.speed;
    this.y += this.dy * this.speed;
    this.life -= dt;

    if (this.life <= 0 ||
        this.x < 0 || this.x > CONFIG.world.width ||
        this.y < 0 || this.y > CONFIG.world.height) {
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

    // Enemy fort core takes damage; your own fort blocks your bullets harmlessly.
    const core = game.map.baseCoreAt(this.x, this.y);
    if (core) {
      if (core.team !== this.team) {
        core.hp = Math.max(0, core.hp - CONFIG.base.bulletDamage);
      }
      this.dead = true;
      return;
    }

    // Rocks stop bullets and take damage (rock-busting rounds hit far harder).
    for (const rock of game.map.rocks) {
      if (V.dist(this.x, this.y, rock.x, rock.y) <= rock.r + this.radius) {
        this.dead = true;
        rock.hp -= this.breakRock ? CONFIG.bullet.rockDamage * 6 : CONFIG.bullet.rockDamage;
        if (rock.hp <= 0) game.shatterRock(rock);
        return;
      }
    }

    // Defuse enemy dynamite by shooting it.
    if (game.dynamites) {
      for (const d of game.dynamites) {
        if (d.hitBy(this)) { this.dead = true; return; }
      }
    }

    // Hit enemy units. Normal rounds stop on the first hit; piercing rounds
    // pass through, damaging each unit once.
    for (const u of game.units) {
      if (!u.alive || u.team === this.team) continue;
      if (V.dist(this.x, this.y, u.x, u.y) <= u.radius + this.radius) {
        if (this.pierce) {
          if (this._hit.indexOf(u) === -1) { u.takeDamage(this.damage); this._hit.push(u); }
        } else {
          u.takeDamage(this.damage);
          this.dead = true;
          return;
        }
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

    // Forts in the blast take heavy damage (either team's).
    for (const b of game.map.bases) {
      if (b.hp > 0 && V.dist(this.x, this.y, b.x, b.y) <= CONFIG.bomb.radius + b.coreR) {
        b.hp = Math.max(0, b.hp - CONFIG.bomb.damage * 2);
      }
    }
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

// Dynamite: a powerful, slow fort-buster. It can be shot (by the enemy) and
// defused before its 3s fuse runs out.
class Dynamite {
  constructor(x, y, owner) {
    this.x = x;
    this.y = y;
    this.owner = owner;
    this.team = owner ? owner.team : null;
    this.fuse = CONFIG.dynamite.fuse;
    this.hp = CONFIG.dynamite.hp;
    this.exploded = false;
    this.defused = false;
    this.flash = 0;
    this.dead = false;
  }

  // Enemy bullets defuse it. Returns true if this bullet hit the dynamite.
  hitBy(bullet) {
    if (this.exploded || this.dead) return false;
    if (bullet.team === this.team) return false; // your own fire won't defuse it
    if (V.dist(bullet.x, bullet.y, this.x, this.y) > 12 + bullet.radius) return false;
    this.hp -= bullet.damage;
    if (this.hp <= 0) { this.defused = true; this.dead = true; }
    return true;
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
    this.flash = CONFIG.dynamite.flashTime;
    if (this.owner) this.owner.activeDynamite = Math.max(0, this.owner.activeDynamite - 1);
    if (game.sound) game.sound.explosion();
    const R = CONFIG.dynamite.radius;
    for (const u of game.units) {
      if (!u.alive) continue;
      if (V.dist(this.x, this.y, u.x, u.y) <= R + u.radius) u.takeDamage(CONFIG.dynamite.unitDamage);
    }
    const broken = game.map.damageRocksInRadius(this.x, this.y, R, CONFIG.dynamite.rockDamage);
    for (const rock of broken) game.dropFromRock(rock);
    for (const b of game.map.bases) {
      if (b.hp > 0 && V.dist(this.x, this.y, b.x, b.y) <= R + b.coreR) {
        b.hp = Math.max(0, b.hp - CONFIG.dynamite.fortDamage);
      }
    }
  }

  draw(ctx) {
    if (!this.exploded) {
      const t = 1 - this.fuse / CONFIG.dynamite.fuse;
      // Red dynamite bundle.
      ctx.fillStyle = "#b8281f";
      ctx.fillRect(this.x - 9, this.y - 6, 18, 12);
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(this.x - 9, this.y - 6, 18, 12);
      ctx.fillStyle = "#e8d2a0";
      ctx.fillRect(this.x - 9, this.y - 2, 18, 4);
      // Blinking fuse spark that speeds up near detonation.
      const blink = Math.sin(t * (8 + t * 40)) > 0;
      if (blink) {
        ctx.fillStyle = "#ffd34a";
        ctx.beginPath(); ctx.arc(this.x + 9, this.y - 9, 3.5, 0, Math.PI * 2); ctx.fill();
      }
      // HP pips (how close to being defused).
      const pct = Math.max(0, this.hp / CONFIG.dynamite.hp);
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(this.x - 10, this.y - 14, 20, 3);
      ctx.fillStyle = "#ff7a5a";
      ctx.fillRect(this.x - 10, this.y - 14, 20 * pct, 3);
    } else {
      const a = this.flash / CONFIG.dynamite.flashTime;
      ctx.save();
      ctx.globalAlpha = a;
      const grad = ctx.createRadialGradient(this.x, this.y, 6, this.x, this.y, CONFIG.dynamite.radius);
      grad.addColorStop(0, "#fff6c0");
      grad.addColorStop(0.45, "#ff7a2c");
      grad.addColorStop(1, "rgba(255,60,30,0)");
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(this.x, this.y, CONFIG.dynamite.radius, 0, Math.PI * 2); ctx.fill();
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
    this.sinceShot = 99999;  // ms since last shot (drives passive ammo regen)
    this.regenAccum = 0;     // accumulator for partial regenerated rounds
    this.muzzleFlash = 0;    // ms remaining on the muzzle-flash effect
    this.skill = 0.7; // AI accuracy/decision quality, overridden per spawn
    this.ai = null;   // assigned for non-player units

    // Buff multipliers (raised by item pickups).
    this.speedMul = 1;
    this.bulletSpeedMul = 1;
    this.rangeMul = 1;
    this.maxBombs = 1;
    this.activeBombs = 0;
    this.activeDynamite = 0; // at most 1 live dynamite per unit

    this.special = false;     // holding a temporary chest weapon?
    this.specialTimer = 0;    // ms until it reverts to the rifle
    this.baseWeaponKey = "rifle"; // weapon to return to after a special expires

    // Lock-on aiming (player only).
    this.lockMode = false;
    this.lockTarget = null;

    // Walk-cycle animation state (purely cosmetic, see move()/draw()).
    this.walkPhase = 0;    // advancing sine phase that drives bounce + steps
    this.movingTimer = 0;  // ms since last real movement; >0 means "walking"
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
    this.special = false; // manually switching drops the temporary chest weapon
    this.baseWeaponKey = next;
    this.setWeapon(next);
  }

  // Grant a temporary special weapon from a chest. Reverts after a timer.
  grantSpecial(key, durationMs) {
    if (!WEAPONS[key]) return;
    if (!this.special) this.baseWeaponKey = this.weaponKey; // remember normal gun
    this.setWeapon(key);
    this.special = true;
    this.specialTimer = durationMs || 14000;
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
    if (game.map.inSand && game.map.inSand(this.x, this.y)) speed *= CONFIG.sandSpeedMul; // trudging through sand
    const tryAt = (dx, dy) =>
      game.map.resolveCollision(this.x + dx * speed, this.y + dy * speed, this.radius);

    let next = tryAt(dirX, dirY);
    let moved = V.dist(this.x, this.y, next.x, next.y);
    // Wedged against an obstacle/corner: slide along whichever single axis makes
    // the most progress, so units don't get stuck (which could stall the match).
    if (moved < speed * 0.5) {
      const ax = tryAt(dirX, 0);
      const ay = tryAt(0, dirY);
      const mx = V.dist(this.x, this.y, ax.x, ax.y);
      const my = V.dist(this.x, this.y, ay.x, ay.y);
      if (mx >= my && mx > moved) { next = ax; moved = mx; }
      else if (my > moved) { next = ay; moved = my; }
    }
    this.x = next.x;
    this.y = next.y;

    // Drive the walk cycle from how far we actually moved this step. Tie the
    // phase to distance (not time) so the step cadence matches real speed, and
    // mark us as "moving" for a few frames so the legs don't twitch to a halt
    // the instant a key is released.
    if (moved > 0.05) {
      this.walkPhase += moved * 0.45;
      this.movingTimer = 90; // ms of grace before the walk cycle stops
    }
    return moved;
  }

  // Would this item actually benefit me? (Used by pickup + AI item-seeking, so
  // a full-HP unit leaves a health pack for someone who needs it.)
  wantsItem(item) {
    const d = item.def;
    if (d.heal) return this.hp < CONFIG.unit.maxHp - 1;
    if (d.speedMul) return this.speedMul < 2.0;
    if (d.bulletSpeedMul) return this.bulletSpeedMul < 2.2;
    if (d.rangeMul) return this.rangeMul < 2.2;
    if (d.bombUp) return this.maxBombs < 3;
    return true;
  }

  tryShoot(game) {
    if (this.cooldown > 0 || this.reloading) return;
    if (this.ammo <= 0) { this.startReload(game); return; }

    const w = this.weapon();
    this.cooldown = this.fireCooldownVal();
    this.ammo--; // one trigger pull = one round, even for multi-pellet weapons
    this.sinceShot = 0;
    this.regenAccum = 0;
    this.muzzleFlash = 70;

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
        damage, speed, life, pierce: w.pierce, breakRock: w.breakRock || w.fire,
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

  placeDynamite(game) {
    if (this.activeDynamite >= 1) return; // one live stick at a time
    this.activeDynamite++;
    game.dynamites.push(new Dynamite(this.x, this.y, this));
  }

  update(dt, game) {
    if (!this.alive) return;
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.muzzleFlash > 0) this.muzzleFlash -= dt;
    if (this.movingTimer > 0) this.movingTimer -= dt; // walk-cycle grace timer
    this.sinceShot += dt;

    // Temporary chest weapon reverts to the normal gun when its timer runs out.
    if (this.special) {
      this.specialTimer -= dt;
      if (this.specialTimer <= 0) {
        this.special = false;
        this.setWeapon(this.baseWeaponKey || "rifle");
      }
    }

    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.reloading = false;
        this.ammo = this.magSizeVal();
      }
    } else if (this.ammo < this.magSizeVal() && this.sinceShot >= CONFIG.unit.ammoRegenDelay) {
      // Passive ammo recovery while holding fire.
      this.regenAccum += dt;
      const interval = CONFIG.unit.ammoRegenInterval;
      while (this.regenAccum >= interval && this.ammo < this.magSizeVal()) {
        this.regenAccum -= interval;
        this.ammo++;
      }
    }

    // Slowly regenerate while standing in your own base/fort, a neutral oasis,
    // or a control point your team has captured.
    const onOasis = game.map.inOasis && game.map.inOasis(this.x, this.y);
    const onOwnPoint = game.capturedPointFor && game.capturedPointFor(this.x, this.y, this.team);
    if (this.hp < CONFIG.unit.maxHp &&
        (game.map.inBase(this.x, this.y, this.team) || onOasis || onOwnPoint)) {
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
        this.aimAtMouse(game);
      }
    } else {
      this.aimAtMouse(game);
    }

    if (Input.shooting) this.tryShoot(game);
    if (Input.consumeBomb()) this.placeBomb(game);
    if (Input.consumeDynamite()) this.placeDynamite(game);
  }

  // Aim toward the mouse, converting screen coords to world via the camera.
  aimAtMouse(game) {
    const cam = game.cam || { x: 0, y: 0 };
    this.aim = Math.atan2(Input.mouseY + cam.y - this.y, Input.mouseX + cam.x - this.x);
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

    const light = this.team === "blue" ? "#9cc2ff" : "#ffb3b3";

    // Draw the soldier oriented toward the aim direction.
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.aim);

    // --- Walk cycle --------------------------------------------------------
    // In this rotated frame local +X is "forward" (the aim direction) and the
    // Y axis runs left/right across the body. We use a single sine of walkPhase
    // so the two feet stay exactly out of phase (left = sin, right = -sin) and
    // the body bobs with it. `walking` decays a few frames after the unit stops
    // (movingTimer) so the cycle settles smoothly instead of snapping shut.
    const walking = this.movingTimer > 0;
    const swing = walking ? Math.sin(this.walkPhase) : 0;
    const stepX = swing * r * 0.45;          // feet slide fore/aft along aim
    const bob = walking ? Math.abs(Math.sin(this.walkPhase)) * r * 0.12 : 0; // 1-2px bob

    // Feet drawn first (under the body, so they read for sprites too). Left and
    // right boots sit either side of centre and step in opposition.
    ctx.fillStyle = "#222630";
    ctx.beginPath();
    ctx.ellipse(-r * 0.15 + stepX, -r * 0.42, r * 0.42, r * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-r * 0.15 - stepX,  r * 0.42, r * 0.42, r * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body group: lift everything above the feet by the bob (toward +X reads as
    // a subtle forward weight-shift in this top-down view). Feet stay grounded.
    ctx.save();
    ctx.translate(bob, 0);

    const sprite = typeof Assets !== "undefined" && Assets.ready("soldier_" + this.team)
      ? Assets.get("soldier_" + this.team) : null;
    if (sprite) {
      const s = r * 5.2; // sprite faces +X, matching aim
      ctx.drawImage(sprite, -s / 2, -s / 2, s, s);
    } else {
    // Backpack.
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.arc(-r * 0.55, 0, r * 0.48, 0, Math.PI * 2);
    ctx.fill();

    // Torso / vest (uniform) with a webbing stripe.
    ctx.fillStyle = uniform;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.98, r * 0.82, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "rgba(0,0,0,0.22)"; // chest webbing
    ctx.fillRect(-r * 0.1, -r * 0.7, r * 0.22, r * 1.4);

    // Arms reaching to the rifle.
    ctx.strokeStyle = uniform;
    ctx.lineWidth = r * 0.34;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(r * 0.1, -r * 0.45); ctx.lineTo(r * 0.7, -r * 0.1);
    ctx.moveTo(r * 0.1,  r * 0.45); ctx.lineTo(r * 0.7,  r * 0.1);
    ctx.stroke();
    ctx.lineCap = "butt";

    // Rifle (held forward): stock, body, barrel.
    ctx.fillStyle = "#23262e";
    ctx.fillRect(-r * 0.25, -r * 0.13, r * 0.55, r * 0.46); // stock/grip
    ctx.fillStyle = "#15181f";
    ctx.fillRect(r * 0.1, -r * 0.15, r * 1.4, r * 0.22);    // body + barrel
    ctx.fillStyle = "#3a3f4a";
    ctx.fillRect(r * 0.55, -r * 0.05, r * 0.45, r * 0.12);  // sight rail

    // Helmet with a front brim/visor.
    const hg = ctx.createRadialGradient(-r * 0.12, -r * 0.12, r * 0.1, 0, 0, r * 0.62);
    hg.addColorStop(0, light);
    hg.addColorStop(1, dark);
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.56, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.arc(r * 0.2, 0, r * 0.56, -0.9, 0.9); // brim toward the front
    ctx.fill();
    } // end vector-art fallback

    // Muzzle flash when a shot was just fired.
    if (this.muzzleFlash > 0) {
      const f = this.muzzleFlash / 70;
      ctx.fillStyle = `rgba(255,${200 + Math.floor(40 * f)},120,${0.9 * f})`;
      ctx.beginPath();
      ctx.moveTo(r * 1.5, 0);
      ctx.lineTo(r * 1.5 + r * 0.7 * f, -r * 0.28 * f);
      ctx.lineTo(r * 1.9 + r * 0.9 * f, 0);
      ctx.lineTo(r * 1.5 + r * 0.7 * f, r * 0.28 * f);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore(); // end body group (undo walk bob)
    ctx.restore(); // end rotated frame

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

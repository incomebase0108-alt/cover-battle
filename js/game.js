// Core game state + loop. Builds a stage, runs the simulation, detects win/lose.
class Game {
  constructor(canvas, callbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.callbacks = callbacks || {};
    this.stageIndex = 0;
    this.running = false;
    this.units = [];
    this.bullets = [];
    this.items = [];
    this.bombs = [];
    this.map = null;
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

    // Blue team: first unit is the player, rest are AI allies.
    stage.blueSpawns.forEach((s, i) => {
      const u = new Unit(s.x, s.y, "blue", i === 0);
      if (!u.isPlayer) {
        u.ai = new AIController();
        u.skill = 0.7;
      }
      this.units.push(u);
    });

    // Red team: all AI, skill scales with the stage.
    stage.redSpawns.forEach((s) => {
      const u = new Unit(s.x, s.y, "red");
      u.ai = new AIController();
      u.skill = stage.enemySkill;
      this.units.push(u);
    });

    this._syncHud();
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
    for (const u of this.units) u.update(dt, this);
    for (const b of this.bullets) b.update(dt, this);
    for (const b of this.bombs) b.update(dt, this);
    for (const it of this.items) it.update(dt);

    this._handlePickups();

    this.bullets = this.bullets.filter((b) => !b.dead);
    this.bombs = this.bombs.filter((b) => !b.dead);
    this.items = this.items.filter((it) => !it.dead);

    this._syncHud();

    const blue = this.aliveCount("blue");
    const red = this.aliveCount("red");
    if (red === 0) {
      this._end(true);
    } else if (blue === 0) {
      this._end(false);
    }
  }

  _handlePickups() {
    for (const it of this.items) {
      if (it.dead) continue;
      for (const u of this.units) {
        if (!u.alive) continue;
        if (V.dist(it.x, it.y, u.x, u.y) <= it.radius + u.radius) {
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
    this.running = false;
    const hasNext = this.stageIndex + 1 < STAGES.length;
    if (this.callbacks.onEnd) this.callbacks.onEnd(win, hasNext, this.stageIndex);
  }

  _syncHud() {
    if (this.callbacks.onHud) {
      this.callbacks.onHud({
        stage: STAGES[this.stageIndex].name,
        blue: this.aliveCount("blue"),
        red: this.aliveCount("red"),
      });
    }
  }

  _render() {
    const ctx = this.ctx;
    this.map.draw(ctx);

    // Dead units first (faint markers), then bullets, then live units, then rocks on top.
    for (const u of this.units) {
      if (!u.alive) this._drawWreck(ctx, u);
    }
    for (const it of this.items) it.draw(ctx);
    for (const b of this.bullets) b.draw(ctx);
    for (const u of this.units) u.draw(ctx, this);
    this.map.drawRocks(ctx);
    // Bombs/explosions on top so the blast reads clearly over everything.
    for (const b of this.bombs) b.draw(ctx);
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

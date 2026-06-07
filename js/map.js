// Terrain: solid rocks (block movement + bullets + line of sight, and can be
// destroyed) and forests (passable, but conceal whoever stands inside them).
class GameMap {
  constructor(stage) {
    this.rocks = stage.rocks.map((r) => ({
      ...r,
      hp: CONFIG.rock.hp,
      maxHp: CONFIG.rock.hp,
    }));
    this.forests = stage.forests.map((f) => ({ ...f }));
  }

  // Does the straight line a->b cross any rock? Used for line-of-sight + bullets.
  blockedBetween(ax, ay, bx, by) {
    for (const rock of this.rocks) {
      if (V.segmentHitsCircle(ax, ay, bx, by, rock.x, rock.y, rock.r)) return true;
    }
    return false;
  }

  // Push a unit-sized circle out of any rock it overlaps.
  resolveCollision(x, y, radius) {
    let nx = x;
    let ny = y;
    for (const rock of this.rocks) {
      const d = V.dist(nx, ny, rock.x, rock.y);
      const min = rock.r + radius;
      if (d < min && d > 0) {
        const push = (min - d);
        nx += ((nx - rock.x) / d) * push;
        ny += ((ny - rock.y) / d) * push;
      } else if (d === 0) {
        nx += min; // degenerate: nudge sideways
      }
    }
    // Keep inside the arena bounds.
    nx = V.clamp(nx, radius, CONFIG.width - radius);
    ny = V.clamp(ny, radius, CONFIG.height - radius);
    return { x: nx, y: ny };
  }

  inForest(x, y) {
    for (const f of this.forests) {
      if (V.dist(x, y, f.x, f.y) <= f.r) return true;
    }
    return false;
  }

  // Apply damage to rocks within `radius` of a point (used by bombs).
  // Returns the list of rocks that were shattered by this hit.
  damageRocksInRadius(x, y, radius, amount) {
    const broken = [];
    for (const rock of this.rocks) {
      if (V.dist(x, y, rock.x, rock.y) <= radius + rock.r) {
        rock.hp -= amount;
        if (rock.hp <= 0) broken.push(rock);
      }
    }
    return this._collect(broken);
  }

  // Remove already-shattered rocks from the map, returning them so the caller
  // can decide whether to drop items.
  _collect(broken) {
    if (broken.length === 0) return [];
    this.rocks = this.rocks.filter((r) => !broken.includes(r));
    return broken;
  }

  draw(ctx) {
    // Ground texture: subtle grass grid.
    ctx.fillStyle = "#33472f";
    ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);
    ctx.strokeStyle = "rgba(0,0,0,0.06)";
    ctx.lineWidth = 1;
    for (let gx = 0; gx <= CONFIG.width; gx += 48) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, CONFIG.height); ctx.stroke();
    }
    for (let gy = 0; gy <= CONFIG.height; gy += 48) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(CONFIG.width, gy); ctx.stroke();
    }

    // Forests (drawn under units so units appear "inside" them).
    for (const f of this.forests) {
      ctx.fillStyle = "rgba(34, 90, 42, 0.55)";
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(60, 130, 65, 0.5)";
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const rx = f.x + Math.cos(a) * f.r * 0.55;
        const ry = f.y + Math.sin(a) * f.r * 0.55;
        ctx.beginPath(); ctx.arc(rx, ry, f.r * 0.32, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  // Rocks are drawn on top so they overlap (hide) units behind them.
  drawRocks(ctx) {
    for (const rock of this.rocks) {
      const grad = ctx.createRadialGradient(
        rock.x - rock.r * 0.3, rock.y - rock.r * 0.3, rock.r * 0.2,
        rock.x, rock.y, rock.r
      );
      grad.addColorStop(0, "#9a8f7d");
      grad.addColorStop(1, "#5f574a");
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(rock.x, rock.y, rock.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Show cracks as the rock takes damage.
      const dmg = 1 - rock.hp / rock.maxHp;
      if (dmg > 0.05) {
        ctx.strokeStyle = `rgba(20,15,10,${0.25 + dmg * 0.5})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(rock.x - rock.r * 0.5, rock.y - rock.r * 0.2);
        ctx.lineTo(rock.x + rock.r * 0.1, rock.y + rock.r * 0.3);
        ctx.lineTo(rock.x + rock.r * 0.5, rock.y - rock.r * 0.1);
        if (dmg > 0.5) {
          ctx.moveTo(rock.x - rock.r * 0.1, rock.y - rock.r * 0.5);
          ctx.lineTo(rock.x + rock.r * 0.2, rock.y + rock.r * 0.5);
        }
        ctx.stroke();
      }
    }
  }
}

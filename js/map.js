// Average position of a list of spawn points.
function centroid(points) {
  let sx = 0;
  let sy = 0;
  for (const p of points) { sx += p.x; sy += p.y; }
  return { x: sx / points.length, y: sy / points.length };
}

// Terrain. Solid obstacles block movement, bullets and line of sight:
//   - rocks: destructible (can be shattered by bullets/bombs, may drop items)
//   - mountains: indestructible
// Forests conceal whoever stands inside them. Rivers are passable but slow you.
class GameMap {
  constructor(stage) {
    // Stages are authored in the 960x600 design space; scale positions up to
    // fill the larger world. Obstacle radii are left unscaled so the bigger
    // world simply has more open room to manoeuvre.
    const sx = CONFIG.world.width / CONFIG.width;
    const sy = CONFIG.world.height / CONFIG.height;
    const sp = (p) => ({ x: p.x * sx, y: p.y * sy });

    this.rocks = stage.rocks.map((r) => ({
      x: r.x * sx, y: r.y * sy, r: r.r,
      hp: CONFIG.rock.hp, maxHp: CONFIG.rock.hp,
    }));
    this.mountains = (stage.mountains || []).map((m) => ({ x: m.x * sx, y: m.y * sy, r: m.r }));
    this.forests = stage.forests.map((f) => ({ x: f.x * sx, y: f.y * sy, r: f.r }));
    this.rivers = (stage.rivers || []).map((r) => ({
      x: r.x * sx, y: r.y * sy, w: r.w * sx, h: r.h * sy,
    }));

    this.blueSpawns = stage.blueSpawns.map(sp);
    this.redSpawns = stage.redSpawns.map(sp);

    // Home bases: a healing zone + a destructible fort core, centred on each
    // team's spawn cluster.
    const mkBase = (team, spawns) => ({
      team,
      ...centroid(spawns),
      r: CONFIG.base.radius,
      coreR: CONFIG.base.coreRadius,
      hp: CONFIG.base.hp,
      maxHp: CONFIG.base.hp,
    });
    this.bases = [
      mkBase("blue", this.blueSpawns),
      mkBase("red", this.redSpawns),
    ];
  }

  baseOf(team) {
    return this.bases.find((b) => b.team === team);
  }

  // The fort core hit by a point, if any (for bullet/bomb fort damage).
  baseCoreAt(x, y) {
    for (const b of this.bases) {
      if (b.hp > 0 && V.dist(x, y, b.x, b.y) <= b.coreR) return b;
    }
    return null;
  }

  inBase(x, y, team) {
    for (const b of this.bases) {
      if (b.team === team && V.dist(x, y, b.x, b.y) <= b.r) return true;
    }
    return false;
  }

  // All solid circular obstacles (rocks + mountains) for collision / sight.
  solids() {
    return this.rocks.concat(this.mountains);
  }

  // Does the straight line a->b cross any solid obstacle? (line-of-sight + bullets)
  blockedBetween(ax, ay, bx, by) {
    for (const o of this.solids()) {
      if (V.segmentHitsCircle(ax, ay, bx, by, o.x, o.y, o.r)) return true;
    }
    return false;
  }

  // Push a unit-sized circle out of any solid obstacle it overlaps.
  resolveCollision(x, y, radius) {
    let nx = x;
    let ny = y;
    for (const o of this.solids()) {
      const d = V.dist(nx, ny, o.x, o.y);
      const min = o.r + radius;
      if (d < min && d > 0) {
        const push = (min - d);
        nx += ((nx - o.x) / d) * push;
        ny += ((ny - o.y) / d) * push;
      } else if (d === 0) {
        nx += min; // degenerate: nudge sideways
      }
    }
    // Fort cores are solid too — you can't walk through the structure.
    for (const b of this.bases) {
      if (b.hp <= 0) continue;
      const d = V.dist(nx, ny, b.x, b.y);
      const min = b.coreR + radius;
      if (d < min && d > 0) {
        nx += ((nx - b.x) / d) * (min - d);
        ny += ((ny - b.y) / d) * (min - d);
      }
    }
    // Keep inside the world bounds.
    nx = V.clamp(nx, radius, CONFIG.world.width - radius);
    ny = V.clamp(ny, radius, CONFIG.world.height - radius);
    return { x: nx, y: ny };
  }

  inForest(x, y) {
    for (const f of this.forests) {
      if (V.dist(x, y, f.x, f.y) <= f.r) return true;
    }
    return false;
  }

  inRiver(x, y) {
    for (const r of this.rivers) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
    }
    return false;
  }

  // Apply damage to rocks within `radius` of a point (used by bombs). Mountains
  // are immune. Returns the list of rocks shattered by this hit.
  damageRocksInRadius(x, y, radius, amount) {
    const broken = [];
    for (const rock of this.rocks) {
      if (V.dist(x, y, rock.x, rock.y) <= radius + rock.r) {
        rock.hp -= amount;
        if (rock.hp <= 0) broken.push(rock);
      }
    }
    if (broken.length) this.rocks = this.rocks.filter((r) => !broken.includes(r));
    return broken;
  }

  draw(ctx) {
    const W = CONFIG.world.width;
    const H = CONFIG.world.height;
    // Ground texture: subtle grass grid.
    ctx.fillStyle = "#33472f";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(0,0,0,0.06)";
    ctx.lineWidth = 1;
    for (let gx = 0; gx <= W; gx += 48) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
    }
    for (let gy = 0; gy <= H; gy += 48) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    }

    // Rivers (under everything else).
    for (const r of this.rivers) {
      const grad = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
      grad.addColorStop(0, "rgba(60,130,200,0.55)");
      grad.addColorStop(0.5, "rgba(40,110,190,0.7)");
      grad.addColorStop(1, "rgba(60,130,200,0.55)");
      ctx.fillStyle = grad;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      // Ripple lines.
      ctx.strokeStyle = "rgba(220,240,255,0.25)";
      ctx.lineWidth = 1.5;
      for (let yy = r.y + 12; yy < r.y + r.h; yy += 22) {
        ctx.beginPath();
        for (let xx = r.x; xx < r.x + r.w; xx += 16) {
          ctx.lineTo(xx, yy + Math.sin(xx * 0.3) * 2);
        }
        ctx.stroke();
      }
    }

    // Home bases (healing zones), drawn on the ground.
    for (const b of this.bases) {
      const col = b.team === "blue" ? "47,123,255" : "255,77,77";
      const g = ctx.createRadialGradient(b.x, b.y, b.r * 0.2, b.x, b.y, b.r);
      g.addColorStop(0, `rgba(${col},0.28)`);
      g.addColorStop(1, `rgba(${col},0.04)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(${col},0.5)`;
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);

      // Fort core structure (the destructible target).
      if (b.hp > 0) {
        const cr = b.coreR;
        const cg = ctx.createRadialGradient(b.x - cr * 0.3, b.y - cr * 0.3, cr * 0.2, b.x, b.y, cr);
        cg.addColorStop(0, b.team === "blue" ? "#3a6bd6" : "#d64a4a");
        cg.addColorStop(1, b.team === "blue" ? "#1d2f6b" : "#6b1d1d");
        ctx.fillStyle = cg;
        ctx.fillRect(b.x - cr, b.y - cr, cr * 2, cr * 2);
        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.lineWidth = 3;
        ctx.strokeRect(b.x - cr, b.y - cr, cr * 2, cr * 2);
        // Battlements (top edge notches).
        ctx.fillStyle = b.team === "blue" ? "#2f7bff" : "#ff4d4d";
        for (let i = -1; i <= 1; i++) {
          ctx.fillRect(b.x + i * cr * 0.66 - cr * 0.18, b.y - cr - 6, cr * 0.36, 8);
        }
        // Durability gauge above the fort.
        const gw = cr * 2.4;
        const gx = b.x - gw / 2;
        const gy = b.y - cr - 20;
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(gx, gy, gw, 7);
        const pct = b.hp / b.maxHp;
        ctx.fillStyle = pct > 0.5 ? `rgb(${col})` : pct > 0.25 ? "#ffb347" : "#ff5a5a";
        ctx.fillRect(gx, gy, gw * pct, 7);
        ctx.strokeStyle = "rgba(0,0,0,0.6)";
        ctx.lineWidth = 1;
        ctx.strokeRect(gx, gy, gw, 7);
        // Label.
        ctx.fillStyle = `rgba(${col},0.95)`;
        ctx.font = "bold 12px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(b.team === "blue" ? "青の砦" : "赤の砦", b.x, gy - 8);
        ctx.textAlign = "left";
      } else {
        // Rubble when destroyed.
        ctx.fillStyle = "rgba(40,35,30,0.7)";
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(b.x + Math.cos(a) * b.coreR * 0.6, b.y + Math.sin(a) * b.coreR * 0.6, 7, 0, Math.PI * 2);
          ctx.fill();
        }
      }
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

  // Solid obstacles drawn on top so they overlap (hide) units behind them.
  drawSolids(ctx) {
    for (const rock of this.rocks) this._drawRock(ctx, rock);
    for (const m of this.mountains) this._drawMountain(ctx, m);
  }

  _drawRock(ctx, rock) {
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

    // Cracks grow as the rock takes damage.
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

  _drawMountain(ctx, m) {
    // Snow-capped rocky mound.
    const grad = ctx.createRadialGradient(
      m.x - m.r * 0.3, m.y - m.r * 0.4, m.r * 0.2,
      m.x, m.y, m.r
    );
    grad.addColorStop(0, "#8c8a86");
    grad.addColorStop(1, "#4a4742");
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 2;
    ctx.stroke();
    // Peak (snow).
    ctx.fillStyle = "rgba(245,248,255,0.85)";
    ctx.beginPath();
    ctx.moveTo(m.x, m.y - m.r * 0.7);
    ctx.lineTo(m.x - m.r * 0.32, m.y - m.r * 0.1);
    ctx.lineTo(m.x + m.r * 0.32, m.y - m.r * 0.1);
    ctx.closePath();
    ctx.fill();
  }
}

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
    const sx = CONFIG.world.width / CONFIG.design.width;
    const sy = CONFIG.world.height / CONFIG.design.height;
    const sp = (p) => ({ x: p.x * sx, y: p.y * sy });

    this.rocks = stage.rocks.map((r) => ({
      x: r.x * sx, y: r.y * sy, r: r.r,
      hp: CONFIG.rock.hp, maxHp: CONFIG.rock.hp,
    }));
    this.mountains = (stage.mountains || []).map((m) => ({ x: m.x * sx, y: m.y * sy, r: m.r }));
    this.forests = stage.forests.map((f) => ({ x: f.x * sx, y: f.y * sy, r: f.r * (CONFIG.forestScale || 1) }));
    this.rivers = (stage.rivers || []).map((r) => ({
      x: r.x * sx, y: r.y * sy, w: r.w * sx, h: r.h * sy,
    }));
    // Desert patches (passable; slow you down — handled by entities via inSand).
    this.sand = (stage.sand || []).map((s) => ({
      x: s.x * sx, y: s.y * sy, w: s.w * sx, h: s.h * sy,
    }));
    // Oases: neutral healing circles (passable; effect handled via inOasis).
    this.oases = (stage.oases || []).map((o) => ({ x: o.x * sx, y: o.y * sy, r: o.r * sx }));
    // Ledges (段差): raised ground that blocks normal units (they must go
    // around) but climber-class units can scale for a shortcut.
    this.ledges = (stage.ledges || []).map((l) => ({
      x: l.x * sx, y: l.y * sy, w: l.w * sx, h: l.h * sy,
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

    // Fortify each fort like a CASTLE: walls on all four sides so the enemy
    // can't just walk around the back. The only way in is two destructible
    // gates on the front (enemy-facing) wall — top & bottom. Allies pass gates
    // freely; the enemy must destroy a gate to break in.
    this.walls = [];   // {x,y,w,h} solid for everyone
    this.gates = [];   // {x,y,w,h,team,hp,maxHp}
    const HW = 340;    // half-width / half-height of the keep enclosure (world px)
    const HH = 340;    // big enough to hold the whole spawn cluster inside
    const wth = 26;    // wall thickness
    for (const b of this.bases) {
      const dir = b.team === "blue" ? 1 : -1;
      const left = b.x - HW;
      const right = b.x + HW;
      const top = b.y - HH;
      const bot = b.y + HH;
      // Walls/gates belong to the fort's team: ALLIES pass their own fort
      // freely (no pathfinding traps), only the ENEMY is blocked.
      const wall = (x, y, w, h) => this.walls.push({ x, y, w, h, team: b.team });
      // Top & bottom walls (full width) and the back wall (own-edge side).
      wall(left, top, 2 * HW, wth);
      wall(left, bot - wth, 2 * HW, wth);
      wall(dir > 0 ? left : right - wth, top, wth, 2 * HH);
      // Front (enemy-facing) wall with two gate gaps in the upper & lower thirds.
      const fx = dir > 0 ? right - wth : left;
      const segs = [
        { y0: top, y1: b.y - 150, gate: false },
        { y0: b.y - 150, y1: b.y - 70, gate: true },
        { y0: b.y - 70, y1: b.y + 70, gate: false },
        { y0: b.y + 70, y1: b.y + 150, gate: true },
        { y0: b.y + 150, y1: bot, gate: false },
      ];
      for (const s of segs) {
        const rect = { x: fx, y: s.y0, w: wth, h: s.y1 - s.y0 };
        if (s.gate) this.gates.push({ ...rect, team: b.team, hp: CONFIG.gate.hp, maxHp: CONFIG.gate.hp });
        else this.walls.push({ ...rect, team: b.team });
      }
    }
  }

  // Rect helpers --------------------------------------------------------------
  _pointInRect(x, y, r, pad) {
    pad = pad || 0;
    return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
  }
  // Push a circle (x,y,radius) out of rect r along the least-penetration axis.
  _pushOutRect(nx, ny, radius, r) {
    const minX = r.x - radius, maxX = r.x + r.w + radius;
    const minY = r.y - radius, maxY = r.y + r.h + radius;
    if (nx <= minX || nx >= maxX || ny <= minY || ny >= maxY) return null;
    const dl = nx - minX, dr = maxX - nx, dt = ny - minY, db = maxY - ny;
    const m = Math.min(dl, dr, dt, db);
    if (m === dl) return { x: minX, y: ny };
    if (m === dr) return { x: maxX, y: ny };
    if (m === dt) return { x: nx, y: minY };
    return { x: nx, y: maxY };
  }

  // A wall the point is inside (bullets stop on walls).
  wallAt(x, y) {
    for (const w of this.walls) {
      if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) return w;
    }
    return null;
  }

  // The enemy gate (relative to `team`) the point sits in, if any.
  enemyGateAt(x, y, team) {
    for (const g of this.gates) {
      if (g.hp > 0 && g.team !== team &&
          x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h) return g;
    }
    return null;
  }

  baseOf(team) {
    return this.bases.find((b) => b.team === team);
  }

  // 角丸の長方形パス（本丸の天端など）。
  _roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // 本丸の石垣（角丸の段々＋扇の勾配）。3/4で高さを出すため各段を上にずらし、各段の
  // 「天端（角丸四角）」と「勾配の壁面（下がすぼまる台形）」を石色で描く。返り値＝最上段の天端Y。
  _drawCastleBase(ctx, b, col) {
    const u = b.coreR;
    const tiers = [
      { rx: u * 5.6, ry: u * 3.0, lift: 0,       wallH: u * 1.7 },
      { rx: u * 4.0, ry: u * 2.2, lift: u * 1.7, wallH: u * 1.4 },
      { rx: u * 2.6, ry: u * 1.5, lift: u * 3.2, wallH: u * 1.2 },
    ];
    for (const t of tiers) {
      const cy = b.y - t.lift;
      // 勾配の壁面（下がすぼまる台形＝扇の勾配）。
      ctx.fillStyle = "#74695a";
      ctx.beginPath();
      ctx.moveTo(b.x - t.rx, cy);
      ctx.lineTo(b.x + t.rx, cy);
      ctx.lineTo(b.x + t.rx * 0.82, cy + t.wallH);
      ctx.lineTo(b.x - t.rx * 0.82, cy + t.wallH);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(38,32,24,0.6)"; ctx.lineWidth = 2; ctx.stroke();
      // 石目（横の積み目）。
      ctx.strokeStyle = "rgba(54,46,36,0.4)"; ctx.lineWidth = 1;
      for (let i = 1; i <= 2; i++) {
        const yy = cy + t.wallH * i / 3;
        const sx = t.rx * (1 - 0.06 * i);
        ctx.beginPath(); ctx.moveTo(b.x - sx, yy); ctx.lineTo(b.x + sx, yy); ctx.stroke();
      }
      // 天端（角丸四角の上面）。
      this._roundRect(ctx, b.x - t.rx, cy - t.ry, t.rx * 2, t.ry * 2, Math.min(t.rx, t.ry) * 0.5);
      ctx.fillStyle = "#a99c84"; ctx.fill();
      ctx.strokeStyle = "rgba(38,32,24,0.55)"; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.05)"; ctx.fill();
    }
    // チーム差し色のふち（最下段の天端＝青城/赤城を見分けやすく）。
    const bot = tiers[0];
    this._roundRect(ctx, b.x - bot.rx, b.y - bot.ry, bot.rx * 2, bot.ry * 2, Math.min(bot.rx, bot.ry) * 0.5);
    ctx.strokeStyle = `rgba(${col},0.55)`; ctx.lineWidth = 3; ctx.stroke();
    return b.y - tiers[tiers.length - 1].lift;
  }

  // ベクターの多層天守（fort スプライトが無いときのフォールバック）。白漆喰の壁＋
  // 黒瓦の屋根を段々に積み、最上層に金の鯱とチームの旗を立てる。返り値＝頂上のY。
  _drawKeep(ctx, b, baseY) {
    const cr = b.coreR;
    const cx = b.x;
    baseY = (baseY != null ? baseY : b.y) - cr * 0.2;
    const defs = [
      { w: cr * 3.0, h: cr * 1.5 },
      { w: cr * 2.1, h: cr * 1.2 },
      { w: cr * 1.35, h: cr * 1.0 },
    ];
    let y = baseY;
    for (const td of defs) {
      const wallTop = y - td.h;
      ctx.fillStyle = "#eae6dc"; // 白漆喰の壁
      ctx.fillRect(cx - td.w / 2, wallTop, td.w, td.h);
      ctx.strokeStyle = "rgba(40,40,46,0.5)"; ctx.lineWidth = 1.5;
      ctx.strokeRect(cx - td.w / 2, wallTop, td.w, td.h);
      ctx.fillStyle = "#2a2d33"; // 窓
      ctx.fillRect(cx - td.w * 0.2, wallTop + td.h * 0.3, td.w * 0.13, td.h * 0.4);
      ctx.fillRect(cx + td.w * 0.07, wallTop + td.h * 0.3, td.w * 0.13, td.h * 0.4);
      // 黒瓦の屋根（反りのある台形）
      ctx.fillStyle = "#3a3f47";
      ctx.beginPath();
      ctx.moveTo(cx - td.w / 2 - td.w * 0.2, wallTop);
      ctx.lineTo(cx + td.w / 2 + td.w * 0.2, wallTop);
      ctx.lineTo(cx + td.w * 0.28, wallTop - td.h * 0.55);
      ctx.lineTo(cx - td.w * 0.28, wallTop - td.h * 0.55);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(20,22,26,0.6)"; ctx.stroke();
      y = wallTop - td.h * 0.55;
    }
    ctx.fillStyle = "#e8c84a"; // 金の鯱
    ctx.beginPath(); ctx.arc(cx, y - 2, 3.2, 0, Math.PI * 2); ctx.fill();
    // チームの旗
    const flag = b.team === "blue" ? "#2f7bff" : "#ff4d4d";
    ctx.strokeStyle = flag; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx + cr * 1.0, baseY); ctx.lineTo(cx + cr * 1.0, y - 4); ctx.stroke();
    ctx.fillStyle = flag;
    ctx.fillRect(cx + cr * 1.0, y - 4, cr * 0.6, cr * 0.45);
    return y - 6;
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

  inLedge(x, y) {
    for (const l of this.ledges) {
      if (x >= l.x && x <= l.x + l.w && y >= l.y && y <= l.y + l.h) return true;
    }
    return false;
  }

  // Push a unit-sized circle out of any solid obstacle it overlaps. Non-climbers
  // are also blocked by ledges (climbers pass through them for a shortcut).
  resolveCollision(x, y, radius, canClimb, team) {
    let nx = x;
    let ny = y;
    // Fort walls block only the ENEMY team; allies pass their own fort freely.
    for (const w of this.walls) {
      if (w.team === team) continue;
      const out = this._pushOutRect(nx, ny, radius, w);
      if (out) { nx = out.x; ny = out.y; }
    }
    // Gates block the OPPOSING team until destroyed; allies pass freely.
    for (const g of this.gates) {
      if (g.hp <= 0 || g.team === team) continue;
      const out = this._pushOutRect(nx, ny, radius, g);
      if (out) { nx = out.x; ny = out.y; }
    }
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
    // Ledges block everyone but climber-class units.
    if (!canClimb) {
      for (const l of this.ledges) {
        const minX = l.x - radius;
        const maxX = l.x + l.w + radius;
        const minY = l.y - radius;
        const maxY = l.y + l.h + radius;
        if (nx > minX && nx < maxX && ny > minY && ny < maxY) {
          const dl = nx - minX;
          const dr = maxX - nx;
          const dtp = ny - minY;
          const dbt = maxY - ny;
          const m = Math.min(dl, dr, dtp, dbt);
          if (m === dl) nx = minX; else if (m === dr) nx = maxX;
          else if (m === dtp) ny = minY; else ny = maxY;
        }
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

  // Inside a desert patch? (passable; entities use this to slow movement.)
  inSand(x, y) {
    for (const s of this.sand) {
      if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return true;
    }
    return false;
  }

  // Inside any oasis circle? (passable; entities use this for neutral healing.)
  inOasis(x, y) {
    for (const o of this.oases) {
      if (V.dist(x, y, o.x, o.y) <= o.r) return true;
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

    // Desert patches (over the grass, under the water so riverbanks read as wet
    // sand). Broad sandy fill plus light grain + wind-ripple detail.
    for (const s of this.sand) {
      const sg = ctx.createLinearGradient(s.x, s.y, s.x, s.y + s.h);
      sg.addColorStop(0, "rgba(206,179,124,0.78)");
      sg.addColorStop(0.5, "rgba(201,176,121,0.82)");
      sg.addColorStop(1, "rgba(188,160,104,0.78)");
      ctx.fillStyle = sg;
      ctx.fillRect(s.x, s.y, s.w, s.h);
      // Wind ripples (gentle horizontal arcs across the patch).
      ctx.strokeStyle = "rgba(150,120,70,0.22)";
      ctx.lineWidth = 1.5;
      for (let yy = s.y + 16; yy < s.y + s.h; yy += 26) {
        ctx.beginPath();
        for (let xx = s.x; xx < s.x + s.w; xx += 14) {
          ctx.lineTo(xx, yy + Math.sin((xx + yy) * 0.08) * 3);
        }
        ctx.stroke();
      }
      // Scattered sand grains (deterministic stipple so it doesn't flicker).
      ctx.fillStyle = "rgba(235,214,160,0.5)";
      for (let yy = s.y + 8; yy < s.y + s.h; yy += 18) {
        for (let xx = s.x + 8; xx < s.x + s.w; xx += 22) {
          const j = Math.sin(xx * 12.9898 + yy * 78.233) * 43758.5453;
          const ox = (j - Math.floor(j)) * 12;
          const oy = (Math.cos(xx * 4.1 + yy * 7.7) * 0.5 + 0.5) * 10;
          ctx.fillRect(xx + ox, yy + oy, 1.5, 1.5);
        }
      }
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

      // 本丸の石垣：角丸の段々＋扇の勾配で「総石垣の城」に。最上段の天端Y（天守の足元）を得る。
      const platY = this._drawCastleBase(ctx, b, col);

      // 天守（破壊対象のコア）。fort_{team}.png があれば石垣の上に大きく聳えさせ、
      // 無ければベクター多層天守。足元に接地影を落として高さ感を出す。
      if (b.hp > 0) {
        const cr = b.coreR;
        const fimg = typeof Assets !== "undefined" && Assets.ready("fort_" + b.team)
          ? Assets.get("fort_" + b.team) : null;
        ctx.fillStyle = "rgba(0,0,0,0.3)"; // 接地影
        ctx.beginPath(); ctx.ellipse(b.x, platY + cr * 0.35, cr * 2.0, cr * 0.8, 0, 0, Math.PI * 2); ctx.fill();
        let keepTopY;
        if (fimg) {
          const s = cr * 12; // 一回り大きく聳える
          keepTopY = platY - s * 0.66;
          ctx.drawImage(fimg, b.x - s / 2, platY - s * 0.80, s, s); // 足元を石垣の天端に
        } else {
          keepTopY = this._drawKeep(ctx, b, platY);
        }
        // 耐久ゲージ（天守の上に）。
        const gw = cr * 3.4;
        const gx = b.x - gw / 2;
        const gy = keepTopY - 16;
        ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(gx, gy, gw, 7);
        const pct = b.hp / b.maxHp;
        ctx.fillStyle = pct > 0.5 ? `rgb(${col})` : pct > 0.25 ? "#ffb347" : "#ff5a5a";
        ctx.fillRect(gx, gy, gw * pct, 7);
        ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = 1; ctx.strokeRect(gx, gy, gw, 7);
        ctx.fillStyle = `rgba(${col},0.95)`; ctx.font = "bold 14px system-ui, sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(b.team === "blue" ? "青の城" : "赤の城", b.x, gy - 10);
        ctx.textAlign = "left";
      } else {
        // 落城：瓦礫。
        ctx.fillStyle = "rgba(40,35,30,0.72)";
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(b.x + Math.cos(a) * b.coreR * 1.4, b.y + Math.sin(a) * b.coreR * 1.4, 10, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Oases (neutral healing pools): grassy fringe ring, blue-green water, and a
    // bright water highlight. Drawn under forests/units (ground decoration).
    for (const o of this.oases) {
      // Grassy fringe around the pool.
      ctx.fillStyle = "rgba(70,140,75,0.7)";
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill();
      // Little tufts of reeds/grass around the rim.
      ctx.fillStyle = "rgba(95,165,90,0.85)";
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const rx = o.x + Math.cos(a) * o.r * 0.88;
        const ry = o.y + Math.sin(a) * o.r * 0.88;
        ctx.beginPath(); ctx.arc(rx, ry, o.r * 0.16, 0, Math.PI * 2); ctx.fill();
      }
      // Water body: blue-green radial gradient.
      const wr = o.r * 0.72;
      const wg = ctx.createRadialGradient(o.x, o.y, wr * 0.1, o.x, o.y, wr);
      wg.addColorStop(0, "rgba(120,210,200,0.95)");
      wg.addColorStop(0.6, "rgba(60,160,180,0.92)");
      wg.addColorStop(1, "rgba(40,120,150,0.9)");
      ctx.fillStyle = wg;
      ctx.beginPath(); ctx.arc(o.x, o.y, wr, 0, Math.PI * 2); ctx.fill();
      // Central water highlight (small bright pool / reflection).
      ctx.fillStyle = "rgba(225,250,250,0.55)";
      ctx.beginPath();
      ctx.arc(o.x - wr * 0.22, o.y - wr * 0.22, wr * 0.28, 0, Math.PI * 2);
      ctx.fill();
      // Label so it reads as a neutral recovery point.
      ctx.fillStyle = "rgba(20,60,70,0.85)";
      ctx.font = "bold 11px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("オアシス", o.x, o.y + o.r + 8);
      ctx.textAlign = "left";
    }

    // Ledges (段差): raised stone platforms — a shortcut only climbers can take.
    for (const l of this.ledges) {
      ctx.fillStyle = "rgba(0,0,0,0.28)"; // base shadow
      ctx.fillRect(l.x + 4, l.y + 6, l.w, l.h);
      const g = ctx.createLinearGradient(l.x, l.y, l.x, l.y + l.h);
      g.addColorStop(0, "#8a8378");
      g.addColorStop(1, "#5b554c");
      ctx.fillStyle = g;
      ctx.fillRect(l.x, l.y, l.w, l.h);
      ctx.fillStyle = "rgba(245,245,235,0.35)"; // lit top edge
      ctx.fillRect(l.x, l.y, l.w, 5);
      ctx.strokeStyle = "rgba(0,0,0,0.45)";
      ctx.lineWidth = 2;
      ctx.strokeRect(l.x, l.y, l.w, l.h);
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
    for (const w of this.walls) this._drawWall(ctx, w);
    for (const g of this.gates) this._drawGate(ctx, g);
  }

  _drawWall(ctx, w) {
    const grad = ctx.createLinearGradient(w.x, w.y, w.x + w.w, w.y);
    grad.addColorStop(0, "#7c756a");
    grad.addColorStop(1, "#4f493f");
    ctx.fillStyle = grad;
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = 2;
    ctx.strokeRect(w.x, w.y, w.w, w.h);
  }

  _drawGate(ctx, g) {
    const col = g.team === "blue" ? "#2f7bff" : "#ff4d4d";
    if (g.hp <= 0) {
      // Broken gate: faint rubble posts, passage open.
      ctx.fillStyle = "rgba(60,50,40,0.5)";
      ctx.fillRect(g.x, g.y, g.w, 6);
      ctx.fillRect(g.x, g.y + g.h - 6, g.w, 6);
      return;
    }
    ctx.fillStyle = "#6b4a2a"; // wooden gate
    ctx.fillRect(g.x, g.y, g.w, g.h);
    ctx.strokeStyle = col; // team trim
    ctx.lineWidth = 3;
    ctx.strokeRect(g.x, g.y, g.w, g.h);
    // Plank lines.
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 1;
    for (let yy = g.y + 10; yy < g.y + g.h; yy += 12) {
      ctx.beginPath(); ctx.moveTo(g.x, yy); ctx.lineTo(g.x + g.w, yy); ctx.stroke();
    }
    // Durability bar beside the gate.
    const pct = g.hp / g.maxHp;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(g.x - 6, g.y, 4, g.h);
    ctx.fillStyle = pct > 0.5 ? col : pct > 0.25 ? "#ffb347" : "#ff5a5a";
    ctx.fillRect(g.x - 6, g.y + g.h * (1 - pct), 4, g.h * pct);
    // 「城門」ラベル：砦本体のHPゲージと混同しないよう、門であることを明示。
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = "bold 10px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("城門", g.x + g.w / 2, g.y - 8);
    ctx.textAlign = "left";
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

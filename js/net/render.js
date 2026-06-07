// Renders a server snapshot for the LAN client. Reuses CONFIG/GameMap/Assets so
// terrain + sprites match the single-player build; entities are drawn directly
// from the compact snapshot (no local simulation).
const NetRender = {
  // Decide if `unit` (snapshot form) is visible to the viewer's team, applying
  // the same forest-stealth rule the single-player game uses.
  visible(u, snap, map, myTeam) {
    if (u.t === myTeam) return true;
    if (!map.inForest(u.x, u.y)) return true;
    for (const a of snap.u) {
      if (a.al && a.t === myTeam && V.dist(a.x, a.y, u.x, u.y) <= CONFIG.forestDetectRange) return true;
    }
    return false;
  },

  draw(ctx, snap, map, myIndex, cam) {
    const me = snap.u[myIndex];
    const myTeam = me ? me.t : 0;
    // Sync destructible fort HP so destroyed forts show as rubble.
    map.baseOf("blue").hp = snap.ft.b * map.baseOf("blue").maxHp;
    map.baseOf("red").hp = snap.ft.r * map.baseOf("red").maxHp;

    ctx.clearRect(0, 0, CONFIG.width, CONFIG.height);
    ctx.save();
    ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
    map.draw(ctx);
    this._capturePoints(ctx, snap);
    this._chests(ctx, snap);
    this._turrets(ctx, snap);
    this._beasts(ctx, snap);
    for (const b of snap.b) this._bullet(ctx, b);
    for (const u of snap.u) {
      if (!u.al) { this._wreck(ctx, u); continue; }
      if (!this.visible(u, snap, map, myTeam)) continue;
      this._unit(ctx, u, u.i === myIndex);
    }
    map.drawSolids(ctx);
    if (snap.sm) for (const s of snap.sm) this._smoke(ctx, s);
    for (const d of snap.d) this._blast(ctx, d, "#ff7a2c");
    for (const b of snap.bo) this._blast(ctx, b, "#ff8a3c");
    ctx.restore();
    this._minimap(ctx, snap, map, myIndex, cam);
  },

  _unit(ctx, u, isMe) {
    const team = u.t === 0 ? "blue" : "red";
    const cls = (typeof getClass === "function" && u.cl) ? getClass(u.cl) : null;
    const r = CONFIG.unit.radius * (cls ? (cls.sizeMul || 1) : 1);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath(); ctx.ellipse(u.x, u.y + r * 0.5, r * 1.05, r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.translate(u.x, u.y);
    ctx.rotate(u.a);
    const sprite = typeof Assets !== "undefined" && Assets.ready("soldier_" + team) ? Assets.get("soldier_" + team) : null;
    if (sprite) {
      const s = r * 5.2;
      ctx.drawImage(sprite, -s / 2, -s / 2, s, s);
    } else {
      ctx.fillStyle = team === "blue" ? "#2f7bff" : "#ff4d4d";
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#15181f";
      ctx.fillRect(r * 0.2, -r * 0.12, r * 1.2, r * 0.24);
    }
    ctx.restore();
    // Class accent ring + rank badge.
    if (cls) {
      ctx.strokeStyle = cls.accent; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(u.x, u.y, r + 3, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = cls.accent; ctx.font = "bold 10px system-ui, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(cls.badge, u.x, u.y - r - 0.5);
    }
    if (isMe) {
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(u.x, u.y, r + 7, 0, Math.PI * 2); ctx.stroke();
    }
    // HP bar + name.
    const w = 30;
    const mh = u.mh || CONFIG.unit.maxHp;
    ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(u.x - w / 2, u.y - r - 12, w, 4);
    ctx.fillStyle = team === "blue" ? "#7fb0ff" : "#ff8a8a";
    ctx.fillRect(u.x - w / 2, u.y - r - 12, w * (u.h / mh), 4);
    ctx.fillStyle = team === "blue" ? "#9cc2ff" : "#ff9c9c";
    ctx.font = "bold 12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText((isMe ? "★" : "") + u.n, u.x, u.y - r - 18);
    ctx.textAlign = "left";
  },

  _wreck(ctx, u) {
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = u.t === 0 ? "#2f7bff" : "#ff4d4d";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(u.x - 7, u.y - 7); ctx.lineTo(u.x + 7, u.y + 7);
    ctx.moveTo(u.x + 7, u.y - 7); ctx.lineTo(u.x - 7, u.y + 7);
    ctx.stroke();
    ctx.globalAlpha = 1;
  },

  _bullet(ctx, b) {
    if (b.f) {
      ctx.save(); ctx.globalAlpha = 0.8;
      const g = ctx.createRadialGradient(b.x, b.y, 1, b.x, b.y, 12);
      g.addColorStop(0, "#fff2a8"); g.addColorStop(0.4, "#ff9b2c"); g.addColorStop(1, "rgba(200,40,20,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, 12, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      return;
    }
    ctx.fillStyle = b.t === 0 ? "#bcd6ff" : "#ffd2c2";
    ctx.beginPath(); ctx.arc(b.x, b.y, CONFIG.bullet.radius, 0, Math.PI * 2); ctx.fill();
  },

  _blast(ctx, e, color) {
    if (!e.e) {
      ctx.fillStyle = "#1a1a1a";
      ctx.beginPath(); ctx.arc(e.x, e.y, 9, 0, Math.PI * 2); ctx.fill();
      return;
    }
    const R = e.fl > 360 ? CONFIG.dynamite.radius : CONFIG.bomb.radius;
    ctx.save(); ctx.globalAlpha = Math.max(0, e.fl / 400);
    const g = ctx.createRadialGradient(e.x, e.y, 4, e.x, e.y, R);
    g.addColorStop(0, "#fff2b0"); g.addColorStop(0.5, color); g.addColorStop(1, "rgba(255,80,40,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y, R, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  },

  _beasts(ctx, snap) {
    for (const b of snap.be) {
      const col = b.ty === "bear" ? "#6b4a32" : "#d98a2b";
      const r = b.ty === "bear" ? 23 : 18;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a);
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.15, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(r * 0.95, 0, r * 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffe14a";
      ctx.beginPath(); ctx.arc(r * 1.15, -r * 0.18, r * 0.08, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(r * 1.15, r * 0.18, r * 0.08, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(b.x - r, b.y - r - 10, r * 2, 4);
      ctx.fillStyle = "#caa14a"; ctx.fillRect(b.x - r, b.y - r - 10, r * 2 * b.h, 4);
    }
  },

  _smoke(ctx, s) {
    const a = Math.min(1, s.l / 1000) * 0.7;
    const g = ctx.createRadialGradient(s.x, s.y, s.r * 0.2, s.x, s.y, s.r);
    g.addColorStop(0, `rgba(210,210,215,${a})`);
    g.addColorStop(1, "rgba(180,180,190,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
  },

  _turrets(ctx, snap) {
    if (!snap.tr) return;
    for (const t of snap.tr) {
      const col = t.tm === 0 ? "#2f7bff" : "#ff4d4d";
      ctx.fillStyle = "#3a3f4a";
      ctx.beginPath(); ctx.arc(t.x, t.y, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(t.x, t.y, 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#15181f"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(t.x, t.y);
      ctx.lineTo(t.x + Math.cos(t.a) * 18, t.y + Math.sin(t.a) * 18); ctx.stroke();
      ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(t.x - 12, t.y - 20, 24, 3);
      ctx.fillStyle = col; ctx.fillRect(t.x - 12, t.y - 20, 24 * t.h, 3);
    }
  },

  _chests(ctx, snap) {
    for (const c of snap.c) {
      if (c.o) continue;
      ctx.fillStyle = "#caa14a"; ctx.fillRect(c.x - 12, c.y - 9, 24, 18);
      ctx.fillStyle = "#7a5a1a"; ctx.fillRect(c.x - 12, c.y - 3, 24, 4);
      ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 2; ctx.strokeRect(c.x - 12, c.y - 9, 24, 18);
    }
  },

  _capturePoints(ctx, snap) {
    for (const cp of snap.cp) {
      const col = cp.o === "blue" ? "47,123,255" : cp.o === "red" ? "255,77,77" : "210,200,150";
      const r = CONFIG.capture.radius;
      ctx.fillStyle = `rgba(${col},0.16)`;
      ctx.beginPath(); ctx.arc(cp.x, cp.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(${col},0.7)`; ctx.setLineDash([6, 6]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cp.x, cp.y, r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      if (cp.cb && cp.p > 0) {
        ctx.strokeStyle = cp.cb === "blue" ? "#4f9bff" : "#ff5a5a"; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(cp.x, cp.y, r - 6, -Math.PI / 2, -Math.PI / 2 + cp.p * Math.PI * 2); ctx.stroke();
      }
    }
  },

  _minimap(ctx, snap, map, myIndex, cam) {
    const mw = 170;
    const mh = mw * CONFIG.world.height / CONFIG.world.width;
    const ox = CONFIG.width - mw - 12;
    const oy = 12;
    const sx = mw / CONFIG.world.width;
    const sy = mh / CONFIG.world.height;
    ctx.save();
    ctx.fillStyle = "rgba(10,14,20,0.6)"; ctx.fillRect(ox, oy, mw, mh);
    ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.strokeRect(ox, oy, mw, mh);
    ctx.beginPath(); ctx.rect(ox, oy, mw, mh); ctx.clip();
    for (const b of map.bases) {
      ctx.fillStyle = b.team === "blue" ? "#2f7bff" : "#ff4d4d";
      ctx.fillRect(ox + b.x * sx - 3, oy + b.y * sy - 3, 6, 6);
    }
    const me = snap.u[myIndex];
    const myTeam = me ? me.t : 0;
    for (const u of snap.u) {
      if (!u.al) continue;
      if (u.t !== myTeam && !this.visible(u, snap, map, myTeam)) continue;
      ctx.fillStyle = u.i === myIndex ? "#fff" : (u.t === 0 ? "#7fb0ff" : "#ff8a8a");
      ctx.beginPath(); ctx.arc(ox + u.x * sx, oy + u.y * sy, u.i === myIndex ? 3 : 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 1;
    ctx.strokeRect(ox + cam.x * sx, oy + cam.y * sy, CONFIG.width * sx, CONFIG.height * sy);
    ctx.restore();
  },
};

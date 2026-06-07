// HUD overlay: name tags (world space) + minimap (screen space).
//
// Loaded as a plain <script> (no ES modules). Exposes a global `Overlay` with
// two pure drawing helpers. Nothing here touches the DOM at load time — the
// canvas context is only used inside the draw functions — so requiring this in
// Node (e.g. `node --check`) never throws.
//
// game.js calls these from its render pass:
//   - drawNames(ctx, game)   INSIDE the camera transform (world coords)
//   - drawMinimap(ctx, game) OUTSIDE it, after ctx.restore() (screen coords)
const Overlay = {
  // Per-team palettes used by both name tags and minimap dots.
  _colors: {
    blue: "#9cc2ff",
    red: "#ff9c9c",
  },

  // ---- 1) Name tags --------------------------------------------------------
  // Draw each living unit's name just above its head, in world coordinates.
  // Visibility follows game.unitVisibleToPlayer(u): hidden enemies (e.g. lurking
  // in a forest) get no tag, so the player can't read names they shouldn't see.
  drawNames(ctx, game) {
    if (!ctx || !game || !game.units) return;

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.font = "bold 12px system-ui, sans-serif";
    ctx.lineWidth = 3;

    for (const u of game.units) {
      if (!u || !u.alive) continue;
      // Respect fog-of-war: allies/self always show, hidden enemies don't.
      if (typeof game.unitVisibleToPlayer === "function" && !game.unitVisibleToPlayer(u)) {
        continue;
      }

      const base = u.name || (u.team === "blue" ? "BLUE" : "RED");
      const label = u.isPlayer ? "★" + base : base; // star-prefix the player

      // Sit above the unit, clear of the HP bar drawn at the unit's head.
      const x = u.x;
      const y = u.y - u.radius - 26;

      ctx.fillStyle = this._colors[u.team] || "#ffffff";
      ctx.strokeStyle = "rgba(0,0,0,0.7)"; // shadow/outline for readability
      ctx.strokeText(label, x, y);
      ctx.fillText(label, x, y);
    }

    ctx.restore();
  },

  // ---- 2) Minimap ----------------------------------------------------------
  // Draw a small overview in the top-right corner, in SCREEN coordinates.
  // The world is scaled to fit a fixed width; height follows the world ratio.
  drawMinimap(ctx, game) {
    if (!ctx || !game || !game.map || typeof CONFIG === "undefined") return;

    const world = CONFIG.world;
    const mapW = 170;
    const mapH = mapW * (world.height / world.width);
    const pad = 12;
    const ox = CONFIG.width - mapW - pad; // top-left of the minimap, on screen
    const oy = pad;

    // World -> minimap helpers.
    const sx = mapW / world.width;
    const sy = mapH / world.height;
    const mx = (wx) => ox + wx * sx;
    const my = (wy) => oy + wy * sy;
    const dot = (wx, wy, r, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(mx(wx), my(wy), r, 0, Math.PI * 2);
      ctx.fill();
    };

    ctx.save();

    // Panel background + frame.
    ctx.fillStyle = "rgba(10,14,20,0.6)";
    ctx.fillRect(ox, oy, mapW, mapH);
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(ox, oy, mapW, mapH);

    // Clip so terrain/markers never spill outside the panel.
    ctx.beginPath();
    ctx.rect(ox, oy, mapW, mapH);
    ctx.clip();

    const map = game.map;

    // Forests: light green circles (drawn first, under everything).
    if (map.forests) {
      ctx.fillStyle = "rgba(80,170,90,0.30)";
      for (const f of map.forests) {
        ctx.beginPath();
        ctx.arc(mx(f.x), my(f.y), Math.max(1, f.r * sx), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Mountains: dark grey dots.
    if (map.mountains) {
      for (const m of map.mountains) dot(m.x, m.y, 2, "#555a60");
    }

    // Oases (optional): cyan dots.
    if (map.oases) {
      for (const o of map.oases) dot(o.x, o.y, 2, "#5ad6ff");
    }

    // Chests (optional): gold dots.
    if (game.chests) {
      for (const c of game.chests) {
        if (c && !c.dead) dot(c.x, c.y, 2.5, "#ffd24a");
      }
    }

    // Bases/forts: team-coloured squares at the core position.
    if (map.bases) {
      for (const b of map.bases) {
        ctx.fillStyle = b.team === "blue" ? "#2f7bff" : "#ff4d4d";
        const s = 5;
        ctx.fillRect(mx(b.x) - s / 2, my(b.y) - s / 2, s, s);
        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.lineWidth = 1;
        ctx.strokeRect(mx(b.x) - s / 2, my(b.y) - s / 2, s, s);
      }
    }

    // Units: allies blue, self white-ringed, visible enemies red.
    if (game.units) {
      const canSee = typeof game.unitVisibleToPlayer === "function";
      const playerTeam = game.playerTeam;
      for (const u of game.units) {
        if (!u || !u.alive) continue;
        const friendly = u.team === playerTeam || u.isPlayer;
        if (!friendly && canSee && !game.unitVisibleToPlayer(u)) continue; // hide unseen enemies

        if (u.isPlayer) {
          dot(u.x, u.y, 3.2, this._colors.blue);
          ctx.strokeStyle = "#ffffff"; // white ring marks the human player
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(mx(u.x), my(u.y), 3.6, 0, Math.PI * 2);
          ctx.stroke();
        } else if (friendly) {
          dot(u.x, u.y, 2.6, "#5a9bff");
        } else {
          dot(u.x, u.y, 2.6, "#ff5a5a");
        }
      }
    }

    // Current viewport rectangle (camera window) in white.
    if (game.cam) {
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 1;
      ctx.strokeRect(
        mx(game.cam.x),
        my(game.cam.y),
        CONFIG.width * sx,
        CONFIG.height * sy
      );
    }

    ctx.restore();
  },
};

// Make the global available under CommonJS too, without breaking browser use.
if (typeof module !== "undefined" && module.exports) {
  module.exports = Overlay;
}

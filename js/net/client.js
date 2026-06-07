// LAN client: connect to the server, pick a slot, send input, render snapshots.
(function () {
  const canvas = document.getElementById("game");
  function setViewport() {
    const app = document.getElementById("app");
    const w = Math.round(app.clientWidth);
    const h = Math.round(app.clientHeight);
    if (w > 0 && h > 0) {
      const touch = ("ontouchstart" in window) || navigator.maxTouchPoints > 0;
      const s = touch ? 1.25 : 1; // スマホは内部解像度を上げCSSで縮小＝広く見せる
      canvas.width = Math.round(w * s);
      canvas.height = Math.round(h * s);
      CONFIG.width = canvas.width;
      CONFIG.height = canvas.height;
    }
  }
  setViewport();
  window.addEventListener("resize", setViewport);
  window.addEventListener("orientationchange", setViewport);
  Input.init(canvas);
  Input.initTouch({
    joystick: document.getElementById("joystick"),
    knob: document.getElementById("knob"),
    aimStick: document.getElementById("aimStickEl"),
    aimKnob: document.getElementById("aimKnob"),
    bomb: document.getElementById("btnBomb"),
    weapon: document.getElementById("btnWeapon"),
    ability: document.getElementById("btnAbility"),
  });
  Assets.load();

  const Net = {
    ws: null, stage: 0, map: null, snap: null,
    myIndex: -1, myTeam: 0, joined: false,
    cam: { x: 0, y: 0 },
  };

  const statusEl = document.getElementById("netStatus");
  function setStatus(t) { if (statusEl) statusEl.textContent = t; }

  function connect() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}`);
    Net.ws = ws;
    ws.onopen = () => setStatus("接続しました。スロットを選んでください。");
    ws.onclose = () => setStatus("切断されました。再読み込みしてください。");
    ws.onerror = () => setStatus("接続エラー。サーバーが起動しているか確認してください。");
    ws.onmessage = (ev) => handle(JSON.parse(ev.data));
  }

  function handle(m) {
    if (m.type === "static") {
      Net.stage = m.stage;
      Net.map = new GameMap(STAGES[m.stage]);
      bannerT = 0; banner = ""; // 新しい試合が始まったら勝敗表示を消す
    } else if (m.type === "lobby") {
      renderLobby(m.roster);
    } else if (m.type === "you") {
      Net.myIndex = m.i; Net.myTeam = m.team; Net.joined = true;
      document.getElementById("lobby").classList.add("hidden");
    } else if (m.type === "snap") {
      Net.snap = m.s;
    } else if (m.type === "end") {
      flashBanner(m.win ? "青チーム勝利！" : "赤チーム勝利！");
    } else if (m.type === "slotTaken") {
      setStatus("そのスロットは使用中です。別を選んでください。");
    }
  }

  // --- lobby ----------------------------------------------------------------
  function renderLobby(roster) {
    for (const team of ["blue", "red"]) {
      const col = document.getElementById(team + "Slots");
      if (!col) continue;
      col.innerHTML = "";
      roster[team].forEach((slot, i) => {
        const c = (typeof CLASSES !== "undefined") ? CLASSES[i % CLASSES.length] : null;
        const cl = c ? `${c.badge}${c.label}` : "";
        const btn = document.createElement("button");
        btn.className = "slot-btn " + team + (slot.human ? " taken" : "");
        if (c) btn.style.borderLeftColor = c.accent;
        btn.innerHTML = `<b>${slot.name} <small style="color:${c ? c.accent : "#aaa"}">${cl}</small></b>`
          + `<span>${slot.human ? "人間" : "AI"}${c && c.canClimb ? " ・段差OK" : ""}</span>`;
        btn.addEventListener("click", () => {
          const name = (document.getElementById("nameInput").value || "Player").trim();
          Net.ws.send(JSON.stringify({ type: "pick", team, slot: i, name }));
          Sound.start();
        });
        col.appendChild(btn);
      });
    }
  }

  let banner = "";
  let bannerT = 0;
  function flashBanner(t) { banner = t; bannerT = 3500; }

  // --- input loop (30 Hz) ---------------------------------------------------
  setInterval(() => {
    if (!Net.joined || !Net.ws || Net.ws.readyState !== 1 || !Net.snap) return;
    const me = Net.snap.u[Net.myIndex];
    if (!me) return;
    const { dx, dy } = Input.moveVector();
    let aim;
    if (Input.isTouch) {
      // Manual aim stick (right-side drag); otherwise face movement / keep aim.
      if (Input.aimStick && Input.aimStick.active) {
        aim = Math.atan2(Input.aimStick.dy, Input.aimStick.dx);
      } else if (dx !== 0 || dy !== 0) {
        aim = Math.atan2(dy, dx);
      } else {
        aim = me.a;
      }
    } else {
      aim = Math.atan2(Input.mouseY + Net.cam.y - me.y, Input.mouseX + Net.cam.x - me.x);
    }
    Net.ws.send(JSON.stringify({
      type: "input", mx: dx, my: dy, aim,
      shoot: Input.shooting,
      bomb: Input.consumeBomb(),
      ability: Input.consumeAbility(),
      slot: Input.consumeWeaponSlot(),
      cycleW: Input.consumeWeaponCycle(),
    }));
  }, 33);

  // --- render loop ----------------------------------------------------------
  const ctx = canvas.getContext("2d");

  // 画面上部に弾数・HP・人数・砦ゲージを表示（単独プレイのHUD相当を簡易版で）。
  function drawHud(ctx, snap, myIndex) {
    const pad = 14;
    ctx.save();
    ctx.textBaseline = "top";
    // 残り人数（青/赤）。
    ctx.font = "bold 16px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = "#9cc2ff"; ctx.fillText("青 " + (snap.al ? snap.al.b : "-"), pad, pad);
    ctx.fillStyle = "#ff9c9c"; ctx.fillText("赤 " + (snap.al ? snap.al.r : "-"), pad + 64, pad);
    // 砦ゲージ（青/赤）。
    if (snap.ft) {
      const bw = 90, bh = 8, y = pad + 24;
      const bar = (x, frac, col) => {
        ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(x, y, bw, bh);
        ctx.fillStyle = col; ctx.fillRect(x, y, bw * Math.max(0, frac), bh);
      };
      ctx.font = "bold 11px system-ui, sans-serif";
      ctx.fillStyle = "#9cc2ff"; ctx.fillText("🏰青", pad, y - 12); bar(pad + 30, snap.ft.b, "#2f7bff");
      ctx.fillStyle = "#ff9c9c"; ctx.fillText("🏰赤", pad + 140, y - 12); bar(pad + 170, snap.ft.r, "#ff4d4d");
    }
    // 自分の弾数・武器・HP。
    const me = snap.u[myIndex];
    if (me) {
      const wlabel = (typeof WEAPONS !== "undefined" && WEAPONS[me.w]) ? WEAPONS[me.w].label : (me.w || "");
      ctx.textAlign = "left";
      ctx.font = "bold 20px system-ui, sans-serif";
      if (me.rl) { ctx.fillStyle = "#ffd34a"; ctx.fillText("リロード中…", pad, pad + 48); }
      else {
        ctx.fillStyle = (me.am <= 3) ? "#ff7a7a" : "#ffffff";
        ctx.fillText("弾 " + me.am + "/" + me.mg, pad, pad + 48);
      }
      ctx.fillStyle = "#cfe3ff"; ctx.font = "bold 13px system-ui, sans-serif";
      ctx.fillText(wlabel, pad, pad + 74);
      // HPバー。
      const hw = 120, hh = 7, hy = pad + 94;
      ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(pad, hy, hw, hh);
      const frac = me.mh ? Math.max(0, me.h / me.mh) : 0;
      ctx.fillStyle = frac > 0.4 ? "#62e08a" : "#ff5a5a";
      ctx.fillRect(pad, hy, hw * frac, hh);
    }
    ctx.restore();
  }

  function frame(now) {
    if (Net.joined && Net.snap && Net.map) {
      const me = Net.snap.u[Net.myIndex];
      if (me) {
        Net.cam.x = V.clamp(me.x - CONFIG.width / 2, 0, CONFIG.world.width - CONFIG.width);
        Net.cam.y = V.clamp(me.y - CONFIG.height / 2, 0, CONFIG.world.height - CONFIG.height);
      }
      NetRender.draw(ctx, Net.snap, Net.map, Net.myIndex, Net.cam);
      drawHud(ctx, Net.snap, Net.myIndex);
      if (bannerT > 0) {
        bannerT -= 16;
        ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(0, CONFIG.height / 2 - 30, CONFIG.width, 60);
        ctx.fillStyle = "#fff"; ctx.font = "bold 30px system-ui, sans-serif"; ctx.textAlign = "center";
        ctx.fillText(banner, CONFIG.width / 2, CONFIG.height / 2 + 10); ctx.textAlign = "left";
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  document.getElementById("muteBtn").addEventListener("click", () => {
    const muted = Sound.toggleMute();
    document.getElementById("muteBtn").textContent = muted ? "🔇" : "🔊";
  });

  connect();
})();

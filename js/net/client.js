// LAN client: connect to the server, pick a slot, send input, render snapshots.
(function () {
  const canvas = document.getElementById("game");
  Input.init(canvas);
  Input.initTouch({
    joystick: document.getElementById("joystick"),
    knob: document.getElementById("knob"),
    fire: document.getElementById("btnFire"),
    bomb: document.getElementById("btnBomb"),
    dynamite: document.getElementById("btnDynamite"),
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
      // Auto-aim the nearest visible enemy on touch.
      let best = null; let bd = Infinity;
      for (const u of Net.snap.u) {
        if (!u.al || u.t === Net.myTeam) continue;
        if (!NetRender.visible(u, Net.snap, Net.map, Net.myTeam)) continue;
        const d = V.dist(me.x, me.y, u.x, u.y);
        if (d < bd) { bd = d; best = u; }
      }
      aim = best ? Math.atan2(best.y - me.y, best.x - me.x) : me.a;
    } else {
      aim = Math.atan2(Input.mouseY + Net.cam.y - me.y, Input.mouseX + Net.cam.x - me.x);
    }
    Net.ws.send(JSON.stringify({
      type: "input", mx: dx, my: dy, aim,
      shoot: Input.shooting,
      bomb: Input.consumeBomb(),
      dyn: Input.consumeDynamite(),
      ability: Input.consumeAbility(),
      slot: Input.consumeWeaponSlot(),
      cycleW: Input.consumeWeaponCycle(),
    }));
  }, 33);

  // --- render loop ----------------------------------------------------------
  const ctx = canvas.getContext("2d");
  function frame(now) {
    if (Net.joined && Net.snap && Net.map) {
      const me = Net.snap.u[Net.myIndex];
      if (me) {
        Net.cam.x = V.clamp(me.x - CONFIG.width / 2, 0, CONFIG.world.width - CONFIG.width);
        Net.cam.y = V.clamp(me.y - CONFIG.height / 2, 0, CONFIG.world.height - CONFIG.height);
      }
      NetRender.draw(ctx, Net.snap, Net.map, Net.myIndex, Net.cam);
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

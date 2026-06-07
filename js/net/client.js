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
    ctrlSize: document.getElementById("btnCtrlSize"),
  });
  Assets.load();

  const Net = {
    ws: null, stage: 0, map: null, snap: null,
    myIndex: -1, myTeam: 0, joined: false,
    myId: null, host: null, started: false,
    difficulty: "normal", // AI難易度（ホストが選ぶ。全員に共有される）
    lobbyStage: 0,        // ロビーでホストが選んだ次戦ステージ（試合中の Net.stage とは別）
    cam: { x: 0, y: 0 },
  };

  // クラスの「得意なこと」一言（HUD表示用。ui.js はネット版では読まないので独自に持つ）。
  const CLASS_TRAIT = {
    general: "総大将・最も頑丈",
    ashigaru: "刀の標準前衛",
    archer: "弓・装填不要",
    gunner: "鉄砲・一撃重い",
    cavalry: "突進する刀",
    ninja: "森に潜む＋煙幕",
  };

  const statusEl = document.getElementById("netStatus");
  function setStatus(t) { if (statusEl) statusEl.textContent = t; }

  // 開始ボタン（ホストのみ表示）→ サーバーに開始を要求。
  const _smb = document.getElementById("startMatchBtn");
  if (_smb) _smb.addEventListener("click", () => {
    if (Net.ws && Net.ws.readyState === 1) Net.ws.send(JSON.stringify({ type: "start" }));
    Sound.start();
  });

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
    if (m.type === "hello") {
      Net.myId = m.id;
    } else if (m.type === "static") {
      Net.stage = m.stage;
      Net.map = new GameMap(STAGES[m.stage]);
      bannerT = 0; banner = ""; // 新しい試合が始まったら勝敗表示を消す
    } else if (m.type === "lobby") {
      Net.host = m.host; Net.started = !!m.started;
      if (m.diff) Net.difficulty = m.diff;
      if (typeof m.stage === "number") Net.lobbyStage = m.stage;
      renderLobby(m.roster);
      renderDifficulty();
      renderStage();
      // ロビーを隠すのは「試合中 かつ 自分が参加済み」のときだけ。試合中でも
      // 未参加（再入場でスロットを失った／後から来た）なら出したままにして、空き
      // スロットを選んで途中参加できるようにする（戻る→再入場の死に画面を防ぐ）。
      document.getElementById("lobby").classList.toggle("hidden", Net.started && Net.joined);
    } else if (m.type === "you") {
      Net.myIndex = m.i; Net.myTeam = m.team; Net.joined = true;
      // スロットを選んでも、試合が始まるまではロビーで待機（途中参加防止）。
      if (Net.started) document.getElementById("lobby").classList.add("hidden");
    } else if (m.type === "start") {
      Net.started = true;
      // 参加済みの人だけロビーを閉じる。未参加の人はロビーのまま（途中参加可）。
      if (Net.joined) document.getElementById("lobby").classList.add("hidden");
    } else if (m.type === "snap") {
      Net.snap = m.s;
    } else if (m.type === "end") {
      Net.started = false;
      flashBanner(m.win ? "青チーム勝利！" : "赤チーム勝利！");
      document.getElementById("lobby").classList.remove("hidden"); // 待機ロビーに戻る
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
        // ラベルだけを使う（badge はラベル先頭の漢字と同じなので連結すると「突突撃兵」
        // のように重なってしまう）。
        const cl = c ? c.label : "";
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
    updateStartUI();
  }

  // ホストには「ゲーム開始」ボタン、それ以外には待機メッセージを出す。
  function updateStartUI() {
    const btn = document.getElementById("startMatchBtn");
    const note = document.getElementById("startNote");
    const isHost = Net.myId != null && Net.myId === Net.host;
    const joined = Net.joined;
    if (btn) {
      const canStart = isHost && joined && !Net.started;
      btn.classList.toggle("hidden", !canStart);
    }
    if (note) {
      if (Net.started && !joined) note.textContent = "試合中です。スロット（キャラ）を選ぶと途中から参加できます。";
      else if (Net.started) note.textContent = "";
      else if (!joined) note.textContent = "上でスロット（キャラ）を選んでください。";
      else if (isHost) note.textContent = "全員そろったら「ゲーム開始」を押してください。";
      else note.textContent = "ホストの開始を待っています…";
    }
  }

  // AI難易度セレクタ。全員に現在の難易度を見せ、変更できるのはホストのみ
  // （他の人のボタンは無効表示）。クリックでサーバーへ難易度変更を要求する。
  function renderDifficulty() {
    const box = document.getElementById("diffButtons");
    if (!box || typeof DIFFICULTY_ORDER === "undefined") return;
    const isHost = Net.myId != null && Net.myId === Net.host;
    box.innerHTML = "";
    for (const key of DIFFICULTY_ORDER) {
      const btn = document.createElement("button");
      btn.className = "diff-btn" + (Net.difficulty === key ? " active" : "");
      btn.textContent = (typeof DIFFICULTY_LABEL !== "undefined" && DIFFICULTY_LABEL[key]) || key;
      btn.disabled = !isHost || Net.started;
      btn.addEventListener("click", () => {
        if (!Net.ws || Net.ws.readyState !== 1) return;
        Net.ws.send(JSON.stringify({ type: "difficulty", level: key }));
        Sound.start();
      });
      box.appendChild(btn);
    }
    // ホスト以外には「ホストが設定」と分かるよう、ラベルを補足する。
    const sel = document.getElementById("diffSelect");
    if (sel) sel.classList.toggle("not-host", !isHost);
  }

  // ステージセレクタ（難易度と同じ作法）。変更できるのはホスト・待機中のみ。
  function renderStage() {
    const box = document.getElementById("stageButtons");
    if (!box || typeof STAGE_ORDER === "undefined") return;
    const isHost = Net.myId != null && Net.myId === Net.host;
    box.innerHTML = "";
    for (const i of STAGE_ORDER) {
      const btn = document.createElement("button");
      btn.className = "diff-btn stage-btn" + (Net.lobbyStage === i ? " active" : "");
      btn.textContent = (typeof STAGE_LABEL !== "undefined" && STAGE_LABEL[i]) || ("STAGE " + (i + 1));
      btn.disabled = !isHost || Net.started;
      btn.addEventListener("click", () => {
        if (!Net.ws || Net.ws.readyState !== 1) return;
        Net.ws.send(JSON.stringify({ type: "stage", index: i }));
        Sound.start();
      });
      box.appendChild(btn);
    }
    const sel = document.getElementById("stageSelect");
    if (sel) sel.classList.toggle("not-host", !isHost);
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
      if (me.nr) {
        // 装填不要（刀/弓）は弾数を出さず、武器名だけ大きく表示。
        ctx.fillStyle = "#ffffff"; ctx.fillText(wlabel, pad, pad + 48);
      } else if (me.rl) {
        ctx.fillStyle = "#ffd34a"; ctx.fillText("装填中…", pad, pad + 48);
      } else {
        ctx.fillStyle = (me.am <= 3) ? "#ff7a7a" : "#ffffff";
        ctx.fillText("弾 " + me.am + "/" + me.mg, pad, pad + 48);
      }
      if (!me.nr) {
        ctx.fillStyle = "#cfe3ff"; ctx.font = "bold 13px system-ui, sans-serif";
        ctx.fillText(wlabel, pad, pad + 74);
      }
      // クラスの得意なこと（操作中に何が得意か分かるように）。
      const cls = (typeof getClass === "function") ? getClass(me.cl) : null;
      if (cls) {
        ctx.fillStyle = "#b9f27c"; ctx.font = "bold 12px system-ui, sans-serif";
        ctx.fillText(cls.badge + " " + cls.label + "：" + (CLASS_TRAIT[me.cl] || ""), pad, pad + 94);
      }
      // 自軍の総大将の状態（0健在/1危機/2討死）。危機・討死は赤で警告。
      if (snap.gen) {
        const gs = me.t === 0 ? snap.gen.b : snap.gen.r;
        const gtxt = gs === 0 ? "大将：健在" : gs === 1 ? "大将：危機！(救出せよ)" : "大将：討死…(サドンデス)";
        ctx.fillStyle = gs === 0 ? "#ffd24a" : "#ff5a5a";
        ctx.font = "bold 13px system-ui, sans-serif";
        ctx.fillText(gtxt, pad, pad + 114);
      }
      // HPバー。
      const hw = 120, hh = 7, hy = pad + 134;
      ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(pad, hy, hw, hh);
      const frac = me.mh ? Math.max(0, me.h / me.mh) : 0;
      ctx.fillStyle = frac > 0.4 ? "#62e08a" : "#ff5a5a";
      ctx.fillRect(pad, hy, hw * frac, hh);
      ctx.fillStyle = "#cfe3ff"; ctx.font = "bold 10px system-ui, sans-serif"; ctx.fillText("HP", pad + hw + 6, hy - 1);
      // 体力（スタミナ）バー：全クラス表示。攻撃で減り、低いと移動が鈍る。
      // 体力が一定以下だと攻撃できない＝息切れ（連打抑止の駆け引き）。
      if (typeof me.st === "number") {
        const sy = hy + hh + 3;
        const winded = me.st < 0.34;
        ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(pad, sy, hw, 5);
        ctx.fillStyle = winded ? "#ff5a5a" : (me.st > 0.6 ? "#ffd24a" : "#ffb24a"); ctx.fillRect(pad, sy, hw * me.st, 5);
        ctx.font = "bold 10px system-ui, sans-serif";
        ctx.fillStyle = winded ? "#ff5a5a" : "#cfe3ff"; ctx.fillText(winded ? "息切れ!" : "体力", pad + hw + 6, sy - 1);
      }
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

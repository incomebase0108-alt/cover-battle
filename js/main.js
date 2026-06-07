// Bootstraps everything and wires the buttons to the game flow.
(function () {
  const BUILD = "v10 手動エイム(右ドラッグ)";
  const bt = document.getElementById("buildTag");
  if (bt) bt.textContent = "(" + BUILD + ")";
  try { console.log("Cover Battle build:", BUILD); } catch (e) {}

  const canvas = document.getElementById("game");

  // Make the playfield fill the actual screen (portrait phones included). The
  // camera/render read CONFIG.width/height live, so updating them here reflows
  // everything to the device size.
  function setViewport() {
    const app = document.getElementById("app");
    const w = Math.round(app.clientWidth);
    const h = Math.round(app.clientHeight);
    if (w > 0 && h > 0) {
      canvas.width = w; canvas.height = h;
      CONFIG.width = w; CONFIG.height = h;
    }
  }
  setViewport();
  window.addEventListener("resize", setViewport);
  window.addEventListener("orientationchange", setViewport);

  Input.init(canvas);
  Input.initAim(canvas); // manual aim stick (touch)
  UI.init();
  Assets.load(); // Blender-rendered sprites (falls back to canvas art if absent)

  // Hook up on-screen mobile controls.
  Input.initTouch({
    joystick: document.getElementById("joystick"),
    knob: document.getElementById("knob"),
    fire: document.getElementById("btnFire"),
    bomb: document.getElementById("btnBomb"),
    lock: document.getElementById("btnLock"),
    cycle: document.getElementById("btnCycle"),
    weapon: document.getElementById("btnWeapon"),
    dynamite: document.getElementById("btnDynamite"),
    ability: document.getElementById("btnAbility"),
  });

  // Mute / unmute BGM + SFX.
  const muteBtn = document.getElementById("muteBtn");
  if (muteBtn) {
    muteBtn.addEventListener("click", () => {
      const muted = Sound.toggleMute();
      muteBtn.textContent = muted ? "🔇" : "🔊";
    });
  }

  let game = null;
  let nextAction = "start";
  let playerIndex = 0; // chosen character slot, kept across stages

  function newGameAt(index) {
    game = new Game(canvas, {
      onHud: (state) => UI.updateHud(state),
      onEnd: (win, hasNext, stageIndex) => {
        if (win) Sound.victory(); else Sound.defeat();
        UI.showResult(win, hasNext, stageIndex);
        if (win) {
          nextAction = hasNext ? { type: "stage", index: stageIndex + 1 } : { type: "restart" };
        } else {
          nextAction = { type: "stage", index: stageIndex };
        }
      },
    });
    game.sound = Sound;
    game.playerIndex = playerIndex;
    game.loadStage(index);
    // On touch devices, default to lock-on so aiming is one-button.
    if (Input.isTouch) {
      const p = game.units.find((u) => u.isPlayer);
      if (p) { p.lockMode = true; p.lockTarget = game.nearestVisibleEnemy(p); }
    }
    game.start();
  }

  // Build the character-select grid (6 blue slots; slot also picks the weapon).
  function showCharSelect() {
    Sound.start();
    UI.showStart(false);
    const grid = document.getElementById("charGrid");
    grid.innerHTML = "";
    const n = CONFIG.teamSize || 6;
    for (let i = 0; i < n; i++) {
      const c = (typeof CLASSES !== "undefined") ? CLASSES[i % CLASSES.length] : null;
      const wl = c && WEAPONS[c.weapon] ? WEAPONS[c.weapon].label : "";
      const stats = c
        ? `速度${Math.round((c.speedMul || 1) * 100)}% / HP${Math.round((c.hpMul || 1) * 100)}% / ${wl}${c.canClimb ? " / 段差OK" : ""}`
        : "";
      const btn = document.createElement("button");
      btn.className = "char-card";
      btn.style.borderColor = c ? c.accent : "";
      btn.innerHTML = `<b style="color:${c ? c.accent : "#9cc2ff"}">${c ? c.badge + " " + c.label : "青" + (i + 1)}</b>`
        + `<span class="cdesc">${c ? c.desc : ""}</span><span class="cstat">${stats}</span>`;
      btn.addEventListener("click", () => {
        playerIndex = i;
        document.getElementById("charSelect").classList.add("hidden");
        UI.hideResult();
        UI.showHud(true);
        newGameAt(0);
      });
      grid.appendChild(btn);
    }
    document.getElementById("charSelect").classList.remove("hidden");
  }

  document.getElementById("startBtn").addEventListener("click", showCharSelect);

  document.getElementById("nextBtn").addEventListener("click", () => {
    Sound.start();
    UI.hideResult();
    if (nextAction.type === "restart") {
      newGameAt(0);
    } else {
      newGameAt(nextAction.index);
    }
  });
})();

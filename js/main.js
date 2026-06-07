// Bootstraps everything and wires the buttons to the game flow.
(function () {
  const canvas = document.getElementById("game");
  Input.init(canvas);
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
    const loadout = ["rifle", "sniper", "shotgun", "smg"];
    grid.innerHTML = "";
    for (let i = 0; i < (CONFIG.teamSize || 6); i++) {
      const key = loadout[i % loadout.length];
      const label = (typeof WEAPONS !== "undefined" && WEAPONS[key]) ? WEAPONS[key].label : key;
      const btn = document.createElement("button");
      btn.className = "char-card";
      btn.innerHTML = `<b>青${i + 1}</b><span>${label}</span>`;
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

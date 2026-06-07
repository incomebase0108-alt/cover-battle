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
    game.loadStage(index);
    // On touch devices, default to lock-on so aiming is one-button.
    if (Input.isTouch) {
      const p = game.units.find((u) => u.isPlayer);
      if (p) { p.lockMode = true; p.lockTarget = game.nearestVisibleEnemy(p); }
    }
    game.start();
  }

  function startGame() {
    Sound.start(); // begin BGM on the user gesture
    UI.showStart(false);
    UI.hideResult();
    UI.showHud(true);
    newGameAt(0);
  }

  document.getElementById("startBtn").addEventListener("click", startGame);

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

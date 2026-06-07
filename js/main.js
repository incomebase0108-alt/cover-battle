// Bootstraps everything and wires the buttons to the game flow.
(function () {
  const canvas = document.getElementById("game");
  Input.init(canvas);
  UI.init();

  let game = null;
  let nextAction = "start"; // what the result-screen "next" button should do

  function newGameAt(index) {
    game = new Game(canvas, {
      onHud: (state) => UI.updateHud(state),
      onEnd: (win, hasNext, stageIndex) => {
        UI.showResult(win, hasNext, stageIndex);
        if (win) {
          nextAction = hasNext ? { type: "stage", index: stageIndex + 1 } : { type: "restart" };
        } else {
          nextAction = { type: "stage", index: stageIndex };
        }
      },
    });
    game.loadStage(index);
    game.start();
  }

  function startGame() {
    UI.showStart(false);
    UI.hideResult();
    UI.showHud(true);
    newGameAt(0);
  }

  document.getElementById("startBtn").addEventListener("click", startGame);

  document.getElementById("nextBtn").addEventListener("click", () => {
    UI.hideResult();
    if (nextAction.type === "restart") {
      newGameAt(0);
    } else {
      newGameAt(nextAction.index);
    }
  });
})();

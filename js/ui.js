// Glue between the Game and the DOM overlays/HUD.
const UI = {
  el: {},

  init() {
    this.el.hud = document.getElementById("hud");
    this.el.stageLabel = document.getElementById("stageLabel");
    this.el.blueCount = document.getElementById("blueCount");
    this.el.redCount = document.getElementById("redCount");
    this.el.ammo = document.getElementById("ammo");
    this.el.lockState = document.getElementById("lockState");
    this.el.overlay = document.getElementById("overlay");
    this.el.resultOverlay = document.getElementById("resultOverlay");
    this.el.resultTitle = document.getElementById("resultTitle");
    this.el.resultText = document.getElementById("resultText");
  },

  showHud(show) {
    this.el.hud.classList.toggle("hidden", !show);
  },

  updateHud(state) {
    this.el.stageLabel.textContent = state.stage;
    this.el.blueCount.textContent = state.blue;
    this.el.redCount.textContent = state.red;

    const p = state.player;
    if (this.el.ammo && p) {
      if (p.reloading) {
        const pct = Math.round(p.reloadPct * 100);
        this.el.ammo.innerHTML = `<span class="reloading">リロード中… ${pct}%</span>`;
      } else {
        this.el.ammo.innerHTML = `弾 <b>${p.ammo}</b>/${p.magSize}`;
        if (p.ammo <= 3) this.el.ammo.classList.add("low");
        else this.el.ammo.classList.remove("low");
      }
    }
    if (this.el.lockState && p) {
      this.el.lockState.textContent = p.lockMode ? "🔒 ロックオン" : "自由照準";
      this.el.lockState.classList.toggle("on", p.lockMode);
    }
  },

  showStart(show) {
    this.el.overlay.classList.toggle("hidden", !show);
  },

  showResult(win, hasNext, stageIndex) {
    this.el.resultOverlay.classList.remove("hidden");
    const title = this.el.resultTitle;
    title.classList.remove("win", "lose");
    if (win) {
      title.classList.add("win");
      title.textContent = hasNext ? "STAGE CLEAR!" : "ALL CLEAR! 🎉";
      this.el.resultText.textContent = hasNext
        ? "敵を全滅させた！次のステージへ進もう。"
        : "全ステージ制覇！あなたの勝利だ。";
      document.getElementById("nextBtn").textContent = hasNext ? "次のステージ" : "もう一度遊ぶ";
    } else {
      title.classList.add("lose");
      title.textContent = "DEFEAT...";
      this.el.resultText.textContent = "味方が全滅してしまった。もう一度挑戦しよう。";
      document.getElementById("nextBtn").textContent = "リトライ";
    }
  },

  hideResult() {
    this.el.resultOverlay.classList.add("hidden");
  },
};

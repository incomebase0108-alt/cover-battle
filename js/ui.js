// Glue between the Game and the DOM overlays/HUD.
const UI = {
  el: {},

  init() {
    this.el.hud = document.getElementById("hud");
    this.el.stageLabel = document.getElementById("stageLabel");
    this.el.blueCount = document.getElementById("blueCount");
    this.el.redCount = document.getElementById("redCount");
    this.el.ammo = document.getElementById("ammo");
    this.el.weaponName = document.getElementById("weaponName");
    this.el.lockState = document.getElementById("lockState");
    this.el.blueFortBar = document.getElementById("blueFortBar");
    this.el.redFortBar = document.getElementById("redFortBar");
    this.el.fortWarning = document.getElementById("fortWarning");
    this.el.controlBar = document.getElementById("controlBar");
    this.el.cbClass = document.getElementById("cbClass");
    this.el.cbKeys = document.getElementById("cbKeys");
    this._cbCls = null; // remember last class so we only rebuild on change
    this.el.overlay = document.getElementById("overlay");
    this.el.resultOverlay = document.getElementById("resultOverlay");
    this.el.resultTitle = document.getElementById("resultTitle");
    this.el.resultText = document.getElementById("resultText");
  },

  showHud(show) {
    this.el.hud.classList.toggle("hidden", !show);
    if (this.el.controlBar) this.el.controlBar.classList.toggle("hidden", !show);
  },

  // Short, per-class description of the special ability (C / 🎯).
  abilityHelp(cls) {
    const c = (typeof getClass === "function") ? getClass(cls) : null;
    const a = c && c.ability;
    if (a === "dash") return "ダッシュ（急接近/離脱）";
    if (a === "turret") return "自動砲台を設置";
    if (a === "capture") return "近くの動物を捕獲して仲間に";
    if (a === "repair") return "砦・城門を修復";
    if (a === "smoke") return "煙幕で隠れる";
    return "なし";
  },

  // Rebuild the bottom control/trait bar for the player's current class.
  _updateControlBar(p) {
    if (!this.el.cbClass || !p) return;
    if (p.cls === this._cbCls) return; // unchanged
    this._cbCls = p.cls;
    const c = (typeof getClass === "function") ? getClass(p.cls) : null;
    const traits = c
      ? `速${Math.round((c.speedMul || 1) * 100)}% HP${Math.round((c.hpMul || 1) * 100)}%${c.canClimb ? " 段差○" : ""}`
      : "";
    this.el.cbClass.textContent = `${c ? c.badge + " " + c.label : "兵士"}（${traits}）`;
    this.el.cbKeys.innerHTML =
      `移動 <b>WASD/スティック</b> ・ 撃つ <b>クリック/スペース/撃</b> ・ ` +
      `爆弾 <b>E / 💣</b> ・ ダイナマイト <b>X / 🧨</b> ・ ` +
      `武器 <b>1-4 / F / 🔫</b> ・ ロック <b>R / 🔒</b> ・ ` +
      `特殊 <b>C / 🎯</b>：${this.abilityHelp(p.cls)}`;
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
    if (this.el.weaponName && p && p.weapon) {
      this.el.weaponName.textContent = p.weapon;
    }
    if (this.el.lockState && p) {
      this.el.lockState.textContent = p.lockMode ? "🔒 ロックオン" : "自由照準";
      this.el.lockState.classList.toggle("on", p.lockMode);
    }
    if (this.el.blueFortBar && state.blueFort != null) {
      this.el.blueFortBar.style.width = Math.max(0, state.blueFort * 100) + "%";
    }
    if (this.el.redFortBar && state.redFort != null) {
      this.el.redFortBar.style.width = Math.max(0, state.redFort * 100) + "%";
    }
    if (this.el.fortWarning) {
      this.el.fortWarning.classList.toggle("hidden", !state.fortAlert);
    }
    this._updateControlBar(p);
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

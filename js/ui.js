// Glue between the Game and the DOM overlays/HUD.
const UI = {
  el: {},

  init() {
    this.el.hud = document.getElementById("hud");
    this.el.stageLabel = document.getElementById("stageLabel");
    this.el.blueCount = document.getElementById("blueCount");
    this.el.redCount = document.getElementById("redCount");
    this.el.ammo = document.getElementById("ammo");
    this.el.abilitySmall = document.getElementById("abilitySmall");
    this.el.abilityBtn = document.getElementById("btnAbility");
    this.el.rallyBtn = document.getElementById("btnRally");
    this.el.bombBtn = document.getElementById("btnBomb");
    this.el.mClassInfo = document.getElementById("mClassInfo");
    this._mClassStr = null;
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

  // クラスが「何が得意か」を一言で。プレイ中のスマホ表示用。
  classTrait(cls) {
    switch (cls) {
      case "general":  return "総大将・最も頑丈な刀＝剣（弓に強い/槍に弱い）討たれると不利";
      case "ashigaru": return "足軽・刀＝剣の標準前衛（弓に強い/槍に弱い）";
      case "archer":   return "弓・遠距離の手数で装填不要（槍に強い/剣に弱い）";
      case "gunner":   return "鉄砲・5連発で一撃重い、撃ち切ると長い装填→早合(🎯)で即完了（三すくみ外）";
      case "cavalry":  return "騎馬・突進で急接近する刀＝剣（弓に強い/槍に弱い）";
      case "ninja":    return "忍者・森に潜む刀＝剣＋煙幕（弓に強い/槍に弱い）";
      case "spearman": return "槍兵・長い間合いで突く槍（剣に強い/弓に弱い）";
      case "gunshi":   return "軍師・味方を強化(采配🚩)＋再起不能の味方を蘇生(🎯)（後方支援・爆弾なし）";
      default:         return "";
    }
  },

  // Short, per-class description of the special ability (C / 🎯).
  abilityHelp(cls) {
    const c = (typeof getClass === "function") ? getClass(cls) : null;
    const a = c && c.ability;
    if (a === "dash") return "突進ダッシュ（急接近/離脱）";
    if (a === "turret") return "自動砲台を設置";
    if (a === "capture") return "近くの野武士を説得して仲間に";
    if (a === "repair") return "砦・城門を修復";
    if (a === "smoke") return "煙幕で隠れる";
    if (a === "revive") return "蘇生（再起不能の味方を復活・回復なし／30秒）";
    if (a === "fastreload") return "早合（装填を即完了して弾倉満タン）";
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
    // 技名はクラスごと（説得/早合/突進/煙幕/蘇生）。特殊なしクラスは技の項目を出さない。
    const aName = (c && c.abilityName) || "特殊";
    const aPart = (c && c.ability) ? ` ・ ${aName} <b>C / 🎯</b>：${this.abilityHelp(p.cls)}` : "";
    const rallyPart = (c && c.key === "gunshi") ? ` ・ 采配 <b>V / 🚩</b>：周囲の味方を一時強化` : "";
    const bombPart = (c && c.maxBombs === 0) ? "" : ` ・ 爆弾 <b>E / 💣</b>`;
    this.el.cbKeys.innerHTML =
      `移動 <b>WASD/スティック</b> ・ 攻撃 <b>クリック/スペース/「攻」</b>` +
      bombPart + aPart + rallyPart;
  },

  updateHud(state) {
    this.el.stageLabel.textContent = state.stage;
    this.el.blueCount.textContent = state.blue;
    this.el.redCount.textContent = state.red;

    const p = state.player;
    if (this.el.ammo && p) {
      if (p.noReload) {
        // 装填不要（刀/弓）は弾数を出さず武器名のみ。
        this.el.ammo.innerHTML = `<b>${p.weapon}</b>`;
        this.el.ammo.classList.remove("low");
      } else if (p.reloading) {
        const pct = Math.round(p.reloadPct * 100);
        this.el.ammo.innerHTML = `<span class="reloading">装填中… ${pct}%</span>`;
      } else {
        this.el.ammo.innerHTML = `弾 <b>${p.ammo}</b>/${p.magSize}`;
        if (p.ammo <= 3) this.el.ammo.classList.add("low");
        else this.el.ammo.classList.remove("low");
      }
    }
    // プレイ中のクラス情報チップ（スマホ）：得意なこと＋特殊（残数つき）を1行で。
    // 自軍の総大将が危機/討死のときは、その警告を最優先で前置きする。
    if (this.el.mClassInfo && p) {
      const c = (typeof getClass === "function") ? getClass(p.cls) : null;
      if (c) {
        let s = `${c.badge} ${c.label}：${this.classTrait(p.cls)}`;
        if (p.abilityRemaining != null) s += `（${c.abilityName || "特殊"} 残${p.abilityRemaining}）`;
        if (state.general === 1) s = "⚠ 大将 危機！救出せよ ｜ " + s;
        else if (state.general === 2) s = "大将 討死…味方弱体中(蘇生・救出で復帰) ｜ " + s;
        if (s !== this._mClassStr) { this._mClassStr = s; this.el.mClassInfo.textContent = s; }
      }
    }
    // 特殊ボタン：クラスごとの技名（説得/早合/突進/煙幕/蘇生）を表示し、
    // 特殊を持たないクラス（足軽/弓兵/槍兵）ではボタン自体を隠す。
    if (this.el.abilitySmall && p) {
      const cdef = (typeof getClass === "function") ? getClass(p.cls) : null;
      const hasAbility = !!(cdef && cdef.ability);
      const rem = p.abilityRemaining;
      const aName = (cdef && cdef.abilityName) || "特殊";
      this.el.abilitySmall.textContent = rem == null ? aName : `${aName} 残${rem}`;
      if (this.el.abilityBtn) {
        this.el.abilityBtn.classList.toggle("hidden", !hasAbility);
        this.el.abilityBtn.classList.toggle("depleted", rem === 0);
      }
    }
    // 軍師は爆弾を持たない → 爆弾ボタンを隠す（他クラスでは表示）。
    if (this.el.bombBtn && p) this.el.bombBtn.classList.toggle("hidden", p.cls === "gunshi");
    // 軍師だけ「采配」ボタンを出す。クールダウン中はグレーアウト。
    if (this.el.rallyBtn && p) {
      this.el.rallyBtn.classList.toggle("hidden", !p.isGunshi);
      this.el.rallyBtn.classList.toggle("depleted", p.isGunshi && p.rallyReady === false);
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

  // reason: "general"=総大将討ち取り / "fort"=城の破壊 / "wipe"=全滅（省略時=全滅扱い）
  showResult(win, hasNext, stageIndex, reason) {
    this.el.resultOverlay.classList.remove("hidden");
    const title = this.el.resultTitle;
    title.classList.remove("win", "lose");
    if (win) {
      title.classList.add("win");
      title.textContent = hasNext ? "STAGE CLEAR!" : "ALL CLEAR! 🎉";
      const how = reason === "general" ? "敵の総大将を討ち取りました！"
        : reason === "fort" ? "敵の城を落とした！"
        : "敵を全滅させた！";
      this.el.resultText.textContent = how + (hasNext ? " 次のステージへ進もう。" : " 全ステージ制覇！あなたの勝利だ。");
      document.getElementById("nextBtn").textContent = hasNext ? "次のステージ" : "もう一度遊ぶ";
    } else {
      title.classList.add("lose");
      title.textContent = "DEFEAT...";
      const how = reason === "general" ? "総大将が討ち取られました…"
        : reason === "fort" ? "自分の城が落とされてしまった…"
        : "味方が全滅してしまった。";
      this.el.resultText.textContent = how + " もう一度挑戦しよう。";
      document.getElementById("nextBtn").textContent = "リトライ";
    }
  },

  hideResult() {
    this.el.resultOverlay.classList.add("hidden");
  },
};

// Loads the Blender-rendered sprite PNGs (assets/). Everything degrades
// gracefully: if an image is missing or we're running without a DOM (tests),
// `ready()` returns false and the game falls back to its canvas-drawn art.
const Assets = {
  images: {},
  _loaded: {},
  defs: {
    soldier_blue: "assets/soldier_blue.png",
    soldier_red: "assets/soldier_red.png",
    fort_blue: "assets/fort_blue.png",
    fort_red: "assets/fort_red.png",
    keg: "assets/keg.png", // 火薬樽（4号機制作待ち。無ければベクター樽で表示）
  },

  // クラス別スプライト（assets/soldier_{team}_{key}.png）。無ければ soldier_{team}.png →
  // それも無ければベクター描画にフォールバックする。Blender侍12枚はこのキー名で投下。
  _classKeys: ["general", "ashigaru", "archer", "gunner", "cavalry", "ninja", "spearman", "gunshi"],

  // 中立の浪人スプライト（assets/beast_{key}.png）。無ければ人型ベクターにフォールバック。
  _beastKeys: ["nobushi", "kengo"],

  load() {
    if (typeof Image === "undefined") return; // Node / no DOM
    for (const team of ["blue", "red"]) {
      for (const cls of this._classKeys) {
        const k = "soldier_" + team + "_" + cls;
        this.defs[k] = "assets/" + k + ".png";
      }
    }
    for (const bt of this._beastKeys) {
      this.defs["beast_" + bt] = "assets/beast_" + bt + ".png";
    }
    for (const key in this.defs) {
      const img = new Image();
      img.onload = () => { this._loaded[key] = true; };
      img.onerror = () => { this._loaded[key] = false; };
      img.src = this.defs[key];
      this.images[key] = img;
    }
  },

  ready(name) {
    return this._loaded[name] === true;
  },

  // DQ風の3/4立ち姿スプライトを「上向き固定＋左右反転」で描く。回転しない（回転すると
  // 立ち姿が横倒しになるため）。aim が左向き(cos<0)のときだけ左右反転。足元を接地点
  // (gx,gy)付近に置き、本体は上へ伸ばす。
  // 歩行モーション（スプライト1枚のままの疑似アニメ）：
  //   ・弾み（bob）＋足元を支点にした左右ロッキング（踏み込みで体が揺れる）
  //   ・進行方向への僅かな前傾
  //   ・接地で「つぶれ」、浮きで「伸び」（スクワッシュ＆ストレッチ）
  drawSprite(ctx, sprite, gx, gy, aim, r, walkPhase) {
    const s = r * 6.6; // スプライトを少し大きめに（キャラを大きく見せる）
    const walking = !!walkPhase;
    const sw = walking ? Math.sin(walkPhase) : 0;
    const p = Math.abs(sw);                    // 0=接地（踏み込み）〜 1=浮き（頂点）
    const bob = walking ? p * r * 0.18 : 0;    // 上下の弾み
    const tilt = walking ? sw * 0.085 : 0;     // 左右ロッキング（±約5°）
    const lean = walking ? 0.05 : 0;           // 進行方向へ僅かに前傾
    const sx = walking ? 1.05 - p * 0.08 : 1;  // 接地で横に少しつぶれ、浮きで細く
    const sy = walking ? 0.96 + p * 0.08 : 1;  // 接地で低く、浮きで伸びる
    ctx.save();
    ctx.translate(gx, gy);                     // 支点＝足元（接地点）
    if (Math.cos(aim) < 0) ctx.scale(-1, 1);   // 左向きは反転（以降の前傾も進行方向に向く）
    ctx.rotate(tilt + lean);
    ctx.translate(0, -bob);
    ctx.scale(sx, sy);
    ctx.drawImage(sprite, -s / 2, -s * 0.80, s, s); // 下端＝接地点付近、本体は上へ
    ctx.restore();
  },

  // 歩行の弾み量（0〜1）。影の縮小などスプライトと同期させたい描画で使う。
  walkBobAmount(walkPhase) {
    return walkPhase ? Math.abs(Math.sin(walkPhase)) : 0;
  },

  get(name) {
    return this.images[name];
  },
};

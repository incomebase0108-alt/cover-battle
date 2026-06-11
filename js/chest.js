// Chest pickup for Cover Battle.
//
// Loaded as a plain <script> (no ES modules) AFTER weapons.js so that the
// global `CHEST_LOOT` array is available. Self-contained: knows only how to
// update, draw, and be opened. The game layer owns spawning and the proximity
// check that decides *when* to call open().
//
// A chest sits on the map until a unit opens it. On open() it grants a random
// special weapon to that unit, plays a brief flash, then marks itself dead so
// the game can remove it.
class Chest {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 16;
    this.opened = false;
    this.dead = false;

    // Idle bob/glow animation clock (ms).
    this.animTime = 0;
    // Counts up after opening; once it passes openDuration the chest dies.
    this.openTimer = 0;
    this.openDuration = 400; // ms of "burst of light" before vanishing
  }

  update(dt, game) {
    if (this.dead) return;
    this.animTime += dt;

    if (this.opened) {
      this.openTimer += dt;
      if (this.openTimer >= this.openDuration) {
        this.dead = true;
      }
    }
  }

  draw(ctx) {
    if (this.dead) return;

    if (this.opened) {
      this._drawOpened(ctx);
    } else {
      this._drawClosed(ctx);
    }
  }

  // Unopened: golden box with a lid, gently bobbing and pulsing.
  _drawClosed(ctx) {
    const r = this.radius;
    const bob = Math.sin(this.animTime / 320) * 2; // vertical sway in px
    const glow = 0.5 + 0.5 * Math.sin(this.animTime / 260); // 0..1 pulse

    ctx.save();
    ctx.translate(this.x, this.y + bob);

    // Soft glow halo.
    ctx.globalAlpha = 0.25 + 0.25 * glow;
    ctx.fillStyle = "#ffe27a";
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Box body.
    const w = r * 2;
    const h = r * 1.7;
    ctx.fillStyle = "#caa12e";
    ctx.fillRect(-w / 2, -h / 2 + h * 0.3, w, h * 0.7);
    // Lid.
    ctx.fillStyle = "#f0c64b";
    ctx.fillRect(-w / 2, -h / 2, w, h * 0.4);
    // Lid rim / outline.
    ctx.strokeStyle = "#7a5e10";
    ctx.lineWidth = 2;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.beginPath();
    ctx.moveTo(-w / 2, -h / 2 + h * 0.4);
    ctx.lineTo(w / 2, -h / 2 + h * 0.4);
    ctx.stroke();
    // Center latch.
    ctx.fillStyle = "#fff2b0";
    ctx.fillRect(-3, -h / 2 + h * 0.28, 6, h * 0.24);

    ctx.restore();
  }

  // Opened: lid flipped up, with a quick fading flash of light.
  _drawOpened(ctx) {
    const r = this.radius;
    const t = Math.min(1, this.openTimer / this.openDuration); // 0..1
    const flash = 1 - t;

    ctx.save();
    ctx.translate(this.x, this.y);

    // Expanding burst of light.
    ctx.globalAlpha = 0.6 * flash;
    ctx.fillStyle = "#fff7d6";
    ctx.beginPath();
    ctx.arc(0, 0, r * (1 + 2.2 * t), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    const w = r * 2;
    const h = r * 1.7;
    // Box body (open, slightly dim as it fades).
    ctx.globalAlpha = 0.4 + 0.6 * flash;
    ctx.fillStyle = "#caa12e";
    ctx.fillRect(-w / 2, -h / 2 + h * 0.3, w, h * 0.7);
    // Flipped-up lid above the box.
    ctx.fillStyle = "#f0c64b";
    ctx.fillRect(-w / 2, -h / 2 - h * 0.45, w, h * 0.4);
    ctx.strokeStyle = "#7a5e10";
    ctx.lineWidth = 2;
    ctx.strokeRect(-w / 2, -h / 2 + h * 0.3, w, h * 0.7);
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  // Grant a random special weapon to `unit`. No-op if already opened.
  // The game layer is responsible for the proximity check that calls this.
  open(unit, game) {
    if (this.opened) return;
    this.opened = true;
    this.openTimer = 0;

    const key = CHEST_LOOT[(Math.random() * CHEST_LOOT.length) | 0];
    if (unit) {
      if (typeof unit.grantSpecial === "function") {
        unit.grantSpecial(key);
      } else if (typeof unit.setWeapon === "function") {
        unit.setWeapon(key);
      }
    }

    // Optional celebratory sound, if the game wires one up.
    if (game && game.sound && typeof game.sound.victory === "function") {
      game.sound.victory();
    }

    return key;
  }
}

// 火薬樽（マップの仕掛け）：中盤の要所に置かれた中立の爆発物。弾・刀・爆弾の
// どれかが当たると CONFIG.keg の威力で爆発し、**敵味方の区別なく**周囲の兵に
// ダメージ＋岩を砕き＋近くの樽に誘爆する。要所の撃ち合いで「樽の近くに立つな／
// あえて撃って巻き込め」の駆け引きを生む。
class Keg {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 13;
    this.dead = false;
  }

  // どんな攻撃でも一撃で起爆（hpは持たない＝分かりやすさ優先）。
  takeDamage(amount, game) { this.explode(game); }

  explode(game) {
    if (this.dead) return;
    this.dead = true;
    const K = CONFIG.keg || { blastRadius: 85, blastDamage: 55 };
    const R = K.blastRadius;
    // 敵味方の区別なく爆風ダメージ（中立の罠）。
    for (const u of game.units) {
      if (!u.alive) continue;
      if (V.dist(this.x, this.y, u.x, u.y) <= R + u.radius) u.takeDamage(K.blastDamage);
    }
    for (const b of (game.beasts || [])) {
      if (b.dead || !b.takeDamage) continue;
      if (V.dist(this.x, this.y, b.x, b.y) <= R + (b.radius || 22)) b.takeDamage(K.blastDamage);
    }
    for (const tr of (game.turrets || [])) {
      if (!tr.dead && tr.takeDamage && V.dist(this.x, this.y, tr.x, tr.y) <= R + tr.radius) {
        tr.takeDamage(K.blastDamage);
      }
    }
    // 岩を砕く＋近くの樽へ誘爆（dead ガードで無限再帰しない）。
    const broken = game.map.damageRocksInRadius(this.x, this.y, R, CONFIG.bomb.rockDamage);
    for (const rock of broken) game.dropFromRock(rock);
    for (const k of (game.kegs || [])) {
      if (!k.dead && V.dist(this.x, this.y, k.x, k.y) <= R + k.radius) k.explode(game);
    }
    // 爆発の見た目と音（爆発済みBombのflash描画を再利用＝LANにも乗る）。
    // drawRadius で実際の爆風範囲どおりの大きさに描く。
    if (typeof Bomb !== "undefined") {
      const fx = new Bomb(this.x, this.y, null);
      fx.exploded = true;
      fx.flash = CONFIG.bomb.flashTime;
      fx.drawRadius = R;
      game.bombs.push(fx);
    }
    if (game.sound) game.sound.explosion();
  }

  draw(ctx) {
    if (this.dead) return;
    Keg.drawAt(ctx, this.x, this.y, this.radius);
  }

  // 描画本体（LANクライアントはスナップショット座標から直接これを呼ぶ）。
  // keg.png があればスプライト、無ければベクターの木樽＋火薬マーク。
  static drawAt(ctx, x, y, r) {
    r = r || 13;
    if (typeof Assets !== "undefined" && Assets.ready && Assets.ready("keg")) {
      const img = Assets.get("keg");
      const s = r * 4.6;
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.25)"; // 接地影
      ctx.beginPath(); ctx.ellipse(x, y + r * 0.55, r * 1.1, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.drawImage(img, x - s / 2, y - s * 0.78, s, s);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(0,0,0,0.25)"; // 接地影
    ctx.beginPath(); ctx.ellipse(0, r * 0.55, r * 1.1, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    // 木樽の胴（縦板＋少し膨らみ）。
    ctx.fillStyle = "#7a5230";
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * 1.15, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#4a3019"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.strokeStyle = "rgba(40,25,12,0.5)"; ctx.lineWidth = 1; // 板目
    for (const ox of [-r * 0.45, 0, r * 0.45]) {
      ctx.beginPath(); ctx.moveTo(ox, -r * 1.05); ctx.lineTo(ox, r * 1.05); ctx.stroke();
    }
    ctx.strokeStyle = "#2f2f33"; ctx.lineWidth = 2.5; // 鉄のたが（上下）
    ctx.beginPath(); ctx.ellipse(0, -r * 0.55, r * 0.92, r * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, r * 0.55, r * 0.92, r * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
    // 「火」マーク（撃つと爆発する目印）。
    ctx.fillStyle = "#ff6a3c";
    ctx.font = `bold ${Math.round(r * 1.1)}px system-ui, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("火", 0, 0);
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.restore();
  }
}

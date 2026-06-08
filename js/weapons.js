// Weapon definitions for Cover Battle.
//
// Loaded as a plain <script> BEFORE entities.js, so `WEAPONS` and
// `WEAPON_ORDER` are global. Numbers live here (NOT in config.js) so the
// weapon designer can tune them without touching shared config.
//
// Each weapon may define any of:
//   label          : Japanese display name shown in the HUD
//   damage         : per-bullet damage (falls back to CONFIG.bullet.damage)
//   fireCooldown   : ms between shots      (falls back to CONFIG.unit.fireCooldown)
//   magSize        : rounds per magazine   (falls back to CONFIG.unit.magSize)
//   reloadTime     : ms to reload          (falls back to CONFIG.unit.reloadTime)
//   pellets        : bullets per trigger pull (default 1)
//   spread         : max angular jitter in radians for pellets/shots (default 0)
//   bulletSpeedMul : weapon bullet-speed multiplier (default 1)
//   rangeMul       : weapon range/bullet-life multiplier (default 1)
// 近接(刀)は extra フラグで表現する（entities.js が解釈）:
//   isMelee   : 弾を撃たず、前方の扇内の敵/城門/砦を直接斬る
//   meleeRange: 斬撃の届く距離(px)、meleeArc: 扇の半角(rad)
//   noReload  : 弾数/装填の概念を持たない（HUDでも弾を出さない）
const WEAPONS = {
  // 内部デフォルト（クラス未設定時のフォールバック専用。プレイヤーは選べない）。
  rifle: {
    label: "ライフル",
    damage: 16,
    fireCooldown: 300,
    magSize: 10,
    reloadTime: 3000,
    pellets: 1,
    spread: 0,
    bulletSpeedMul: 1,
    rangeMul: 1,
  },

  // --- 合戦の標準武器（クラス固定） ---
  katana: {
    label: "刀",
    damage: 34,
    fireCooldown: 420,   // 振りの間隔（速い）
    isMelee: true,
    meleeRange: 46,      // 前方リーチ(px)。unit.radius(14)+α
    meleeArc: 1.1,       // 左右±約63°の扇
    noReload: true,
    rps: "sword",        // 剣＞弓・剣＜槍
  },
  yari: {
    label: "槍",
    damage: 30,
    fireCooldown: 720,   // 突きは刀より遅い（切り付けが早くない）
    isMelee: true,
    meleeRange: 82,      // 刀より長いリーチ（間合いの外から突ける）
    meleeArc: 0.5,       // 前方の狭い扇（突き）
    noReload: true,
    rps: "spear",        // 槍＞剣・槍＜弓
  },
  yumi: {
    label: "弓",
    damage: 14,
    fireCooldown: 620,   // 連射は控えめ（装填不要だが矢継ぎ早には撃てない）
    bulletSpeedMul: 1.2,
    rangeMul: 1.3,
    noReload: true,      // 装填無しで撃ち続けられる
    rps: "bow",          // 弓＞槍・弓＜剣
  },
  teppo: {
    label: "鉄砲",
    damage: 62,          // 一撃が重い
    fireCooldown: 1100,
    magSize: 1,          // 一発撃つたびに装填＝火縄銃感
    reloadTime: 2600,    // 長い装填
    bulletSpeedMul: 1.7,
    rangeMul: 1.7,
    spread: 0.02,
  },

  // --- 宝箱限定の強力武器（WEAPON_ORDER外）。フラグは entities.js が解釈 ---
  //   fire : 着弾で延焼（岩/敵に追加）・短射程  pierce : 敵/薄い物を貫通  breakRock : 岩に大ダメージ
  flame: {
    label: "焙烙火矢",     // 火薬玉の火炎放射（宝箱）
    damage: 14,
    fireCooldown: 55,
    magSize: 110,
    reloadTime: 2600,
    pellets: 3,
    spread: 0.42,
    bulletSpeedMul: 0.6,
    rangeMul: 0.5,
    fire: true,
    breakRock: true,
  },
  piercer: {
    label: "強弓",         // 貫通する強弓（宝箱）
    damage: 22,
    fireCooldown: 260,
    magSize: 12,
    reloadTime: 2800,
    pellets: 1,
    spread: 0,
    bulletSpeedMul: 1.5,
    rangeMul: 1.3,
    pierce: true,
  },
  rockbuster: {
    label: "大筒",         // 城/岩を砕く大砲（宝箱）。大きな砲丸が飛び、着弾で周囲に衝撃。
    damage: 72,            // 一撃が非常に重い
    fireCooldown: 850,
    magSize: 3,
    reloadTime: 3400,
    pellets: 1,
    spread: 0.01,
    bulletSpeedMul: 0.92,  // 重い砲丸＝やや遅い
    rangeMul: 1.1,
    breakRock: true,
    ball: true,            // 大きな丸い砲丸として描画＆当たり判定を大きく
    splash: 78,            // 着弾点からこの半径内の敵にも衝撃ダメージ
  },
};

// クラス固定の3武器（刀/弓/鉄砲）。宝箱武器は除外（拾った時だけ一時的に持つ）。
const WEAPON_ORDER = ["katana", "yumi", "teppo"];

// 宝箱がドロップしうる特殊武器キー（grantSpecial/setWeapon 経由）。
const CHEST_LOOT = ["flame", "piercer", "rockbuster"];

// Resolve a weapon definition, defaulting to rifle for unknown keys.
function getWeapon(key) {
  return WEAPONS[key] || WEAPONS.rifle;
}

// じゃんけん三角の相性倍率：攻撃側 atk が防御側 def に有利なら CONFIG.rps.bonus、
// それ以外は 1。三角は 槍(spear)＞剣(sword)＞弓(bow)＞槍。鉄砲(rps無し)は対象外。
function rpsBonus(atk, def) {
  if (!atk || !def) return 1;
  if ((atk === "spear" && def === "sword") ||
      (atk === "sword" && def === "bow") ||
      (atk === "bow" && def === "spear")) {
    return (typeof CONFIG !== "undefined" && CONFIG.rps) ? CONFIG.rps.bonus : 1.5;
  }
  return 1;
}

// 武器キーから三角属性を引く（未知/鉄砲は null）。
function weaponRps(key) {
  const w = WEAPONS[key];
  return w ? (w.rps || null) : null;
}

// 選択キャラ視点の三すくみ相性。myKey の武器が theirKey に有利なら "good"（得意＝緑）、
// 不利なら "bad"（苦手＝赤）、引き分け/相性外（鉄砲・同属性）は null。
function rpsMatchup(myKey, theirKey) {
  const me = weaponRps(myKey);
  const them = weaponRps(theirKey);
  if (!me || !them || me === them) return null;
  if (rpsBonus(me, them) > 1) return "good"; // 自分が相手に有利＝得意
  if (rpsBonus(them, me) > 1) return "bad";  // 相手が自分に有利＝苦手
  return null;
}

// 相性マーカー：選択キャラ視点で相手の足元に色リング＋頭上の三角を描く。
// 得意=緑(▲)／苦手=赤(▼)。色覚に依らず形でも分かるようにする。単独/LAN共用。
function drawMatchupRing(ctx, x, y, r, kind) {
  if (kind !== "good" && kind !== "bad") return;
  const col = kind === "good" ? "#39e08a" : "#ff5a5a";
  ctx.save();
  ctx.strokeStyle = col;
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.5, r * 1.15, r * 0.62, 0, 0, Math.PI * 2); // 足元リング
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = col;
  const ay = y - r - 8; // 頭上マーカー
  ctx.beginPath();
  if (kind === "good") { ctx.moveTo(x, ay - 7); ctx.lineTo(x - 6, ay + 3); ctx.lineTo(x + 6, ay + 3); }
  else { ctx.moveTo(x, ay + 7); ctx.lineTo(x - 6, ay - 3); ctx.lineTo(x + 6, ay - 3); }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// 攻撃モーション。ユニットの「回転フレーム内（局所 +X＝前方）」で呼ぶこと。
//   刀  : 前方の扇を斬り抜ける刃の弧
//   弓  : 弓を引き絞って放つ動作（弦＋矢）
//   鉄砲: ここでは描かない（マズルフラッシュ＋本体の反動で表現＝呼び出し側）
// swingMs は残り時間(ms)。CONFIG.melee.swingMs を全体の長さとして進行度を出す。
function drawAttackFX(ctx, w, swingMs, r) {
  if (!w || swingMs <= 0) return;
  const D = (typeof CONFIG !== "undefined" && CONFIG.melee && CONFIG.melee.swingMs) || 220;
  const p = Math.max(0, Math.min(1, 1 - swingMs / D)); // 0→1
  if (w.isMelee) {
    const reach = w.meleeRange || 40;
    const arc = w.meleeArc || 1.0;
    const la = -arc + 2 * arc * p; // 局所角（+X=前方）。-arc→+arc へ振り抜ける
    ctx.fillStyle = "rgba(220,235,255,0.18)"; // 振った範囲の残光
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, reach, -arc, la, false); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(244,248,255,0.95)"; ctx.lineWidth = 4; ctx.lineCap = "round"; // 刀身
    ctx.beginPath();
    ctx.moveTo(Math.cos(la) * reach * 0.3, Math.sin(la) * reach * 0.3);
    ctx.lineTo(Math.cos(la) * reach, Math.sin(la) * reach);
    ctx.stroke();
    ctx.fillStyle = "#fff"; // 切っ先のきらめき
    ctx.beginPath(); ctx.arc(Math.cos(la) * reach, Math.sin(la) * reach, 3, 0, Math.PI * 2); ctx.fill();
    ctx.lineCap = "butt";
  } else if (w.noReload) {
    // 弓を引く（p<0.6）→放つ（その後 弦が前に戻る）。
    const reach = r * 1.7;
    const pull = p < 0.6 ? p / 0.6 : 1 - (p - 0.6) / 0.4; // 0→1→0
    const cx = reach * 0.55, rr = reach * 0.7;
    ctx.strokeStyle = "rgba(210,180,120,0.95)"; ctx.lineWidth = 2.5; ctx.lineCap = "round"; // 弓
    ctx.beginPath(); ctx.arc(cx, 0, rr, -1.15, 1.15); ctx.stroke();
    const topX = cx + Math.cos(-1.15) * rr, topY = Math.sin(-1.15) * rr;
    const botX = cx + Math.cos(1.15) * rr, botY = Math.sin(1.15) * rr;
    const nockX = cx - pull * reach * 0.55;
    ctx.strokeStyle = "rgba(240,240,240,0.9)"; ctx.lineWidth = 1.5; // 弦
    ctx.beginPath(); ctx.moveTo(topX, topY); ctx.lineTo(nockX, 0); ctx.lineTo(botX, botY); ctx.stroke();
    ctx.strokeStyle = "rgba(120,90,60,0.95)"; ctx.lineWidth = 2; // 矢
    ctx.beginPath(); ctx.moveTo(nockX, 0); ctx.lineTo(reach * 1.05, 0); ctx.stroke();
    ctx.lineCap = "butt";
  }
}

// 攻撃の本体反動/踏み込み量（局所 +X 方向のオフセット px）。刀は前へ踏み込み(+)、
// 飛び道具は後ろへ反動(-)。攻撃直後が最大で、すぐ戻る。
function attackRecoil(w, swingMs, r) {
  if (!w || swingMs <= 0) return 0;
  const D = (typeof CONFIG !== "undefined" && CONFIG.melee && CONFIG.melee.swingMs) || 220;
  const e = Math.max(0, Math.min(1, swingMs / D)); // 1→0
  const amp = r * (w.isMelee ? 0.5 : 0.6);
  return (w.isMelee ? amp : -amp) * e;
}

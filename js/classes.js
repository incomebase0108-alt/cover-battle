// Character classes (ranks). Each blue/red slot is a class, giving a distinct
// look (accent + size), stats, weapon and sometimes a special ability such as
// climbing ledges for a shortcut. Shown with descriptions in character select.
//
// Fields:
//   key, label, desc : id + display name + character-select description
//   weapon           : starting weapon key (see weapons.js)
//   hpMul, speedMul  : multipliers on base HP / move speed
//   sizeMul          : body/hitbox scale (heavy is bigger, scout smaller)
//   canClimb         : can cross ledges (段差) that block everyone else
//   maxBombs         : override bomb capacity (engineer)
//   accent           : ring/badge colour
//   badge            : single-character insignia drawn on the soldier
// `ability` (active, fired with the C key / 🎯 button) + `abilityCd` (ms):
//   smoke  : drops a smoke cloud that blocks sight + conceals (scout)
//   turret : deploys an auto-firing sentry (engineer)
//   dash   : a short burst of speed in the move direction (assault)
//   smoke   : drops a smoke cloud (unused now scout is gone; kept for reuse)
//   turret  : deploys an auto-firing sentry (engineer)
//   dash    : a short burst of speed in the move direction (assault)
//   capture : tame the nearest wild beast so it fights for you (beast tamer)
// 日本の合戦テーマ。slot index → CLASSES[i % 6] なので、配列0番＝総大将にすると
// 「各チームの slot0 が必ず総大将」が自動で保証される（大将ルールの起点）。
// 近接(刀)＝総大将/足軽/騎馬/忍者、遠隔＝弓兵(弓・装填無し)/鉄砲兵(鉄砲・装填有り強力)。
const CLASSES = [
  { key: "general",  label: "総大将",  desc: "最も頑丈な近接の要。体力が群を抜いて高い。『説得』(C/🎯)で野武士に近づき仲間にできる。討たれると味方の回復が止まり士気が崩れる。刀＝剣：弓に強い／槍に弱い。", weapon: "katana", hpMul: 2.2, speedMul: 0.8, sizeMul: 1.34, accent: "#ffd24a", badge: "将", ability: "capture", abilityName: "説得", abilityMax: 2 },
  { key: "ashigaru", label: "足軽",    desc: "刀で斬り込む標準の前衛。数で押す。刀＝剣：弓に強い／槍に弱い。", weapon: "katana", hpMul: 1.0, speedMul: 1.05, sizeMul: 1.0, accent: "#9cc2ff", badge: "足" },
  { key: "archer",   label: "弓兵",    desc: "弓で遠くから手数で攻める。装填不要で撃ち続けられる。弓：槍に強い／剣に弱い。", weapon: "yumi", hpMul: 0.85, speedMul: 1.05, sizeMul: 0.96, accent: "#b9f27c", badge: "弓" },
  { key: "gunner",   label: "鉄砲兵",  desc: "鉄砲は5連発で一撃が重いが、撃ち切ると長い装填が要る。『早合』(C/🎯)で装填を即完了。三すくみ（槍/剣/弓）の相性外。", weapon: "teppo", hpMul: 0.9, speedMul: 0.92, sizeMul: 1.0, accent: "#c98cff", badge: "鉄", ability: "fastreload", abilityName: "早合", abilityCd: 12000 },
  { key: "cavalry",  label: "騎馬",    desc: "高速で突進し一気に間合いを詰める刀の遊撃。『突進』(C/🎯)で一気に加速。刀＝剣：弓に強い／槍に弱い。", weapon: "katana", hpMul: 1.2, speedMul: 1.28, sizeMul: 1.08, accent: "#ff8a5a", badge: "騎", ability: "dash", abilityName: "突進", abilityCd: 4000 },
  { key: "ninja",    label: "忍者",    desc: "森に潜み『煙幕』(C/🎯)で撹乱する刀の奇襲。刀＝剣：弓に強い／槍に弱い。", weapon: "katana", hpMul: 0.9, speedMul: 1.18, sizeMul: 0.92, accent: "#5ad6ff", badge: "忍", ability: "smoke", abilityName: "煙幕", abilityCd: 9000 },
  { key: "spearman", label: "槍兵",    desc: "長い槍で間合いの外から突く。突きは遅めだが、剣（刀）に強い。弓には弱い。", weapon: "yari", hpMul: 1.05, speedMul: 1.0, sizeMul: 1.06, accent: "#e89bd0", badge: "槍" },
  { key: "gunshi",   label: "軍師",    desc: "後方支援の指揮役。近くの味方を常時強化（自動オーラ）＋『采配』(🚩/V)で周囲を一段強く一時強化。『蘇生』(C/🎯)で再起不能(ダウン)の味方をその場で復活（低HPで立たせる／30秒に1回）。爆弾は持たない。刀＝剣：弓に強い／槍に弱い。", weapon: "katana", hpMul: 1.0, speedMul: 0.85, sizeMul: 1.04, accent: "#e8d24a", badge: "軍", ability: "revive", abilityName: "蘇生", abilityCd: 30000, maxBombs: 0 },
];

function getClass(keyOrIndex) {
  if (typeof keyOrIndex === "number") return CLASSES[keyOrIndex % CLASSES.length];
  return CLASSES.find((c) => c.key === keyOrIndex) || CLASSES[0];
}

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
const CLASSES = [
  { key: "assault",  label: "突撃兵",  desc: "バランス攻撃型。ダッシュで急接近/離脱。", weapon: "rifle",  hpMul: 1.15, speedMul: 1.15, sizeMul: 1.04, accent: "#ff6b6b", badge: "突", ability: "dash", abilityCd: 5000 },
  { key: "sniper",   label: "狙撃兵",  desc: "遠距離特化。一撃が重いが連射は遅い。", weapon: "sniper", hpMul: 0.9, speedMul: 1.0, sizeMul: 0.96, accent: "#c98cff", badge: "狙" },
  { key: "heavy",    label: "重装兵",  desc: "頑丈・低速・近距離。前線の壁。", weapon: "shotgun", hpMul: 1.7, speedMul: 0.78, sizeMul: 1.28, accent: "#ffb347", badge: "重" },
  { key: "climber",  label: "山岳兵",  desc: "段差を登れる＝近道できる。標準装備。", weapon: "rifle",  hpMul: 1.0, speedMul: 1.12, sizeMul: 1.0, canClimb: true, accent: "#5ad6ff", badge: "山" },
  { key: "engineer", label: "工兵",    desc: "爆破支援。自動砲台を設置でき、爆弾も多い。", weapon: "rifle",  hpMul: 1.0, speedMul: 1.05, sizeMul: 1.02, maxBombs: 3, accent: "#ff8a5a", badge: "工", ability: "turret", abilityCd: 14000 },
  { key: "tamer",    label: "動物使い", desc: "野生のクマ/トラを捕獲して仲間にする。", weapon: "rifle",  hpMul: 1.05, speedMul: 1.05, sizeMul: 1.02, accent: "#b9f27c", badge: "獣", ability: "capture", abilityCd: 12000 },
];

function getClass(keyOrIndex) {
  if (typeof keyOrIndex === "number") return CLASSES[keyOrIndex % CLASSES.length];
  return CLASSES.find((c) => c.key === keyOrIndex) || CLASSES[0];
}

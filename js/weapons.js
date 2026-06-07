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
const WEAPONS = {
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
  sniper: {
    label: "スナイパー",
    damage: 55,
    fireCooldown: 900,
    magSize: 5,
    reloadTime: 3500,
    pellets: 1,
    spread: 0,
    bulletSpeedMul: 1.6,
    rangeMul: 1.8,
  },
  shotgun: {
    label: "ショットガン",
    damage: 8,
    fireCooldown: 700,
    magSize: 6,
    reloadTime: 3200,
    pellets: 6,
    spread: 0.35,
    bulletSpeedMul: 1,
    rangeMul: 0.5,
  },
  smg: {
    label: "サブマシンガン",
    damage: 10,
    fireCooldown: 120,
    magSize: 25,
    reloadTime: 2600,
    pellets: 1,
    spread: 0.08,
    bulletSpeedMul: 1,
    rangeMul: 0.85,
  },
};

// Cycle order for number-key selection and the F-key cycle.
const WEAPON_ORDER = ["rifle", "sniper", "shotgun", "smg"];

// Resolve a weapon definition, defaulting to rifle for unknown keys.
function getWeapon(key) {
  return WEAPONS[key] || WEAPONS.rifle;
}

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

  // --- Special weapons (chest-only, NOT in WEAPON_ORDER) ---
  //
  // These carry extra behavior flags (handled in entities.js):
  //   fire      : on hit, applies extra fire/burn to rock & enemies; short range
  //   pierce    : bullets pass through enemies and thin objects
  //   breakRock : deals greatly increased damage to rock/cover
  flame: {
    label: "火炎放射器",
    damage: 14,          // strong up close
    fireCooldown: 55,    // rapid stream
    magSize: 110,
    reloadTime: 2600,
    pellets: 3,          // a fuller cone of flame
    spread: 0.42,
    bulletSpeedMul: 0.6,
    rangeMul: 0.5,       // short reach, but melts anything near
    fire: true,
    breakRock: true,
  },
  piercer: {
    label: "貫通ライフル",
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
    label: "破岩砲",
    damage: 18,
    fireCooldown: 650,
    magSize: 6,
    reloadTime: 3000,
    pellets: 1,
    spread: 0.02,
    bulletSpeedMul: 1.1,
    rangeMul: 1.0,
    breakRock: true,
  },
};

// Cycle order for number-key selection and the F-key cycle.
// Special weapons are intentionally excluded; they are chest-only drops.
const WEAPON_ORDER = ["rifle", "sniper", "shotgun", "smg"];

// Special weapon keys a chest can drop (granted via grantSpecial/setWeapon).
const CHEST_LOOT = ["flame", "piercer", "rockbuster"];

// Resolve a weapon definition, defaulting to rifle for unknown keys.
function getWeapon(key) {
  return WEAPONS[key] || WEAPONS.rifle;
}

// bots.js — AI徘徊。2D平面(x,z)のみ扱いTHREE非依存（本番も座標系は平面のままの前提と同じ）
const Bots = (function () {
  'use strict';

  function makeUnit(x, z) {
    return { x, z, tx: x, tz: z, speed: 3.5, yaw: 0, moving: false };
  }

  function pickTarget(u, bounds, rand) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * bounds.r * 0.85; // sqrtで円内一様
    u.tx = bounds.cx + Math.cos(a) * r;
    u.tz = bounds.cz + Math.sin(a) * r;
  }

  function update(units, bounds, dt, rand) {
    for (const u of units) {
      const dx = u.tx - u.x, dz = u.tz - u.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.5) { pickTarget(u, bounds, rand); u.moving = false; continue; }
      u.moving = true;
      u.yaw = Math.atan2(dx, dz);
      const step = Math.min(u.speed * dt, d);
      u.x += dx / d * step;
      u.z += dz / d * step;
    }
  }

  return { makeUnit, pickTarget, update };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Bots;

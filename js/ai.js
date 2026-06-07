// Lightweight AI used by every non-player unit (allies and enemies).
// Behaviour: find the nearest visible enemy, keep at a comfortable range,
// strafe a little, and shoot when there's a clear line of sight. Units that
// are hurt look for the nearest rock to use as cover.
class AIController {
  constructor() {
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.strafeTimer = V.randRange(600, 1400);
    this.repathTimer = 0;
    this.wanderAngle = Math.random() * Math.PI * 2;
    // ~40% of units are "assaulters" that push the enemy fort when not pinned
    // by a nearby foe — this makes the destroy-the-fort condition a real threat.
    this.assaulter = Math.random() < 0.4;
  }

  update(self, dt, game) {
    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeDir *= -1;
      this.strafeTimer = V.randRange(600, 1400);
    }

    const target = this.findTarget(self, game);

    // Assaulters head for the enemy fort unless an enemy is right on top of them.
    if (this.assaulter) {
      const fort = game.enemyBaseOf(self);
      const nearDist = target ? V.dist(self.x, self.y, target.x, target.y) : Infinity;
      if (fort && fort.hp > 0 && nearDist > 200) {
        this.assaultFort(self, dt, game, fort);
        return;
      }
    }

    if (!target) {
      this.wander(self, dt, game);
      return;
    }

    const d = V.dist(self.x, self.y, target.x, target.y);
    const hasLOS = !game.map.blockedBetween(self.x, self.y, target.x, target.y);

    // Aim with a bit of error based on skill (1 = perfect).
    const baseAngle = Math.atan2(target.y - self.y, target.x - self.x);
    const spread = (1 - self.skill) * 0.5;
    self.aim = baseAngle + V.randRange(-spread, spread);

    if (hasLOS && d <= CONFIG.unit.range) {
      // Engage: hold range and strafe; shoot when roughly on target.
      const preferred = 220;
      let mx = 0;
      let my = 0;
      if (d > preferred + 30) {        // close in
        mx = Math.cos(baseAngle);
        my = Math.sin(baseAngle);
      } else if (d < preferred - 40) { // back off
        mx = -Math.cos(baseAngle);
        my = -Math.sin(baseAngle);
      }
      // Strafe perpendicular to the target.
      mx += Math.cos(baseAngle + Math.PI / 2) * this.strafeDir * 0.7;
      my += Math.sin(baseAngle + Math.PI / 2) * this.strafeDir * 0.7;

      // When low on HP, prefer diving toward the nearest rock for cover.
      if (self.hp < 40) {
        const cover = this.nearestRock(self, game);
        if (cover) {
          mx = (cover.x - self.x);
          my = (cover.y - self.y);
        }
      }

      const len = Math.hypot(mx, my);
      if (len > 0) self.move(mx / len, my / len, game);

      // Fire less eagerly than before so the battlefield isn't a bullet storm.
      if (Math.random() < self.skill * 0.7) self.tryShoot(game);
    } else {
      // No clear shot: advance toward the target to find an angle.
      const len = Math.hypot(target.x - self.x, target.y - self.y) || 1;
      self.move((target.x - self.x) / len, (target.y - self.y) / len, game);
    }
  }

  findTarget(self, game) {
    let best = null;
    let bestDist = Infinity;
    for (const u of game.units) {
      if (!u.alive || u.team === self.team) continue;
      const d = V.dist(self.x, self.y, u.x, u.y);
      // Units hiding in a forest are only spotted up close.
      if (game.map.inForest(u.x, u.y) && d > CONFIG.forestDetectRange) continue;
      if (d < bestDist) {
        bestDist = d;
        best = u;
      }
    }
    return best;
  }

  // Advance on the enemy fort core and shoot it down.
  assaultFort(self, dt, game, fort) {
    const baseAngle = Math.atan2(fort.y - self.y, fort.x - self.x);
    const d = V.dist(self.x, self.y, fort.x, fort.y);
    const hasLOS = !game.map.blockedBetween(self.x, self.y, fort.x, fort.y);
    self.aim = baseAngle;
    if (hasLOS && d <= CONFIG.unit.range) {
      // Hold just outside the structure and pour fire into it.
      if (d > fort.coreR + 80) self.move(Math.cos(baseAngle), Math.sin(baseAngle), game);
      if (Math.random() < self.skill * 0.7) self.tryShoot(game);
    } else {
      self.move(Math.cos(baseAngle), Math.sin(baseAngle), game);
    }
  }

  nearestRock(self, game) {
    let best = null;
    let bestDist = Infinity;
    for (const rock of game.map.rocks) {
      const d = V.dist(self.x, self.y, rock.x, rock.y);
      if (d < bestDist) { bestDist = d; best = rock; }
    }
    return best;
  }

  wander(self, dt, game) {
    this.repathTimer -= dt;
    if (this.repathTimer <= 0) {
      this.wanderAngle += V.randRange(-0.8, 0.8);
      this.repathTimer = V.randRange(500, 1200);
    }
    // Drift toward the enemy half of the map so fights actually start.
    const towardCenter = self.team === "blue" ? 0 : Math.PI;
    const ang = this.wanderAngle * 0.5 + towardCenter * 0.5;
    self.aim = ang;
    self.move(Math.cos(ang), Math.sin(ang), game);
  }
}

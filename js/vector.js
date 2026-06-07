// Small math / geometry helpers shared across the game.
const V = {
  dist(ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    return Math.hypot(dx, dy);
  },

  clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  },

  // Shortest distance from point (px,py) to the segment a->b.
  pointSegmentDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return V.dist(px, py, ax, ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = V.clamp(t, 0, 1);
    return V.dist(px, py, ax + t * dx, ay + t * dy);
  },

  // True when the segment a->b passes through the circle (cx,cy,r).
  segmentHitsCircle(ax, ay, bx, by, cx, cy, r) {
    return V.pointSegmentDist(cx, cy, ax, ay, bx, by) <= r;
  },

  randRange(min, max) {
    return min + Math.random() * (max - min);
  },
};

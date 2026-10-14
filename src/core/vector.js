/**
 * 2D Vector & Geometry Utility
 * Used for physics, LiDAR raycasting, collision calculations, and path interpolation.
 */

export class Vector2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  set(x, y) {
    this.x = x;
    this.y = y;
    return this;
  }

  clone() {
    return new Vector2(this.x, this.y);
  }

  add(v) {
    return new Vector2(this.x + v.x, this.y + v.y);
  }

  sub(v) {
    return new Vector2(this.x - v.x, this.y - v.y);
  }

  scale(s) {
    return new Vector2(this.x * s, this.y * s);
  }

  length() {
    return Math.hypot(this.x, this.y);
  }

  lengthSq() {
    return this.x * this.x + this.y * this.y;
  }

  normalize() {
    const len = this.length();
    if (len === 0) return new Vector2(0, 0);
    return new Vector2(this.x / len, this.y / len);
  }

  dist(v) {
    return Math.hypot(this.x - v.x, this.y - v.y);
  }

  distSq(v) {
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    return dx * dx + dy * dy;
  }

  dot(v) {
    return this.x * v.x + this.y * v.y;
  }

  cross(v) {
    return this.x * v.y - this.y * v.x;
  }

  angle() {
    return Math.atan2(this.y, this.x);
  }

  static fromAngle(rad, length = 1) {
    return new Vector2(Math.cos(rad) * length, Math.sin(rad) * length);
  }

  static lerp(a, b, t) {
    return new Vector2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
  }
}

/**
 * Normalizes an angle into the range [-PI, PI]
 */
export function normalizeAngle(angle) {
  while (angle > Math.PI) angle -= 2 * Math.PI;
  while (angle < -Math.PI) angle += 2 * Math.PI;
  return angle;
}

/**
 * Line segment to line segment intersection
 * Returns { hit: boolean, point: Vector2, dist: number } or null
 */
export function intersectSegments(p1, p2, p3, p4) {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-6) return null; // parallel

  const u = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const v = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;

  if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
    const hitX = p1.x + u * (p2.x - p1.x);
    const hitY = p1.y + u * (p2.y - p1.y);
    return {
      hit: true,
      point: new Vector2(hitX, hitY),
      dist: Math.hypot(hitX - p1.x, hitY - p1.y),
      param: u,
    };
  }
  return null;
}

/**
 * Ray to Circle intersection
 * Ray origin p, direction dir (normalized), circle center c, radius r
 * Returns closest hit distance along ray >= 0, or null
 */
export function intersectRayCircle(p, dir, c, r) {
  const m = p.sub(c);
  const b = m.dot(dir);
  const cVal = m.dot(m) - r * r;

  // If origin is outside circle and ray points away
  if (cVal > 0 && b > 0) return null;

  const discr = b * b - cVal;
  if (discr < 0) return null; // No intersection

  let t = -b - Math.sqrt(discr);
  if (t < 0) t = -b + Math.sqrt(discr); // origin was inside
  if (t < 0) return null;

  return {
    dist: t,
    point: p.add(dir.scale(t)),
  };
}

/**
 * Ray to Axis-Aligned Bounding Box (AABB) intersection
 * box: { x, y, width, height }
 */
export function intersectRayBox(p, dir, box) {
  const minX = box.x;
  const maxX = box.x + box.width;
  const minY = box.y;
  const maxY = box.y + box.height;

  let tmin = -Infinity;
  let tmax = Infinity;

  // X slab
  if (Math.abs(dir.x) > 1e-6) {
    const tx1 = (minX - p.x) / dir.x;
    const tx2 = (maxX - p.x) / dir.x;
    tmin = Math.max(tmin, Math.min(tx1, tx2));
    tmax = Math.min(tmax, Math.max(tx1, tx2));
  } else if (p.x < minX || p.x > maxX) {
    return null;
  }

  // Y slab
  if (Math.abs(dir.y) > 1e-6) {
    const ty1 = (minY - p.y) / dir.y;
    const ty2 = (maxY - p.y) / dir.y;
    tmin = Math.max(tmin, Math.min(ty1, ty2));
    tmax = Math.min(tmax, Math.max(ty1, ty2));
  } else if (p.y < minY || p.y > maxY) {
    return null;
  }

  if (tmax < tmin || tmax < 0) return null;

  const t = tmin >= 0 ? tmin : tmax;
  if (t < 0) return null;

  return {
    dist: t,
    point: p.add(dir.scale(t)),
  };
}

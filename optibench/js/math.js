export const EPS = 1e-6;

export function vec(x = 0, y = 0) { return { x, y }; }
export function add(a, b) { return { x: a.x + b.x, y: a.y + b.y }; }
export function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }
export function mul(a, s) { return { x: a.x * s, y: a.y * s }; }
export function dot(a, b) { return a.x * b.x + a.y * b.y; }
export function cross(a, b) { return a.x * b.y - a.y * b.x; }
export function len(a) { return Math.hypot(a.x, a.y); }
export function norm(a) { const l = len(a); return l > EPS ? mul(a, 1 / l) : { x: 1, y: 0 }; }
export function perp(a) { return { x: -a.y, y: a.x }; }
export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function lerpVec(a, b, t) { return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) }; }
export function degToRad(v) { return v * Math.PI / 180; }
export function radToDeg(v) { return v * 180 / Math.PI; }
export function angleVec(deg) { const a = degToRad(deg); return { x: Math.cos(a), y: Math.sin(a) }; }
export function wrapAngle(deg) { let a = deg % 360; if (a < -180) a += 360; if (a >= 180) a -= 360; return a; }
export function rotate(v, deg) { const a = degToRad(deg); const c = Math.cos(a); const s = Math.sin(a); return { x: c*v.x - s*v.y, y: s*v.x + c*v.y }; }
export function localToWorld(p, center, angleDeg) { return add(center, rotate(p, angleDeg)); }
export function worldToLocal(p, center, angleDeg) { return rotate(sub(p, center), -angleDeg); }
export function reflect(d, normal) { const n = norm(normal); return norm(sub(d, mul(n, 2 * dot(d, n)))); }

export function refract(d, normalAgainstIncident, n1, n2) {
  const i = norm(d);
  const n = norm(normalAgainstIncident);
  const eta = n1 / n2;
  const cosI = clamp(-dot(n, i), -1, 1);
  const k = 1 - eta * eta * (1 - cosI * cosI);
  if (k < 0) return null;
  return norm(add(mul(i, eta), mul(n, eta * cosI - Math.sqrt(k))));
}

export function raySegmentIntersection(origin, dir, a, b) {
  const v1 = sub(origin, a);
  const v2 = sub(b, a);
  const den = cross(dir, v2);
  if (Math.abs(den) < EPS) return null;
  const t = cross(v2, v1) / den;
  const u = cross(dir, v1) / den;
  if (t > 1e-4 && u >= -EPS && u <= 1 + EPS) {
    return { t, u, point: add(origin, mul(dir, t)) };
  }
  return null;
}

export function distancePointSegment(p, a, b) {
  const ab = sub(b, a);
  const denom = dot(ab, ab);
  if (denom < EPS) return len(sub(p, a));
  const t = clamp(dot(sub(p, a), ab) / denom, 0, 1);
  return len(sub(p, add(a, mul(ab, t))));
}

export function polygonContains(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y)) &&
      (point.x < (xj - xi) * (point.y - yi) / ((yj - yi) || EPS) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function polygonSignedArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export function nearestPointOnSegment(p, a, b) {
  const ab = sub(b, a);
  const t = clamp(dot(sub(p, a), ab) / Math.max(dot(ab, ab), EPS), 0, 1);
  return { point: add(a, mul(ab, t)), t };
}

export function gaussian(x, sigma) {
  if (sigma <= 0) return x === 0 ? 1 : 0;
  return Math.exp(-0.5 * (x / sigma) ** 2);
}

export function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }
export function uid(prefix = 'obj') { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`; }

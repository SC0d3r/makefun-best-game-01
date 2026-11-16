// Small, dependency-free numeric helpers shared by the art layer and the
// gameplay modules. Every function here is deterministic: the same inputs give
// the same output on every run, which is what lets the gardens be rebuilt from
// a seed alone.

/** Full turn in radians. */
export const TAU = Math.PI * 2;

/** Clamp `value` into the inclusive range [min, max]. */
export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/** Linear interpolation from `a` to `b` by `t` (t is not clamped). */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Smoothstep over 0..1: zero slope at both ends, clamped outside the range. */
export function smooth(t) {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
}

/** Cubic ease-out over 0..1, clamped outside the range. */
export function easeOut(t) {
  const u = clamp(t, 0, 1);
  const inv = 1 - u;
  return 1 - inv * inv * inv;
}

/**
 * Move `current` toward `target` by at most `maxDelta`.
 * A negative `maxDelta` is treated as its absolute value.
 */
export function approach(current, target, maxDelta) {
  const step = Math.abs(maxDelta);
  if (current < target) return Math.min(current + step, target);
  return Math.max(current - step, target);
}

/** Squared distance between two points. */
export function dist2(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
}

/** Euclidean distance between two points. */
export function dist(x1, y1, x2, y2) {
  return Math.sqrt(dist2(x1, y1, x2, y2));
}

/** Degrees to radians. */
export function rad(degrees) {
  return (degrees * Math.PI) / 180;
}

// A 32-bit integer mixer. Both hash() and hashAt() use it so that neighbouring
// inputs land far apart instead of producing visible bands.
function mix32(value) {
  let h = value | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Deterministic value in [0, 1) for a number. Integer inputs are the common
 * case; a fractional part is folded in too, so hash(1) and hash(1.5) differ.
 */
export function hash(n) {
  const value = Number.isFinite(n) ? n : 0;
  const whole = Math.floor(value);
  const fraction = Math.round((value - whole) * 0x100000) | 0;
  let h = mix32(whole) ^ mix32(fraction + 0x9e3779b9);
  h = mix32(h ^ 0x85ebca6b);
  return h / 0x100000000;
}

/**
 * Deterministic value in [0, 1) from a world coordinate and a seed.
 * `x` may be fractional; it is quantised finely so nearby samples still differ.
 */
export function hashAt(x, seed) {
  const px = Math.floor((Number.isFinite(x) ? x : 0) * 0x400) | 0;
  const ps = (Number.isFinite(seed) ? seed : 0) | 0;
  let h = Math.imul(px ^ 0x27d4eb2d, 0x165667b1);
  h ^= Math.imul(ps + 0x9e3779b9, 0x85ebca6b);
  h = mix32(h);
  return h / 0x100000000;
}

/**
 * Small, fast, seeded PRNG (Mulberry32). Returns a function that yields
 * numbers in [0, 1). Used for deterministic layout instead of Math.random.
 */
export function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * True when a circle overlaps an axis-aligned rectangle.
 * Rectangle arguments are x, y, width, height in the same space as the circle.
 */
export function circleRect(cx, cy, r, rx, ry, rw, rh) {
  const closestX = clamp(cx, rx, rx + rw);
  const closestY = clamp(cy, ry, ry + rh);
  return dist2(cx, cy, closestX, closestY) <= r * r;
}

/** Seconds as a clock string: 67 -> "1:07", 5 -> "0:05". */
export function formatTime(seconds) {
  const total = Math.floor(Math.max(0, Number.isFinite(seconds) ? seconds : 0));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

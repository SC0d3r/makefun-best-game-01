// A fixed pool of glow sparks.
//
// The pool is allocated once, up front, and every spawn() reuses a slot, so a
// busy frame never creates garbage. Slots are handed out in a ring: once the
// pool is full the next spawn overwrites the oldest particle first.

import { TAU, clamp } from './utils.js';

// Plain spawn() calls get a still, unlit spark; burst() supplies its own feel.
const DEFAULT_OPTIONS = Object.freeze({});
const BURST_OPTIONS = Object.freeze({
  drag: 1.6,
  gravity: 42,
  glow: true,
  fade: 1.5,
});

function makeParticle() {
  return {
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 1,
    age: 0,
    size: 1,
    color: '#ffffff',
    gravity: 0,
    drag: 0,
    glow: false,
    ring: false,
    spin: 0,
    angle: 0,
    fade: 1,
    radius: 0,
    grow: 0,
    width: 1,
  };
}

export class Particles {
  /** @param {number} [count] pool size; no particle objects are made after this. */
  constructor(count = 420) {
    this.count = Math.max(1, Math.floor(count));
    this.pool = new Array(this.count);
    for (let i = 0; i < this.count; i++) this.pool[i] = makeParticle();
    this.cursor = 0;
  }

  /**
   * Emit one particle. Returns the reusable record (handy for tests) but
   * callers should not keep it: it will be recycled.
   */
  spawn(x, y, vx, vy, life, size, color, options) {
    // The slot at the cursor is always the oldest one in the ring.
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.count;
    const o = options || DEFAULT_OPTIONS;

    p.active = true;
    p.x = Number.isFinite(x) ? x : 0;
    p.y = Number.isFinite(y) ? y : 0;
    p.vx = Number.isFinite(vx) ? vx : 0;
    p.vy = Number.isFinite(vy) ? vy : 0;
    p.maxLife = Number.isFinite(life) ? Math.max(0.02, life) : 0.5;
    p.life = p.maxLife;
    p.age = 0;
    p.size = Number.isFinite(size) ? Math.max(0.1, size) : 1;
    p.color = color || '#ffffff';
    p.gravity = Number.isFinite(o.gravity) ? o.gravity : 0;
    p.drag = Number.isFinite(o.drag) ? o.drag : 0;
    p.glow = !!o.glow;
    p.ring = !!o.ring;
    p.spin = Number.isFinite(o.spin) ? o.spin : 0;
    p.angle = Number.isFinite(o.angle) ? o.angle : 0;
    p.fade = Number.isFinite(o.fade) ? Math.max(0.2, o.fade) : 1;
    p.radius = p.size;
    p.grow = Number.isFinite(o.grow)
      ? o.grow
      : p.ring
        ? Math.max(20, Math.sqrt(p.vx * p.vx + p.vy * p.vy))
        : 0;
    p.width = Number.isFinite(o.width) ? Math.max(0.4, o.width) : Math.max(0.8, p.size * 0.24);
    return p;
  }

  /** Spray `count` particles in random directions from one point. */
  burst(x, y, count, color, speed, life, size) {
    const total = Math.max(0, Math.min(this.count, Math.floor(count)));
    for (let i = 0; i < total; i++) {
      const angle = Math.random() * TAU;
      const pace = speed * (0.35 + Math.random() * 0.65);
      const span = life * (0.7 + Math.random() * 0.6);
      const radius = size * (0.65 + Math.random() * 0.7);
      this.spawn(
        x,
        y,
        Math.cos(angle) * pace,
        Math.sin(angle) * pace,
        span,
        radius,
        color,
        BURST_OPTIONS,
      );
    }
  }

  /** Kill every particle and restart the ring at the beginning. */
  clear() {
    for (let i = 0; i < this.count; i++) {
      const p = this.pool[i];
      p.active = false;
      p.life = 0;
    }
    this.cursor = 0;
  }

  update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const step = Math.min(dt, 0.1);

    for (let i = 0; i < this.count; i++) {
      const p = this.pool[i];
      if (!p.active) continue;

      p.life -= step;
      if (p.life <= 0) {
        p.life = 0;
        p.active = false;
        continue;
      }
      p.age += step;

      if (p.ring) {
        // Rings do not travel; they expand where they were born.
        p.radius += p.grow * step;
        if (p.drag > 0) p.grow *= Math.exp(-p.drag * step);
      } else {
        p.vy += p.gravity * step;
        if (p.drag > 0) {
          const damp = Math.exp(-p.drag * step);
          p.vx *= damp;
          p.vy *= damp;
        }
        p.x += p.vx * step;
        p.y += p.vy * step;
      }
      if (p.spin !== 0) p.angle += p.spin * step;
    }
  }

  /** Draw every live particle in world space. */
  draw(ctx) {
    ctx.save();
    for (let i = 0; i < this.count; i++) {
      const p = this.pool[i];
      if (!p.active || p.life <= 0) continue;

      const t = clamp(p.life / p.maxLife, 0, 1);
      const alpha = Math.pow(t, p.fade);

      if (p.ring) {
        ctx.globalCompositeOperation = p.glow ? 'lighter' : 'source-over';
        ctx.globalAlpha = alpha * 0.82;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(0.6, p.width * (0.35 + 0.65 * t));
        if (p.glow) {
          ctx.shadowColor = p.color;
          ctx.shadowBlur = Math.min(26, p.radius * 0.55);
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, p.radius), 0, TAU);
        ctx.stroke();
        if (p.glow) ctx.shadowBlur = 0;
      } else {
        ctx.globalCompositeOperation = p.glow ? 'lighter' : 'source-over';
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        if (p.glow) {
          ctx.shadowColor = p.color;
          ctx.shadowBlur = Math.min(18, p.size * 3);
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.35, p.size * (0.45 + 0.55 * t)), 0, TAU);
        ctx.fill();
        if (p.glow) ctx.shadowBlur = 0;
      }
    }
    ctx.restore();
  }
}

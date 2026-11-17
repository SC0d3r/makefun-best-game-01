// Dusk bats: the one thing in the garden that wants the lantern moth's light.
//
// Each bat owns a small patch of cave, drifts around it on a slow figure, and
// switches to a direct chase when the moth comes close. A lantern pulse scares
// it away for a moment. All motion stays inside the cave and outside boulders.

import { TAU, clamp, dist2, hash } from './gardens.js';
import { caveAt } from './world.js';

export class Bat {
  /**
   * @param {object} garden the current garden config (seed, accent, ...)
   * @param {object} data   one entry from world.bats
   * @param {number} index  its position in that list, used for fallbacks
   */
  constructor(garden, data, index) {
    const d = data || {};
    const seed = garden && Number.isFinite(garden.seed) ? garden.seed : 0;
    const slot = Number.isFinite(index) ? index : 0;

    this.x = finite(d.x, 0);
    this.y = finite(d.y, 0);
    this.homeX = finite(d.homeX, this.x);
    this.homeY = finite(d.homeY, this.y);
    this.r = Math.max(6, finite(d.radius, 14));
    this.radius = this.r;
    this.speed = Math.max(24, finite(d.speed, 70));
    this.phase = finite(d.phase, 0);

    // Never leave range undefined: derive it from the garden seed instead.
    this.range = Math.max(20, finite(d.range, 90 + hash(slot + seed) * 90));

    this.vx = 0;
    this.vy = 0;
    this.facing = 1;
    this.time = 0;
    this.flap = 0;
    this.frightened = 0;
    this.chasing = false;
    this.vision = 285;
    this.accent = garden && garden.accent ? garden.accent : '#ffd685';
  }

  /** @param {number} dt @param {object} game the shared game object */
  update(dt, game) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const step = Math.min(dt, 0.05);
    this.time += step;

    if (this.frightened > 0) {
      this.frightened = Math.max(0, this.frightened - step);
    }

    const player = game && game.player;
    const hasPlayer = player && !player.dead;
    const dx = hasPlayer ? player.x - this.x : 0;
    const dy = hasPlayer ? player.y - this.y : 0;
    const distance = hasPlayer ? Math.sqrt(dx * dx + dy * dy) : Infinity;

    this.chasing = !!hasPlayer && this.frightened <= 0 && distance < this.vision;

    let targetX = this.x;
    let targetY = this.y;
    let maxSpeed = this.speed;

    if (this.frightened > 0) {
      // Run directly away from the lantern, fast enough to clear its pulse.
      const inv = distance > 0.001 ? 1 / distance : 0;
      targetX = this.x - dx * inv * 260;
      targetY = this.y - dy * inv * 260;
      maxSpeed = 210;
    } else if (this.chasing) {
      targetX = player.x;
      targetY = player.y;
      maxSpeed = this.speed * 1.4;
    } else {
      // A slow lissajous figure around the roost: wide across, shallow up and
      // down, so the bat looks like it is idly circling rather than patrolling
      // a line.
      const pace = 0.5 + this.speed * 0.0035;
      const angle = this.time * pace + this.phase;
      targetX = this.homeX + Math.cos(angle) * this.range;
      targetY = this.homeY + Math.sin(angle * 2 + this.phase * 0.7) * this.range * 0.34;
    }

    const tx = targetX - this.x;
    const ty = targetY - this.y;
    const reach = Math.sqrt(tx * tx + ty * ty);
    const accel = this.frightened > 0 ? 1900 : this.chasing ? 1250 : 430;

    if (reach > 0.001) {
      this.vx += (tx / reach) * accel * step;
      this.vy += (ty / reach) * accel * step;
    }

    // Exponential damping keeps the patrol loose instead of snappy.
    const damp = Math.exp(-3.2 * step);
    this.vx *= damp;
    this.vy *= damp;

    let speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (speed > maxSpeed) {
      const scale = maxSpeed / speed;
      this.vx *= scale;
      this.vy *= scale;
      speed = maxSpeed;
    }

    this.x += this.vx * step;
    this.y += this.vy * step;

    const world = game && game.world;
    if (world) {
      clampToCave(world, this, this.r);
      pushOutOfIslands(world, this, this.r, 0.55);
    }

    if (Math.abs(this.vx) > 4) this.facing = this.vx > 0 ? 1 : -1;
    this.flap += step * (5.5 + speed * 0.05 + (this.chasing ? 3 : 0));

    // Contact hurts only while the bat is brave and the moth is vulnerable.
    if (this.frightened <= 0 && hasPlayer && !(player.invuln > 0)) {
      const reach2 = this.r + 15;
      if (dist2(this.x, this.y, player.x, player.y) < reach2 * reach2) {
        player.damage(this.x, this.y, game);
      }
    }
  }

  draw(ctx) {
    const r = this.r;
    const flap = Math.sin(this.flap);
    const foreshorten = 0.55 + 0.45 * Math.abs(flap);
    const tilt = clamp(this.vy / 2200, -0.24, 0.24) + clamp(this.vx / 4200, -0.1, 0.1);

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(tilt * this.facing);
    ctx.scale(this.facing, 1);

    // A faint cool aura separates the near-black bat from a teal or red cave.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const aura = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r * 3.1);
    aura.addColorStop(0, 'rgba(150,205,235,0.16)');
    aura.addColorStop(0.55, 'rgba(105,165,205,0.07)');
    aura.addColorStop(1, 'rgba(85,145,190,0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, 0, r * 3.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Both wings sit behind the body so the small angular body stays readable.
    this.drawWing(ctx, r, -1, flap, foreshorten, false);
    this.drawWing(ctx, r, 1, flap, foreshorten, true);
    this.drawBody(ctx, r);
    this.drawFace(ctx, r);

    ctx.restore();
  }

  drawWing(ctx, r, side, flap, foreshorten, near) {
    ctx.save();
    ctx.translate(-0.12 * r, side * 0.08 * r);
    ctx.rotate(side * 0.07 + flap * 0.18);
    if (side < 0) ctx.scale(1, -1);
    ctx.scale(1, foreshorten);

    const grad = ctx.createLinearGradient(-0.4 * r, 0, 0.8 * r, 2 * r);
    grad.addColorStop(0, near ? '#141b27' : '#070b12');
    grad.addColorStop(0.55, near ? '#1d2839' : '#0e1520');
    grad.addColorStop(1, near ? '#28384c' : '#151e2c');

    // Swept, angular wing with two scalloped notches on the trailing edge.
    ctx.beginPath();
    ctx.moveTo(-0.35 * r, 0);
    ctx.quadraticCurveTo(0.5 * r, 0.12 * r, 0.95 * r, 0.88 * r);
    ctx.quadraticCurveTo(1.18 * r, 1.42 * r, 1.3 * r, 2.02 * r);
    ctx.quadraticCurveTo(0.55 * r, 1.62 * r, 0.24 * r, 1.24 * r);
    ctx.quadraticCurveTo(-0.2 * r, 1.45 * r, -0.5 * r, 1.12 * r);
    ctx.quadraticCurveTo(-0.7 * r, 0.62 * r, -0.35 * r, 0);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Pale rim along the top/leading edge, the shape that reads first.
    ctx.strokeStyle = near ? 'rgba(205,234,248,0.6)' : 'rgba(160,198,220,0.34)';
    ctx.lineWidth = near ? 1.5 : 1.1;
    ctx.beginPath();
    ctx.moveTo(-0.35 * r, 0);
    ctx.quadraticCurveTo(0.5 * r, 0.12 * r, 0.95 * r, 0.88 * r);
    ctx.quadraticCurveTo(1.18 * r, 1.42 * r, 1.3 * r, 2.02 * r);
    ctx.stroke();

    ctx.restore();
  }

  drawBody(ctx, r) {
    const body = ctx.createLinearGradient(-r, -0.35 * r, 0.9 * r, 0.3 * r);
    body.addColorStop(0, '#04060a');
    body.addColorStop(0.5, '#0e1420');
    body.addColorStop(1, '#1a2333');

    ctx.beginPath();
    ctx.moveTo(-1.15 * r, 0.18 * r);
    ctx.lineTo(-0.6 * r, -0.2 * r);
    ctx.lineTo(0.3 * r, -0.3 * r);
    ctx.lineTo(0.78 * r, -0.18 * r);
    ctx.lineTo(0.9 * r, 0.04 * r);
    ctx.lineTo(0.45 * r, 0.32 * r);
    ctx.lineTo(-0.35 * r, 0.4 * r);
    ctx.closePath();
    ctx.fillStyle = body;
    ctx.fill();

    // Two pointed ears make the head unmistakably bat-like at small sizes.
    ctx.fillStyle = '#090e16';
    ctx.beginPath();
    ctx.moveTo(0.58 * r, -0.26 * r);
    ctx.lineTo(0.42 * r, -0.82 * r);
    ctx.lineTo(0.24 * r, -0.32 * r);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0.82 * r, -0.18 * r);
    ctx.lineTo(0.84 * r, -0.7 * r);
    ctx.lineTo(1.0 * r, -0.12 * r);
    ctx.closePath();
    ctx.fill();

    // Pale rim along the spine.
    ctx.strokeStyle = 'rgba(196,226,242,0.42)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-0.55 * r, -0.18 * r);
    ctx.lineTo(0.3 * r, -0.28 * r);
    ctx.lineTo(0.76 * r, -0.16 * r);
    ctx.stroke();
  }

  drawFace(ctx, r) {
    const eye = Math.max(1.7, r * 0.14);
    ctx.fillStyle = this.accent;
    ctx.shadowColor = this.accent;
    ctx.shadowBlur = 13;
    ctx.beginPath();
    ctx.arc(0.64 * r, -0.2 * r, eye, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0.88 * r, -0.09 * r, eye, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // A hot centre keeps the eyes bright after the glow pass dims them.
    ctx.fillStyle = '#fff9e6';
    ctx.beginPath();
    ctx.arc(0.64 * r, -0.2 * r, eye * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0.88 * r, -0.09 * r, eye * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }
}

// A fixed pool of glow sparks.
//
// The pool is allocated once, up front, and every spawn() reuses a slot, so a
// busy frame never creates garbage. Slots are handed out in a ring: once the
// pool is full the next spawn overwrites the oldest particle first.

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

const NO_ISLANDS = [];

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

/** Clamp a body between the cave walls, bouncing softly off them. */
function clampToCave(world, body, radius) {
  if (typeof world.clampToCave === 'function') {
    world.clampToCave(body, radius);
    return;
  }

  // Fallback for a world that only exposes the read-only cave helpers.
  const corridor =
    typeof world.corridorFor === 'function'
      ? world.corridorFor(body.x, radius)
      : caveAt(world.garden, body.x);
  const top = corridor.ceiling + radius;
  const bottom = corridor.floor - radius;
  if (body.y < top) {
    body.y = top;
    if (body.vy < 0) body.vy *= -0.35;
  } else if (body.y > bottom) {
    body.y = bottom;
    if (body.vy > 0) body.vy *= -0.35;
  }

  const left = radius;
  const right = Number.isFinite(world.length) ? world.length - radius : Infinity;
  if (body.x < left) {
    body.x = left;
    if (body.vx < 0) body.vx *= -0.35;
  } else if (body.x > right) {
    body.x = right;
    if (body.vx > 0) body.vx *= -0.35;
  }
}

/**
 * Resolve a circle against every boulder, preserving tangential motion so a
 * glancing hit slides instead of sticking.
 */
function pushOutOfIslands(world, body, radius, restitution) {
  if (typeof world.islandPush === 'function') {
    const result = world.islandPush(body.x, body.y, radius);
    // A world implementation may return the corrected position. If it only
    // reports a hit, or returns nothing, the local pass below still fixes it.
    if (result && Number.isFinite(result.x) && Number.isFinite(result.y)) {
      body.x = result.x;
      body.y = result.y;
    }
  }

  const islands = world.islands || NO_ISLANDS;
  for (let pass = 0; pass < 2; pass++) {
    let moved = false;
    for (let i = 0; i < islands.length; i++) {
      const island = islands[i];
      const pad = island.r + radius;
      let dx = body.x - island.x;
      let dy = body.y - island.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= pad * pad) continue;

      let d = Math.sqrt(d2);
      if (d < 0.0001) {
        dx = 0;
        dy = -1;
        d = 1;
      }
      const nx = dx / d;
      const ny = dy / d;
      body.x = island.x + nx * pad;
      body.y = island.y + ny * pad;

      const inward = body.vx * nx + body.vy * ny;
      if (inward < 0) {
        body.vx -= (1 + restitution) * inward * nx;
        body.vy -= (1 + restitution) * inward * ny;
      }
      moved = true;
    }
    if (!moved) break;
  }
}

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

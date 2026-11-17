// The lantern moth: the player's body, light and last three heartbeats.
//
// Movement is a simple accelerated drift with exponential damping, which keeps
// the moth floaty but still responsive. Collisions are resolved against the
// cave walls and boulders without ever stopping the tangential slide, so the
// moth brushes along rock instead of sticking to it.

import { TAU, clamp, easeOut } from './gardens.js';
import { caveAt } from './world.js';

export class Player {
  constructor(world) {
    const spawn = (world && world.spawn) || { x: 0, y: 0 };

    this.x = Number.isFinite(spawn.x) ? spawn.x : 0;
    this.y = Number.isFinite(spawn.y) ? spawn.y : 0;
    this.vx = 0;
    this.vy = 0;

    this.r = 13;
    this.hearts = 3;
    this.maxHearts = 3;
    this.oil = 100;
    this.maxOil = 100;
    this.seeds = 0;
    this.score = 0;
    this.invuln = 0;
    this.pulse = 0;
    this.cooldown = 0;
    this.facing = 1;
    this.wing = 0;
    this.trail = 0;
    this.dead = false;
    this.time = 0;
  }

  /** One fixed step of flight, light and damage bookkeeping. */
  update(dt, input, world, game) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const step = Math.min(dt, 0.05);
    this.time += step;

    if (this.dead) {
      // The body drifts to a stop under the game-over card.
      this.vx *= Math.exp(-2.4 * step);
      this.vy *= Math.exp(-2.4 * step);
      this.x += this.vx * step;
      this.y += this.vy * step;
      if (world) {
        clampToCave(world, this, this.r);
        pushOutOfIslands(world, this, this.r, 0.5);
      }
      this.wing += step * 5;
      this.invuln = Math.max(0, this.invuln - step);
      this.pulse = Math.max(0, this.pulse - step);
      this.cooldown = Math.max(0, this.cooldown - step);
      return;
    }

    const axis = input ? input.axis() : { x: 0, y: 0 };
    this.vx += axis.x * ACCELERATION * step;
    this.vy += axis.y * ACCELERATION * step;

    const damp = Math.exp(-DRAG * step);
    this.vx *= damp;
    this.vy *= damp;

    let speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (speed > MAX_SPEED) {
      const scale = MAX_SPEED / speed;
      this.vx *= scale;
      this.vy *= scale;
      speed = MAX_SPEED;
    }

    this.x += this.vx * step;
    this.y += this.vy * step;

    if (world) {
      clampToCave(world, this, this.r);
      pushOutOfIslands(world, this, this.r, 0.5);
    }

    // The lantern burns whether or not the moth is moving.
    this.oil = Math.max(0, this.oil - OIL_DRAIN * step);
    if (this.oil <= 0) {
      this.oil = 0;
      this.dead = true;
      if (game && typeof game.lose === 'function') {
        game.lose('The lantern has gone dark.');
      }
      return;
    }

    // Timers from the previous frame tick down before this frame's actions, so
    // a fresh pulse or hit keeps its full duration for the frame it starts.
    this.invuln = Math.max(0, this.invuln - step);
    this.pulse = Math.max(0, this.pulse - step);
    this.cooldown = Math.max(0, this.cooldown - step);

    // A lantern pulse: costs oil, clears space around the moth and scares bats.
    if (
      input &&
      input.hit('Space') &&
      this.cooldown <= 0 &&
      this.oil >= PULSE_COST
    ) {
      this.oil = Math.max(0, this.oil - PULSE_COST);
      this.pulse = PULSE_TIME;
      this.cooldown = PULSE_COOLDOWN;

      if (game && typeof game.pulse === 'function') game.pulse();

      const bats = game && game.bats;
      if (bats) {
        for (const bat of bats) {
          const reachX = bat.x - this.x;
          const reachY = bat.y - this.y;
          if (reachX * reachX + reachY * reachY <= PULSE_RADIUS * PULSE_RADIUS) {
            bat.frightened = Math.max(Number.isFinite(bat.frightened) ? bat.frightened : 0, 1.6);
            if (game && typeof game.startle === 'function') game.startle();
          }
        }
      }
    }

    this.invuln = Math.max(0, this.invuln - step);
    this.pulse = Math.max(0, this.pulse - step);
    this.cooldown = Math.max(0, this.cooldown - step);

    speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    this.wing += step * (8.5 + speed * 0.055);
    if (Math.abs(this.vx) > 12) this.facing = this.vx > 0 ? 1 : -1;

    // A warm trail behind a fast moth. The timer resets at the interval rather
    // than carrying an unbounded remainder.
    this.trail += step;
    if (this.trail >= TRAIL_INTERVAL) {
      this.trail = 0;
      if (speed > 40) this.emitTrail(game, speed);
    }
  }

  emitTrail(game, speed) {
    if (!game || !game.particles || typeof game.particles.spawn !== 'function') return;

    const dirX = this.vx / speed;
    const dirY = this.vy / speed;
    const wobble = Math.sin(this.time * 19 + this.wing * 0.7);
    const life = 0.45 + 0.12 * (0.5 + 0.5 * Math.sin(this.time * 11));
    const size = 1.7 + 0.9 * (0.5 + 0.5 * Math.sin(this.time * 7.3));

    game.particles.spawn(
      this.x - dirX * this.r * 0.9 - dirY * wobble * 3,
      this.y - dirY * this.r * 0.9 + dirX * wobble * 3,
      -this.vx * 0.14 - dirY * wobble * 8,
      -this.vy * 0.14 + dirX * wobble * 8 - 4,
      life,
      size,
      '#ffc477',
      TRAIL_OPTIONS,
    );
  }

  /** Current lantern radius, including pulse growth and a low-oil flicker. */
  lightRadius() {
    let radius = 212;
    if (this.pulse > 0) {
      radius += 220 * easeOut(this.pulse / PULSE_TIME);
    }
    if (this.oil < 22) {
      // 0.5 .. 0.94, never fully dark: the moth is still visible to the player.
      const flicker =
        0.72 + 0.22 * Math.sin(this.time * 19 + Math.sin(this.time * 5.3) * 2.1);
      radius *= flicker;
    }
    return Math.max(96, radius);
  }

  /** A bat hit: lose a heart, blink, and get thrown away from the source. */
  damage(fromX, fromY, game) {
    if (this.invuln > 0 || this.dead) return;

    this.hearts = Math.max(0, this.hearts - 1);
    this.invuln = 1.45;

    let dx = this.x - fromX;
    let dy = this.y - fromY;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.001) {
      dx = 0;
      dy = -1;
    } else {
      dx /= d;
      dy /= d;
    }
    this.vx = this.vx * 0.2 + dx * 560;
    this.vy = this.vy * 0.2 + dy * 560;

    if (game && typeof game.hurt === 'function') game.hurt();

    if (this.hearts <= 0) {
      this.hearts = 0;
      this.dead = true;
      if (game && typeof game.lose === 'function') {
        game.lose('The garden kept your light.');
      }
    }
  }

  /** Refill the lantern, never past its maximum. */
  healOil(amount) {
    if (!Number.isFinite(amount)) return;
    this.oil = clamp(this.oil + amount, 0, this.maxOil);
  }

  // -------------------------------------------------------------- drawing ---

  draw(ctx) {
    const r = this.r;
    const s = r * 1.9; // art scale: 1.9x the collision radius
    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    const blink = this.invuln > 0 && Math.floor(this.time * 18) % 2 === 0;

    // The renderer adds a large additive lantern glow after the world pass.
    // This dark pool sits under the moth so that glow cannot wash the wings out.
    ctx.save();
    const halo = ctx.createRadialGradient(this.x, this.y, r * 0.4, this.x, this.y, s * 3.2);
    halo.addColorStop(0, 'rgba(2,4,8,0.58)');
    halo.addColorStop(0.55, 'rgba(2,4,8,0.34)');
    halo.addColorStop(1, 'rgba(2,4,8,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(this.x, this.y, s * 3.2, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(this.x, this.y);
    // Tilt with vertical motion; mirroring for facing happens after the tilt so
    // the nose still dips in the direction of travel.
    ctx.rotate(clamp(this.vy / 1500, -0.24, 0.24) * this.facing);
    ctx.scale(this.facing, 1);

    if (blink) ctx.globalAlpha = 0.32;

    const flap = Math.sin(this.wing);
    const foreshorten = 0.6 + 0.4 * Math.abs(flap);

    // Far wing (upper, darker), body, near wing (lower, bright cream to amber).
    this.drawWing(ctx, s, -1, flap, foreshorten, false);
    this.drawBody(ctx, s);
    this.drawWing(ctx, s, 1, flap, foreshorten, true);
    this.drawAntennae(ctx, s, speed);
    this.drawCore(ctx, s);

    ctx.restore();
  }

  drawWing(ctx, s, side, flap, foreshorten, near) {
    ctx.save();
    ctx.translate(-0.08 * s, side * 0.06 * s);
    ctx.rotate(side * 0.07 + flap * 0.16);
    if (side < 0) ctx.scale(1, -1);
    ctx.scale(1, foreshorten);

    const grad = ctx.createLinearGradient(-0.4 * s, 0, 0.5 * s, 1.8 * s);
    if (near) {
      grad.addColorStop(0, '#fff9e2');
      grad.addColorStop(0.45, '#ffe4a6');
      grad.addColorStop(0.82, '#f4b860');
      grad.addColorStop(1, '#e39a43');
    } else {
      grad.addColorStop(0, '#a3702f');
      grad.addColorStop(0.5, '#c6954c');
      grad.addColorStop(0.82, '#9a6428');
      grad.addColorStop(1, '#7d4e1e');
    }

    // A broad moth wing with two soft scallops on the trailing edge.
    ctx.beginPath();
    ctx.moveTo(-0.28 * s, 0);
    ctx.bezierCurveTo(0.22 * s, 0.16 * s, 0.7 * s, 0.75 * s, 0.64 * s, 1.55 * s);
    ctx.bezierCurveTo(0.6 * s, 1.86 * s, 0.36 * s, 1.98 * s, 0.22 * s, 1.76 * s);
    ctx.bezierCurveTo(0.11 * s, 1.6 * s, 0.02 * s, 1.44 * s, -0.06 * s, 1.5 * s);
    ctx.bezierCurveTo(-0.2 * s, 1.66 * s, -0.44 * s, 1.5 * s, -0.46 * s, 1.2 * s);
    ctx.bezierCurveTo(-0.52 * s, 0.82 * s, -0.54 * s, 0.36 * s, -0.28 * s, 0);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // A faint warm outline separates the far wing from the dark cave.
    ctx.strokeStyle = near ? 'rgba(120,72,24,0.4)' : 'rgba(70,44,18,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Two quiet veins, following the wing's long axis.
    ctx.strokeStyle = near ? 'rgba(170,104,36,0.28)' : 'rgba(74,48,20,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-0.14 * s, 0.1 * s);
    ctx.quadraticCurveTo(0.12 * s, 0.92 * s, 0.3 * s, 1.7 * s);
    ctx.moveTo(-0.18 * s, 0.14 * s);
    ctx.quadraticCurveTo(-0.16 * s, 0.72 * s, -0.2 * s, 1.3 * s);
    ctx.stroke();

    // Bright, near-white leading edge: the wing's clearest read.
    ctx.strokeStyle = near ? 'rgba(255,253,238,0.92)' : 'rgba(255,242,208,0.4)';
    ctx.lineWidth = near ? 1.9 : 1.2;
    ctx.beginPath();
    ctx.moveTo(-0.28 * s, 0);
    ctx.bezierCurveTo(0.22 * s, 0.16 * s, 0.7 * s, 0.75 * s, 0.64 * s, 1.55 * s);
    ctx.bezierCurveTo(0.62 * s, 1.8 * s, 0.46 * s, 1.94 * s, 0.3 * s, 1.9 * s);
    ctx.stroke();

    ctx.restore();
  }

  drawBody(ctx, s) {
    const body = ctx.createLinearGradient(-1.0 * s, 0.32 * s, 0.9 * s, -0.3 * s);
    body.addColorStop(0, '#d28438');
    body.addColorStop(0.3, '#ffd58d');
    body.addColorStop(0.62, '#fff2cf');
    body.addColorStop(1, '#fffdf2');

    ctx.beginPath();
    ctx.moveTo(-0.95 * s, 0.3 * s);
    ctx.bezierCurveTo(-0.55 * s, -0.05 * s, 0.05 * s, -0.34 * s, 0.55 * s, -0.3 * s);
    ctx.bezierCurveTo(0.82 * s, -0.27 * s, 0.92 * s, -0.05 * s, 0.78 * s, 0.16 * s);
    ctx.bezierCurveTo(0.55 * s, 0.46 * s, -0.1 * s, 0.6 * s, -0.95 * s, 0.3 * s);
    ctx.closePath();
    ctx.fillStyle = body;
    ctx.fill();

    // Warm rim along the back, plus a soft dark edge underneath.
    ctx.strokeStyle = 'rgba(255,252,236,0.85)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-0.9 * s, 0.27 * s);
    ctx.bezierCurveTo(-0.5 * s, -0.03 * s, 0.06 * s, -0.31 * s, 0.55 * s, -0.28 * s);
    ctx.stroke();

    // Head.
    const head = ctx.createRadialGradient(0.78 * s, -0.28 * s, 0.02 * s, 0.82 * s, -0.2 * s, 0.4 * s);
    head.addColorStop(0, '#fffdf2');
    head.addColorStop(0.7, '#ffe8b6');
    head.addColorStop(1, '#e6a050');
    ctx.fillStyle = head;
    ctx.beginPath();
    ctx.arc(0.82 * s, -0.2 * s, 0.31 * s, 0, TAU);
    ctx.fill();

    // One dark, glossy eye on the visible side.
    ctx.fillStyle = 'rgba(38,22,12,0.82)';
    ctx.beginPath();
    ctx.arc(0.92 * s, -0.25 * s, 0.075 * s, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,252,238,0.75)';
    ctx.beginPath();
    ctx.arc(0.89 * s, -0.28 * s, 0.025 * s, 0, TAU);
    ctx.fill();
  }

  drawAntennae(ctx, s, speed) {
    const sweep = clamp(speed / MAX_SPEED, 0, 1);

    for (let i = 0; i < 2; i++) {
      const spread = (i - 0.5) * 0.14 * s;
      const tipX = -0.12 * s - sweep * 0.55 * s;
      const tipY = -1.22 * s + spread * 0.7;

      ctx.strokeStyle = 'rgba(255,250,230,0.82)';
      ctx.lineWidth = 1.35;
      ctx.beginPath();
      ctx.moveTo(0.9 * s, -0.28 * s + spread * 0.25);
      ctx.bezierCurveTo(
        0.96 * s,
        -0.7 * s + spread,
        0.42 * s - sweep * 0.28 * s,
        -1.1 * s + spread,
        tipX,
        tipY,
      );
      ctx.stroke();

      // The little club at the antenna tip catches the lantern.
      ctx.fillStyle = 'rgba(255,244,206,0.95)';
      ctx.beginPath();
      ctx.arc(tipX, tipY, Math.max(1.3, 0.055 * s), 0, TAU);
      ctx.fill();
    }
  }

  drawCore(ctx, s) {
    const cx = 0.04 * s;
    const cy = 0.28 * s;
    const boost = this.pulse > 0 ? 0.22 : 0;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 2.05 * s);
    glow.addColorStop(0, `rgba(255,238,184,${0.48 + boost})`);
    glow.addColorStop(0.28, 'rgba(255,208,122,0.26)');
    glow.addColorStop(0.62, 'rgba(255,176,78,0.1)');
    glow.addColorStop(1, 'rgba(255,150,50,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, 2.05 * s, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

const ACCELERATION = 1780;
const DRAG = 3.7;
const MAX_SPEED = 330;
const OIL_DRAIN = 0.8;
const PULSE_COST = 12;
const PULSE_TIME = 1.2;
const PULSE_COOLDOWN = 0.85;
const PULSE_RADIUS = 290;
const TRAIL_INTERVAL = 0.055;

// Reused for every trail particle, so flight does not allocate an options bag.
const TRAIL_OPTIONS = Object.freeze({
  drag: 2.6,
  gravity: -6,
  glow: true,
  fade: 1.5,
});

const NO_ISLANDS = [];

/** Clamp a body between the cave walls, bouncing softly off them. */
function clampToCave(world, body, radius) {
  if (typeof world.clampToCave === 'function') {
    world.clampToCave(body, radius);
    return;
  }

  const corridor =
    typeof world.corridorFor === 'function'
      ? world.corridorFor(body.x, radius)
      : caveAt(world.garden, body.x);
  const top = corridor.ceiling + radius;
  const bottom = corridor.floor - radius;
  if (body.y < top) {
    body.y = top;
    if (body.vy < 0) body.vy *= -0.32;
  } else if (body.y > bottom) {
    body.y = bottom;
    if (body.vy > 0) body.vy *= -0.32;
  }

  const left = radius;
  const right = Number.isFinite(world.length) ? world.length - radius : Infinity;
  if (body.x < left) {
    body.x = left;
    if (body.vx < 0) body.vx *= -0.32;
  } else if (body.x > right) {
    body.x = right;
    if (body.vx > 0) body.vx *= -0.32;
  }
}

/**
 * Push a circle out of boulders and reflect only the inward part of its
 * velocity. The tangential part is untouched, which is what makes sliding feel
 * smooth instead of sticky.
 */
function pushOutOfIslands(world, body, radius, restitution) {
  if (typeof world.islandPush === 'function') {
    const result = world.islandPush(body.x, body.y, radius);
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

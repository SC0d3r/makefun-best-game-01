// The four sleeping gardens and the one long cave each of them hides.
//
// The cave profile is a pure function of the garden seed: no state, no random
// numbers, so the walls are identical on every visit. The rest of a garden
// (boulders, sunseeds, oil, motes, bats) is laid out once in the World
// constructor with a seeded PRNG, again so a run can be reproduced exactly.

import { GARDENS, TAU, clamp, hash, lerp, mulberry32, smooth } from './gardens.js';

/**
 * One garden's deterministic layout. All positions are in world pixels.
 * Construction uses only mulberry32(garden.seed), never Math.random.
 */
export class World {
  constructor(index) {
    const garden = GARDENS[index];
    if (!garden) {
      throw new RangeError(`Unknown garden index: ${index}`);
    }

    this.index = index;
    this.garden = garden;
    this.length = garden.length;

    // One seeded stream drives every layout pass; the garden seed is still the
    // only source of variation, so the layout is identical on every visit.
    const random = mulberry32(garden.seed);

    this.islands = this.makeIslands(random);
    this.seeds = this.makeSeeds(random);
    this.oil = this.makeOil(random);
    this.motes = this.makeMotes(random);
    this.bats = this.makeBats(random);

    const exitX = this.length - 170;
    this.exit = {
      x: exitX,
      y: caveCenter(garden, exitX),
      r: 54,
      radius: 54,
    };

    this.spawn = {
      x: 140,
      y: caveCenter(garden, 140),
      r: 16,
    };
  }

  /**
   * The narrowest walls across a horizontal span of ±0.8r. Treating a body as
   * a point against this "worst" corridor keeps whole circles inside the cave.
   */
  corridorFor(x, r) {
    let ceiling = -Infinity;
    let floor = Infinity;
    for (const offset of [-0.8, 0, 0.8]) {
      const sample = caveAt(this.garden, x + r * offset);
      if (sample.ceiling > ceiling) ceiling = sample.ceiling;
      if (sample.floor < floor) floor = sample.floor;
    }
    return { ceiling, floor };
  }

  /**
   * Move a pickup (or bat home) out of any boulder and back between the walls.
   * Horizontal escape is preferred because boulders never touch the walls, so
   * there is always a lane around them; the pass loop also catches overlaps
   * with a second boulder after a move.
   */
  placeClear(x, y, r, minX, maxX) {
    let px = clamp(x, minX, maxX);
    let py = y;

    for (let pass = 0; pass < 24; pass++) {
      const corridor = this.corridorFor(px, r);
      const low = corridor.ceiling + r + PICK_CLEARANCE;
      const high = corridor.floor - r - PICK_CLEARANCE;
      py = low <= high ? clamp(py, low, high) : (corridor.ceiling + corridor.floor) / 2;

      let moved = false;
      for (const island of this.islands) {
        const pad = island.r + r + ISLAND_PAD;
        const dx = px - island.x;
        const dy = py - island.y;
        if (dx * dx + dy * dy >= pad * pad) continue;

        // Slip sideways just far enough to clear the boulder at this height.
        const needX = Math.sqrt(Math.max(0, pad * pad - dy * dy));
        const left = island.x - needX;
        const right = island.x + needX;
        const canLeft = left >= minX;
        const canRight = right <= maxX;

        if (canLeft || canRight) {
          if (canLeft && canRight) {
            px = Math.abs(left - px) <= Math.abs(right - px) ? left : right;
          } else {
            px = canLeft ? left : right;
          }
        } else {
          // No x room (only possible at an extreme edge): push vertically.
          const needY = Math.sqrt(Math.max(0, pad * pad - dx * dx));
          py = island.y + (dy >= 0 ? needY : -needY);
        }
        moved = true;
      }

      if (!moved) break;
    }

    // Final wall clamp after the last horizontal move.
    const corridor = this.corridorFor(px, r);
    const low = corridor.ceiling + r + PICK_CLEARANCE;
    const high = corridor.floor - r - PICK_CLEARANCE;
    if (low <= high) py = clamp(py, low, high);
    else py = (corridor.ceiling + corridor.floor) / 2;

    return { x: px, y: py };
  }

  makeIslands(random) {
    const list = [];
    const start = 380;
    const end = this.length - 360;
    const count = Math.max(6, Math.floor((end - start) / 330));
    const cell = (end - start) / count;

    for (let i = 0; i < count; i++) {
      // Jitter is capped well below a cell, so neighbours always leave a lane
      // wide enough to fly around either boulder.
      const jitter = (random() - 0.5) * Math.min(90, cell * 0.42);
      const x = start + cell * (i + 0.5) + jitter;
      const r = 36 + random() * 28;
      const corridor = this.corridorFor(x, r);
      const low = corridor.ceiling + r + ISLAND_CLEARANCE;
      const high = corridor.floor - r - ISLAND_CLEARANCE;
      const y = low <= high ? low + random() * (high - low) : (corridor.ceiling + corridor.floor) / 2;

      list.push({ x, y, r, phase: random() * TAU });
    }

    return list;
  }

  makeSeeds(random) {
    const list = [];
    const count = this.garden.seeds;
    const minX = 700;
    const maxX = this.length - 500;
    const span = maxX - minX;

    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const x = clamp(minX + t * span + (random() - 0.5) * 90, minX, maxX);
      const corridor = caveAt(this.garden, x);
      const y = corridor.ceiling + (0.32 + random() * 0.36) * (corridor.floor - corridor.ceiling);
      const spot = this.placeClear(x, y, SEED_RADIUS, minX, maxX);

      list.push({
        x: spot.x,
        y: spot.y,
        r: SEED_RADIUS,
        taken: false,
        phase: random() * TAU,
      });
    }

    return list;
  }

  makeOil(random) {
    const list = [];
    if (this.seeds.length < 2) return list;

    // One droplet in each gap between consecutive sunseeds.
    const count = Math.max(3, this.garden.seeds - 1);
    const minX = 620;
    const maxX = this.length - 430;

    for (let i = 0; i < count; i++) {
      const a = this.seeds[i % this.seeds.length];
      const b = this.seeds[(i + 1) % this.seeds.length];
      const x = clamp((a.x + b.x) / 2 + (random() - 0.5) * 44, minX, maxX);

      const corridor = caveAt(this.garden, x);
      const y = corridor.ceiling + (0.36 + random() * 0.3) * (corridor.floor - corridor.ceiling);
      const spot = this.placeClear(x, y, OIL_RADIUS, minX, maxX);

      list.push({
        x: spot.x,
        y: spot.y,
        r: OIL_RADIUS,
        taken: false,
        phase: random() * TAU,
      });
    }

    return list;
  }

  makeMotes(random) {
    const list = [];
    const count = Math.max(12, Math.round(this.length / 340));
    const minX = 180;
    const maxX = this.length - 210;
    const span = maxX - minX;

    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const x = clamp(minX + t * span + (random() - 0.5) * 90, minX, maxX);
      const corridor = caveAt(this.garden, x);
      const y = corridor.ceiling + (0.24 + random() * 0.52) * (corridor.floor - corridor.ceiling);
      const spot = this.placeClear(x, y, MOTE_RADIUS, minX, maxX);

      list.push({
        x: spot.x,
        y: spot.y,
        r: MOTE_RADIUS,
        taken: false,
        phase: random() * TAU,
      });
    }

    return list;
  }

  makeBats(random) {
    const list = [];
    const count = this.garden.bats;
    const start = 600;
    const end = this.length - 700;
    const span = end - start;

    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : (i + 0.5) / count;
      const homeX = start + t * span + (random() - 0.5) * 80;
      const corridor = caveAt(this.garden, homeX);
      const desiredY =
        corridor.ceiling + (0.3 + random() * 0.4) * (corridor.floor - corridor.ceiling);
      const spot = this.placeClear(homeX, desiredY, 22, start - 80, end + 80);

      const radius = 12 + random() * 5;
      list.push({
        // Current position; the bat module updates x/y each frame.
        x: spot.x,
        y: spot.y,
        // The hovering point the bat returns to.
        homeX: spot.x,
        homeY: spot.y,
        radius,
        speed: 55 + random() * 40,
        phase: random() * TAU,
        // Extras the movement code needs to make a readable patrol.
        roamX: 80 + random() * 70,
        roamY: 20 + random() * 35,
        dir: random() < 0.5 ? -1 : 1,
        vision: 220 + random() * 100,
        chaseSpeed: 80 + random() * 40,
      });
    }

    return list;
  }
}

/** The game's fixed design resolution, in pixels. */
export const VIEW_W = 1280;
export const VIEW_H = 720;

// --------------------------------------------------------------------- cave ---

const CEILING_BASE = 158;
const CEILING_WAVES = [
  [50, 0.0022],
  [27, 0.0061],
  [13, 0.0137],
];
const FLOOR_BASE = 566;
const FLOOR_WAVES = [
  [40, 0.0018],
  [24, 0.0053],
  [11, 0.0111],
];

const CEILING_MIN = 78;
const CEILING_MAX = 245;
const FLOOR_MIN = 470;
const FLOOR_MAX = 646;
const MIN_CORRIDOR = 292;

const ENTRY_LENGTH = 230;
const EXIT_LENGTH = 300;
const ENTRY_CEILING = 112;
const ENTRY_FLOOR = 608;

// Phase sets are expensive to derive on every caveAt() call (the renderer calls
// it hundreds of times per frame), so cache them by seed.
const phaseCache = new Map();

function phasesFor(seed) {
  let cached = phaseCache.get(seed);
  if (cached) return cached;

  const ceiling = CEILING_WAVES.map((wave, i) => ({
    amp: wave[0],
    freq: wave[1],
    phase: hash(seed * 131 + i * 17 + 3) * TAU,
  }));
  const floor = FLOOR_WAVES.map((wave, i) => ({
    amp: wave[0],
    freq: wave[1],
    phase: hash(seed * 197 + i * 23 + 7) * TAU,
  }));

  cached = { ceiling, floor };
  phaseCache.set(seed, cached);
  return cached;
}

function profile(garden, x) {
  const phases = phasesFor(garden.seed);

  let ceiling = CEILING_BASE;
  for (const wave of phases.ceiling) {
    ceiling += wave.amp * Math.sin(x * wave.freq + wave.phase);
  }

  let floor = FLOOR_BASE;
  for (const wave of phases.floor) {
    floor += wave.amp * Math.sin(x * wave.freq + wave.phase);
  }

  ceiling = clamp(ceiling, CEILING_MIN, CEILING_MAX);
  floor = clamp(floor, FLOOR_MIN, FLOOR_MAX);

  // Keep the flyable corridor wide enough even in the narrowest pinch.
  if (floor - ceiling < MIN_CORRIDOR) {
    const middle = (ceiling + floor) / 2;
    ceiling = middle - MIN_CORRIDOR / 2;
    floor = middle + MIN_CORRIDOR / 2;
  }

  // The first and last stretches open into calm antechambers. smooth() clamps
  // its input, so the profile also stays sensible for world x outside 0..length.
  const entry = 1 - smooth(x / ENTRY_LENGTH);
  if (entry > 0) {
    ceiling = lerp(ceiling, ENTRY_CEILING, entry);
    floor = lerp(floor, ENTRY_FLOOR, entry);
  }

  const leave = smooth((x - (garden.length - EXIT_LENGTH)) / EXIT_LENGTH);
  if (leave > 0) {
    ceiling = lerp(ceiling, ENTRY_CEILING, leave);
    floor = lerp(floor, ENTRY_FLOOR, leave);
  }

  return { ceiling, floor };
}

/** The cave walls at world x: `{ ceiling, floor }` in world pixels. */
export function caveAt(garden, x) {
  return profile(garden, x);
}

/** The midpoint between the ceiling and floor at world x. */
export function caveCenter(garden, x) {
  const { ceiling, floor } = caveAt(garden, x);
  return (ceiling + floor) / 2;
}

// ------------------------------------------------------------------- layout ---

const ISLAND_CLEARANCE = 26; // rock-to-wall breathing room for boulders
const PICK_CLEARANCE = 14; // pickup-to-wall breathing room
const ISLAND_PAD = 10; // extra gap between a pickup and a boulder
const SEED_RADIUS = 18;
const OIL_RADIUS = 16;
const MOTE_RADIUS = 12;

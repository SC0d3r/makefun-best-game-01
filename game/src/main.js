// LUMENWING's fixed-step loop and state machine.
//
// This file is the seam between the frozen art layer (render.js and hud.js) and
// the gameplay modules written in stages 1 and 2. The Game instance is itself
// the shared `game` object those modules receive, so every field the renderer,
// the HUD, the player and the bats read is kept current here before any update
// call: world, player, bats, particles, camera, counters and presentation
// timers all live on this object.

import { World, caveCenter, VIEW_W, VIEW_H } from './world.js';
import { Player } from './player.js';
import { Bat } from './creatures.js';
import { Renderer } from './render.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Particles } from './particles.js';
import { clamp, formatTime } from './utils.js';

const STEP = 1 / 120;
const MAX_FRAME = 0.05;
const MAX_STEPS = 8;
const BEST_KEY = 'lumenwing.best';
const POPUP_LIFE = 1.1;

// Reused by the preset trail so the screenshot helpers do not allocate options.
const TRAIL_OPTIONS = Object.freeze({
  drag: 2.6,
  gravity: -6,
  glow: true,
  fade: 1.5,
});

/**
 * Screenshot presets. Each one is applied only when `?shot=name` is present,
 * never from the normal loop. `at` is a fraction of the garden length and
 * `atExit` places the moth beside the moonflower.
 */
const SHOT_PRESETS = {
  title: {
    garden: 0,
    state: 'title',
    time: 2.4,
    elapsed: 0,
    best: 10240,
  },
  play: {
    garden: 0,
    state: 'play',
    at: 0.46,
    seeds: 2,
    motes: 11,
    hearts: 3,
    oil: 68,
    score: 2180,
    elapsed: 74,
    time: 75,
    nearBats: 1,
    trail: 8,
  },
  ember: {
    garden: 1,
    state: 'play',
    at: 0.55,
    seeds: 3,
    motes: 13,
    hearts: 2,
    oil: 41,
    score: 3960,
    elapsed: 151,
    time: 152,
    nearBats: 2,
  },
  bloom: {
    garden: 1,
    state: 'play',
    at: 0.62,
    seeds: 6,
    motes: 16,
    hearts: 3,
    oil: 58,
    score: 4460,
    elapsed: 148,
    time: 149,
    nearBats: 2,
  },
  frost: {
    garden: 2,
    state: 'play',
    at: 0.62,
    seeds: 5,
    motes: 17,
    hearts: 2,
    oil: 33,
    score: 5210,
    elapsed: 236,
    time: 237,
    nearBats: 2,
  },
  clear: {
    garden: 0,
    state: 'clear',
    atExit: true,
    seeds: 5,
    motes: 19,
    hearts: 3,
    oil: 74,
    score: 3720,
    elapsed: 96,
    time: 97,
  },
  victory: {
    garden: 2,
    state: 'victory',
    atExit: true,
    seeds: 7,
    motes: 44,
    hearts: 2,
    oil: 70,
    score: 10240,
    elapsed: 411,
    time: 412,
    best: 10240,
    newBest: true,
  },
  gameover: {
    garden: 0,
    state: 'gameover',
    at: 0.52,
    atExit: false,
    seeds: 2,
    motes: 13,
    hearts: 1,
    oil: 0,
    score: 1240,
    elapsed: 214,
    time: 9.2,
    best: 3650,
    dead: true,
    reason: 'The lantern has gone dark.',
    nearBats: 1,
  },
};

/** Read the best score, treating unavailable storage as no best at all. */
function loadBest() {
  try {
    const raw = window.localStorage.getItem(BEST_KEY);
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  } catch {
    return 0;
  }
}

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = new Input(window);
    this.audio = new Audio();
    this.particles = new Particles(480);
    this.renderer = new Renderer(canvas);
    this.hud = new Hud();
    this.popups = [];

    this.state = 'title';
    this.time = 0;
    this.elapsed = 0;
    this.best = loadBest();
    this.newBest = false;
    this.muted = false;
    this.shake = 0;
    this.flash = 0;
    this.motes = 0;
    this.reason = '';
    this.acc = 0;
    this.last = -1;
    this.debugPaused = false;

    this.world = new World(0);
    this.player = new Player(this.world);
    this.cam = { x: 0, y: 0 };
    this.bats = [];
    this.audioPrimed = false;

    this.spawnBats();
    this.snapCamera();

    // Bind the two DOM callbacks once so requestAnimationFrame and the event
    // listeners always see this Game instance.
    this.frame = this.frame.bind(this);
    this.onVisibility = this.onVisibility.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);

    canvas.addEventListener('pointerdown', this.onPointerDown);
    document.addEventListener('visibilitychange', this.onVisibility);

    this.installDebugHooks();

    // Presets are reachable only through the query string, and they run after
    // the debug hooks exist but before the first painted frame.
    const wanted = new URLSearchParams(window.location.search).get('shot');
    if (wanted && SHOT_PRESETS[wanted]) this.setupShot(wanted);

    requestAnimationFrame(this.frame);
  }

  // ------------------------------------------------------------- lifecycle ---

  /** Begin a fresh three-garden run at `garden`. */
  startRun(garden = 0) {
    this.world = new World(garden);
    this.player = new Player(this.world);
    this.spawnBats();
    this.particles.clear();
    this.popups = [];
    this.motes = 0;
    this.elapsed = 0;
    this.shake = 0;
    this.flash = 0;
    this.newBest = false;
    this.reason = '';
    this.acc = 0;
    this.state = 'play';
    this.audio.start();
    this.snapCamera();
    this.setStatus(`The lantern wakes in ${this.world.garden.name}.`);
  }

  /**
   * Carry the same moth into the next garden: score and collected motes carry
   * over, hearts are restored to at least one, and the lantern gets a refill.
   */
  startGarden(index) {
    const score = this.player.score;
    const hearts = this.player.hearts;
    const oil = this.player.oil;
    const maxHearts = this.player.maxHearts;

    this.world = new World(index);
    this.player = new Player(this.world);
    this.player.score = score;
    this.player.hearts = Math.min(maxHearts, Math.max(1, hearts));
    this.player.oil = Math.max(70, oil);
    this.player.seeds = 0;

    this.spawnBats();
    this.particles.clear();
    this.popups = [];
    this.shake = 0;
    this.flash = 0;
    this.newBest = false;
    this.reason = '';
    this.state = 'play';
    this.audio.start();
    this.snapCamera();
    this.setStatus(`Flying on into ${this.world.garden.name}.`);
  }

  /** Wrap every World bat description in the movement creature module. */
  spawnBats() {
    const garden = this.world.garden;
    this.bats = this.world.bats.map((data, index) => new Bat(garden, data, index));
    return this.bats;
  }

  /** Put the camera exactly where the target camera would be. */
  snapCamera() {
    const target = this.cameraTarget();
    this.cam.x = target.x;
    this.cam.y = target.y;
  }

  /** The camera position the loop eases toward each fixed step. */
  cameraTarget() {
    const player = this.player;
    const maxX = Math.max(0, this.world.length - VIEW_W);
    const lead = clamp(player.vx * 0.42, -140, 180);
    const x = clamp(player.x - VIEW_W * 0.42 + lead, 0, maxX);
    const y = clamp((player.y - VIEW_H * 0.5) * 0.16, -26, 30);
    return { x, y };
  }

  /** Advance after a cleared garden, or finish the whole run. */
  advance() {
    if (this.world.index === 2) {
      this.finish();
    } else {
      this.startGarden(this.world.index + 1);
    }
  }

  /** The third moonflower woke: close the run with a final bonus. */
  finish() {
    this.player.score += 2000 + this.player.hearts * 250;
    this.state = 'victory';
    this.audio.victory();
    this.commitBest();
    this.setStatus(
      `All three gardens are awake. Final score ${this.player.score.toLocaleString('en-US')} in ${formatTime(this.elapsed)}.`,
    );
  }

  /** Remember a run if it beats the stored best, and flag a new record. */
  commitBest() {
    if (this.player.score <= this.best) return;
    this.best = this.player.score;
    this.newBest = true;
    try {
      window.localStorage.setItem(BEST_KEY, String(this.best));
    } catch {
      // Private mode or blocked storage: the run still stands for this page.
    }
  }

  /** Lantern pulse feedback: the sound plus a short shiver. */
  pulse() {
    this.audio.pulse();
    this.shake = Math.max(this.shake, 5);
  }

  /** Bat-hit feedback: sound, red flash and a harder shiver. */
  hurt() {
    this.audio.hurt();
    this.flash = 0.5;
    this.shake = 14;
  }

  /** End the run for good, with the sentence shown on the game-over card. */
  lose(reason) {
    if (this.state === 'gameover' || this.state === 'victory') return;
    this.reason = reason;
    this.player.dead = true;
    this.state = 'gameover';
    this.flash = Math.max(this.flash, 0.5);
    this.audio.lose();
    this.commitBest();
    this.setStatus(reason);
  }

  /** Pause only from normal flight. */
  pauseGame(message = 'Paused. The garden holds its breath.') {
    if (this.state !== 'play') return;
    this.state = 'paused';
    this.setStatus(message);
  }

  /** Resume a paused flight. */
  resumeGame() {
    if (this.state !== 'paused') return;
    this.state = 'play';
    this.setStatus('Flying again.');
  }

  /** Mute or unmute every sound without losing the run. */
  toggleMute() {
    this.muted = !this.muted;
    this.audio.setMuted(this.muted);
    this.setStatus(this.muted ? 'Sound off.' : 'Sound on.');
  }

  /** Write a short sentence into the screen-reader live region. */
  setStatus(text) {
    if (typeof document === 'undefined') return;
    const element = document.getElementById('status');
    if (element) element.textContent = text;
  }

  // ----------------------------------------------------------------- input ---

  /** One-shot keys for menus, pause, mute and the next garden. */
  handleKeys() {
    const input = this.input;
    if (input.hit('KeyM')) this.toggleMute();

    switch (this.state) {
      case 'title':
        if (input.hit('Space') || input.hit('Enter') || input.hit('KeyR')) {
          // Consume Space so the same press does not immediately pulse.
          input.pressed.delete('Space');
          this.startRun(0);
        }
        break;
      case 'play':
        if (input.hit('KeyP') || input.hit('Escape')) this.pauseGame();
        break;
      case 'paused':
        if (input.hit('KeyP') || input.hit('Escape') || input.hit('Enter')) {
          this.resumeGame();
        }
        break;
      case 'clear':
        if (input.hit('Enter') || input.hit('Space')) {
          input.pressed.delete('Space');
          this.advance();
        }
        break;
      case 'victory':
      case 'gameover':
        if (input.hit('KeyR') || input.hit('Enter')) this.startRun(0);
        break;
      default:
        break;
    }
  }

  /** A click on the stage does whatever the current card asks for. */
  onPointerDown() {
    if (this.canvas && typeof this.canvas.focus === 'function') this.canvas.focus();
    this.audio.start();

    switch (this.state) {
      case 'title':
        this.startRun(0);
        break;
      case 'clear':
        this.advance();
        break;
      case 'victory':
      case 'gameover':
        this.startRun(0);
        break;
      case 'paused':
        this.resumeGame();
        break;
      default:
        break;
    }
  }

  /** Leaving the tab during flight should never cost the player a heart. */
  onVisibility() {
    if (document.hidden && this.state === 'play') {
      this.pauseGame('Paused while the page is hidden.');
    }
  }

  // -------------------------------------------------------------- gameplay ---

  /**
   * Pickups use the moth's own radius as reach, so the collection ring matches
   * the body drawn on screen. Everything here is in world space.
   */
  collect() {
    const player = this.player;
    const reach = player.r;

    for (const seed of this.world.seeds) {
      if (seed.taken) continue;
      if (Math.hypot(player.x - seed.x, player.y - seed.y) >= seed.r + reach + 4) continue;
      seed.taken = true;
      player.seeds += 1;
      player.score += 250;
      this.audio.seed();
      this.particles.burst(seed.x, seed.y, 14, '#ffd685', 125, 0.62, 3);
      this.addPopup('+250', seed.x, seed.y - 20, '#ffe6a6');
    }

    for (const drop of this.world.oil) {
      if (drop.taken) continue;
      if (Math.hypot(player.x - drop.x, player.y - drop.y) >= drop.r + reach + 2) continue;
      drop.taken = true;
      player.healOil(36);
      player.score += 50;
      this.audio.oil();
      this.particles.burst(drop.x, drop.y, 10, '#ffb85c', 90, 0.52, 2.6);
      this.addPopup('+50', drop.x, drop.y - 20, '#ffd08a');
    }

    for (const mote of this.world.motes) {
      if (mote.taken) continue;
      if (Math.hypot(player.x - mote.x, player.y - mote.y) >= mote.r + reach + 8) continue;
      // The last little drift toward the moth makes the collect read as a pull.
      mote.x += (player.x - mote.x) * 0.06;
      mote.y += (player.y - mote.y) * 0.06;
      mote.taken = true;
      player.score += 20;
      this.motes += 1;
      this.audio.mote();
      this.particles.burst(mote.x, mote.y, 6, '#fff2c0', 62, 0.44, 2);
      this.addPopup('+20', mote.x, mote.y - 16, '#fff6c8');
    }
  }

  /** The moonflower opens only when every sunseed is in hand. */
  checkExit() {
    const garden = this.world.garden;
    if (!this.world.seeds.every((seed) => seed.taken)) return;
    const exit = this.world.exit;
    if (Math.hypot(this.player.x - exit.x, this.player.y - exit.y) >= exit.r + 10) return;

    this.player.score += 500 + this.player.hearts * 100;
    this.state = 'clear';
    this.audio.clear();
    this.particles.burst(exit.x, exit.y, 40, '#e8ecff', 170, 0.9, 3);
    this.commitBest();
    this.setStatus(
      `${garden.name} is awake. Cleared in ${formatTime(this.elapsed)}.`,
    );
  }

  /** Push one small floating score note. */
  addPopup(text, x, y, color) {
    this.popups.push({
      text,
      x,
      y,
      color,
      life: POPUP_LIFE,
      maxLife: POPUP_LIFE,
    });
    if (this.popups.length > 24) this.popups.shift();
  }

  /** Age and drift the score notes, dropping the ones that have faded out. */
  updatePopups(dt) {
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const popup = this.popups[i];
      popup.life -= dt;
      popup.y -= 30 * dt;
      if (popup.life <= 0) this.popups.splice(i, 1);
    }
  }

  /** Draw the score notes in screen space, above the world and below the HUD. */
  drawPopups() {
    const ctx = this.ctx;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 15px "Trebuchet MS", "Segoe UI", system-ui, sans-serif';
    for (const popup of this.popups) {
      const alpha = clamp(popup.life / popup.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = popup.color;
      ctx.shadowColor = popup.color;
      ctx.shadowBlur = 10;
      ctx.fillText(popup.text, popup.x - this.cam.x, popup.y - this.cam.y);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------ step ---

  /** One fixed simulation step. */
  step(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.time += dt;

    if (this.state === 'play') {
      this.elapsed += dt;

      this.player.update(dt, this.input, this.world, this);

      if (this.state === 'play') {
        for (const bat of this.bats) bat.update(dt, this);
      }

      if (this.state === 'play') {
        this.collect();
        this.checkExit();
      }

      // Frame-rate independent easing: 5.2/s across, 4/s vertically.
      const target = this.cameraTarget();
      const easeX = 1 - Math.exp(-5.2 * dt);
      const easeY = 1 - Math.exp(-4 * dt);
      this.cam.x += (target.x - this.cam.x) * easeX;
      this.cam.y += (target.y - this.cam.y) * easeY;
    }

    this.particles.update(dt);
    this.updatePopups(dt);
    this.shake = Math.max(0, this.shake - 26 * dt);
    this.flash = Math.max(0, this.flash - 1.6 * dt);
  }

  // ----------------------------------------------------------------- frame ---

  /** The browser's animation frame: intake, catch-up steps, paint, repeat. */
  frame(timestamp) {
    if (this.input.any && !this.audioPrimed) {
      this.audioPrimed = true;
      this.audio.start();
    }

    if (!this.debugPaused) {
      this.handleKeys();

      if (this.last < 0) this.last = timestamp;
      let delta = (timestamp - this.last) / 1000;
      this.last = timestamp;
      if (!Number.isFinite(delta) || delta < 0) delta = 0;
      delta = Math.min(delta, MAX_FRAME);
      this.acc += delta;

      let steps = 0;
      while (this.acc >= STEP && steps < MAX_STEPS) {
        this.step(STEP);
        this.acc -= STEP;
        steps += 1;
      }
      // Do not let a long stall turn into an ever-growing catch-up backlog.
      if (steps >= MAX_STEPS) this.acc = 0;
    } else {
      this.last = timestamp;
      this.acc = 0;
    }

    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.renderer.draw(this);
    this.drawPopups();
    this.hud.draw(ctx, this);
    this.input.endFrame();
    requestAnimationFrame(this.frame);
  }

  // --------------------------------------------------------------- presets ---

  /**
   * Build one of the screenshot states. The run is warmed up at the spawn,
   * where no pickup or bat can touch it, then the exact presentation fields
   * are written and the camera is snapped. Nothing here runs during normal
   * play; it is entered only from the `shot` query parameter.
   */
  setupShot(name) {
    const shot = SHOT_PRESETS[name];
    if (!shot) return;

    this.startRun(shot.garden);
    for (let i = 0; i < 24; i++) this.step(1 / 60);

    this.state = shot.state;
    this.time = shot.time;
    this.elapsed = shot.elapsed;
    this.best = Number.isFinite(shot.best) ? shot.best : 0;
    this.newBest = !!shot.newBest;
    this.reason = shot.reason || '';
    this.shake = 0;
    this.flash = 0;
    this.popups.length = 0;

    this.placePresetPlayer(shot);
    this.markPresetPickups(shot);
    this.placeNearBats(shot.nearBats || 0);
    if (shot.trail) this.emitShotTrail(shot.trail);

    this.snapCamera();
    this.setStatus(
      shot.state === 'title'
        ? 'Lumenwing. Press Enter to wake.'
        : `Lumenwing screenshot: ${shot.state}.`,
    );

    // A screenshot must keep the exact fields it was built with. Freezing the
    // default frame loop is limited to `?shot=` states; normal play never sets
    // this flag, and the debug pause hook can still release it.
    this.debugPaused = true;
  }

  /** Position and fill the moth for a preset. */
  placePresetPlayer(shot) {
    const player = this.player;
    const world = this.world;

    if (shot.atExit) {
      player.x = world.exit.x - (world.exit.r + 4);
      player.y = world.exit.y;
    } else if (Number.isFinite(shot.at)) {
      player.x = clamp(world.length * shot.at, 0, world.length);
      player.y = caveCenter(world.garden, player.x);
    } else {
      player.x = world.spawn.x;
      player.y = world.spawn.y;
    }

    player.vx = 0;
    player.vy = 0;
    player.maxHearts = 3;
    player.hearts = Number.isFinite(shot.hearts) ? shot.hearts : 3;
    player.oil = Number.isFinite(shot.oil) ? shot.oil : player.maxOil;
    player.score = Number.isFinite(shot.score) ? shot.score : 0;
    player.seeds = Number.isFinite(shot.seeds) ? shot.seeds : 0;
    player.dead = !!shot.dead;
    player.invuln = 0;
    player.pulse = 0;
    player.cooldown = 0;
  }

  /** Mark the requested seeds and motes as already taken. */
  markPresetPickups(shot) {
    const seedCount = Number.isFinite(shot.seeds) ? shot.seeds : 0;
    const moteCount = Number.isFinite(shot.motes) ? shot.motes : 0;

    const seedsTaken = Math.min(seedCount, this.world.seeds.length);
    for (let i = 0; i < this.world.seeds.length; i++) {
      this.world.seeds[i].taken = i < seedsTaken;
    }

    const motesTaken = Math.min(moteCount, this.world.motes.length);
    for (let i = 0; i < this.world.motes.length; i++) {
      this.world.motes[i].taken = i < motesTaken;
    }

    this.motes = moteCount;
    this.player.seeds = seedCount;
  }

  /** Bring the first N bats close enough to read beside the moth. */
  placeNearBats(count) {
    const offsets = [
      [132, 18],
      [-118, 62],
      [74, -96],
    ];
    for (let i = 0; i < count && i < this.bats.length; i++) {
      const bat = this.bats[i];
      const offset = offsets[i % offsets.length];
      bat.x = this.player.x + offset[0];
      bat.y = this.player.y + offset[1];
      bat.homeX = bat.x;
      bat.homeY = bat.y;
      bat.vx = 0;
      bat.vy = 0;
      bat.frightened = 0;
      bat.time = 0;
    }
  }

  /** A warm ring of trail sparks around the moth for the flight screenshots. */
  emitShotTrail(count) {
    const total = Math.max(1, Math.floor(count));
    for (let i = 0; i < total; i++) {
      const angle = (i / total) * Math.PI * 2;
      const radius = 10 + (i % 3) * 6;
      this.particles.spawn(
        this.player.x + Math.cos(angle) * radius,
        this.player.y + Math.sin(angle) * radius,
        Math.cos(angle) * 8,
        Math.sin(angle) * 8 - 4,
        0.55 + (i % 2) * 0.12,
        2.2,
        '#ffc477',
        TRAIL_OPTIONS,
      );
    }
  }

  // ------------------------------------------------------------------ debug ---

  /** Expose the small automation surface the screenshot runner expects. */
  installDebugHooks() {
    if (typeof window === 'undefined') return;
    window.__lumenwing = {
      game: this,
      advance: (dt = 1 / 60, frames = 1) => {
        const step = Number.isFinite(dt) && dt > 0 ? dt : 1 / 60;
        const count = Number.isFinite(frames) ? Math.max(0, Math.floor(frames)) : 1;
        this.handleKeys();
        for (let i = 0; i < count; i++) this.step(step);
      },
      pause: (value = true) => {
        this.debugPaused = !!value;
      },
      state: () => this.state,
      snapshot: () => ({
        state: this.state,
        elapsed: this.elapsed,
        score: this.player.score,
        seeds: this.player.seeds,
      }),
      setState: (name) => {
        this.state = name;
      },
    };
  }
}

// The page's only script: find the stage and hand it to the game.
const canvas = document.getElementById('game');
if (canvas) new Game(canvas);

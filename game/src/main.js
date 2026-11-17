// LUMENWING's fixed-step loop and state machine.
//
// This file is the seam between the frozen art layer (render.js and hud.js) and
// the gameplay modules written in stages 1 and 2. The Game instance is itself
// the shared `game` object those modules receive, so every field the renderer,
// the HUD, the player and the bats read is kept current here before any update
// call: world, player, bats, particles, camera, counters and presentation
// timers all live on this object.

import { loadSave, writeSave, recordRun, isGardenUnlocked } from './save.js';
import { newRunStats, tally, gardenCardRect } from './screens.js';
import { clamp, formatTime, GARDENS } from './gardens.js';
import { World, caveCenter, VIEW_W, VIEW_H } from './world.js';
import { Player } from './player.js';
import { Hud, Audio } from './hud.js';
import { Bat, Particles } from './creatures.js';
import { Renderer } from './render.js';

export class Game {
  constructor(
    canvas,
  ) {
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
    this.save = loadSave();
    this.stats = newRunStats();
    this.best = this.save.best;
    this.selectedGarden = this.firstUnlockedGarden();
    this.newBest = false;
    this.muted = false;
    this.shake = 0;
    this.flash = 0;
    this.motes = 0;
    this.reason = '';
    this.acc = 0;
    this.last = -1;
    this.debugPaused = false;

    this.gardenStartScore = 0;
    this.committedSeeds = 0;
    this.committedMotes = 0;
    this.campaign = false;

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

  /** Begin a fresh four-garden run at `garden`. */
  startRun(garden = 0) {
    this.selectedGarden = garden;
    this.stats = newRunStats();
    this.stats.startedAt = performance.now();
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
    this.gardenStartScore = 0;
    this.committedSeeds = 0;
    this.committedMotes = 0;
    this.campaign = true;
    this.state = 'play';
    this.audio.start();
    this.snapCamera();
    this.setStatus(`The lantern wakes in ${this.world.garden.name}.`);
  }

  /** The earliest garden the save has opened, used as the initial cursor. */
  firstUnlockedGarden() {
    const count = (this.save.cleared && this.save.cleared.length) || 4;
    for (let index = 0; index < count; index++) {
      if (isGardenUnlocked(this.save, index)) return index;
    }
    return 0;
  }

  /** Open the garden map with a cursor that points at an unlocked card. */
  openGardenSelect() {
    if (!isGardenUnlocked(this.save, this.selectedGarden)) {
      this.selectedGarden = this.firstUnlockedGarden();
    }
    if (!this.campaign) this.selectedGarden = this.firstUnlockedGarden();
    this.state = 'select';
    this.newBest = false;
    this.setStatus('Choose a garden. Left and right to choose, Enter to fly.');
  }

  /** Step the cursor, skipping locked cards and wrapping at both ends. */
  moveSelection(direction) {
    const count = (this.save.cleared && this.save.cleared.length) || 4;
    for (let step = 1; step <= count; step++) {
      const next = (this.selectedGarden + direction * step + count) % count;
      if (isGardenUnlocked(this.save, next)) {
        this.selectedGarden = next;
        return;
      }
    }
  }

  /** Convert a pointer event into the fixed 1280x720 stage coordinates. */
  pointerStage(event) {
    if (!event || !this.canvas || !Number.isFinite(event.clientX)) return null;
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * VIEW_W,
      y: ((event.clientY - rect.top) / rect.height) * VIEW_H,
    };
  }

  /** Index of the garden card under the pointer, or -1. */
  gardenAtPointer(event) {
    const point = this.pointerStage(event);
    if (!point) return -1;
    const count = (this.save.cleared && this.save.cleared.length) || 4;
    for (let index = 0; index < count; index++) {
      const rect = gardenCardRect(index);
      if (
        point.x >= rect.x &&
        point.x <= rect.x + rect.w &&
        point.y >= rect.y &&
        point.y <= rect.y + rect.h
      ) {
        return index;
      }
    }
    return -1;
  }

  /**
   * Carry the same moth into the next garden: score and collected motes carry
   * over, hearts are restored to at least one, and the lantern gets a refill.
   */
  startGarden(index) {
    const score = this.player.score;
    this.gardenStartScore = score;
    this.campaign = true;
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
    if (this.world.index >= GARDENS.length - 1) {
      this.finish();
    } else {
      this.campaign = true;
      this.selectedGarden = this.world.index + 1;
      this.openGardenSelect();
      this.setStatus(`${this.world.garden.name} is awake. Choose the next garden.`);
    }
  }

  /** The last moonflower woke: close the run with a final bonus. */
  finish() {
    this.player.score += 2000 + this.player.hearts * 250;
    this.state = 'victory';
    this.audio.victory();
    this.commitFinalScore();
    this.campaign = false;
    this.setStatus(
      `All four gardens are awake. Final score ${this.player.score.toLocaleString('en-US')} in ${formatTime(this.elapsed)}.`,
    );
  }

  /** Lift the stored best when the final bonus pushes the total above it. */
  commitFinalScore() {
    if (this.player.score > this.save.best) {
      this.save = { ...this.save, best: this.player.score };
      writeSave(this.save);
    }
    this.commitBest();
  }

  /** Fold one finished garden into the save, once, and refresh the record flag. */
  commitGarden(cleared) {
    const total = this.player.score;
    const score = Math.max(0, total - (this.gardenStartScore || 0));
    const seeds = Math.max(0, this.stats.seeds - (this.committedSeeds || 0));
    const motes = Math.max(0, this.stats.motes - (this.committedMotes || 0));
    this.newBest = total > this.save.best;
    this.save = recordRun(this.save, {
      score,
      total,
      gardenIndex: this.world.index,
      cleared,
      campaignCleared: cleared && this.world.index === GARDENS.length - 1,
      seeds,
      motes,
    });
    this.committedSeeds = this.stats.seeds;
    this.committedMotes = this.stats.motes;
    writeSave(this.save);
    this.commitBest();
  }

  /** Read the headline best back from the save after a recorded run. */
  commitBest() {
    this.best = this.save.best;
  }

  /** Lantern pulse feedback: the sound plus a short shiver. */
  pulse() {
    this.audio.pulse();
    this.shake = Math.max(this.shake, 5);
    this.stats = tally(this.stats, 'pulses');
  }

  /** One bat was scared off by the lantern pulse. */
  startle() {
    this.stats = tally(this.stats, 'bats');
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
    this.commitGarden(false);
    this.campaign = false;
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
          this.openGardenSelect();
        }
        break;
      case 'select':
        if (input.hit('ArrowLeft') || input.hit('KeyA')) this.moveSelection(-1);
        if (input.hit('ArrowRight') || input.hit('KeyD')) this.moveSelection(1);
        if (input.hit('Enter') || input.hit('Space')) {
          input.pressed.delete('Space');
          this.campaign ? this.startGarden(this.selectedGarden) : this.startRun(this.selectedGarden);
        }
        if (input.hit('Escape')) {
          this.campaign = false;
          this.state = 'title';
          this.setStatus('Lumenwing. Press Enter to wake.');
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
        if (input.hit('KeyR') || input.hit('Enter')) {
          this.campaign = false;
          this.openGardenSelect();
        }
        break;
      default:
        break;
    }
  }

  /** A click on the stage does whatever the current card asks for. */
  onPointerDown(event) {
    if (this.canvas && typeof this.canvas.focus === 'function') this.canvas.focus();
    this.audio.start();

    switch (this.state) {
      case 'title':
        this.openGardenSelect();
        break;
      case 'select': {
        const index = this.gardenAtPointer(event);
        if (index >= 0 && isGardenUnlocked(this.save, index)) {
          this.campaign ? this.startGarden(index) : this.startRun(index);
        }
        break;
      }
      case 'clear':
        this.advance();
        break;
      case 'victory':
      case 'gameover':
        this.campaign = false;
        this.openGardenSelect();
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
      this.stats = tally(this.stats, 'seeds');
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
      this.stats = tally(this.stats, 'motes');
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
    this.stats = tally(this.stats, 'gardens');
    this.commitGarden(true);
    this.audio.clear();
    this.particles.burst(exit.x, exit.y, 40, '#e8ecff', 170, 0.9, 3);
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

    // A preset save is copied before anything reads a best or a lock; the
    // select screen is the only state that does not build a fresh run.
    if (shot.save) {
      this.save = { ...shot.save };
      this.save.bests = [...(shot.save.bests || [])];
      this.save.cleared = [...(shot.save.cleared || [])];
      this.best = Number.isFinite(this.save.best) ? this.save.best : 0;
    }

    if (shot.state !== 'select') {
      this.startRun(shot.garden);
      for (let i = 0; i < 24; i++) this.step(1 / 60);
    }

    this.state = shot.state;
    this.time = Number.isFinite(shot.time) ? shot.time : 0;
    this.elapsed = Number.isFinite(shot.elapsed) ? shot.elapsed : 0;
    this.best = Number.isFinite(shot.best) ? shot.best : this.save.best;
    this.newBest = !!shot.newBest;
    this.reason = shot.reason || '';
    this.shake = 0;
    this.flash = 0;
    this.popups.length = 0;

    // Keep the presentation counters in step with the preset, including the
    // victory tally, without recording another run.
    const stats = newRunStats();
    stats.seeds = Number.isFinite(shot.seeds) ? shot.seeds : 0;
    stats.motes = Number.isFinite(shot.motes) ? shot.motes : 0;
    stats.gardens =
      shot.state === 'victory' ? 3 : shot.state === 'clear' ? this.world.index + 1 : 0;
    stats.startedAt = performance.now() - this.elapsed * 1000;
    this.stats = stats;

    if (Number.isInteger(shot.selectedGarden)) this.selectedGarden = shot.selectedGarden;

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

const STEP = 1 / 120;
const MAX_FRAME = 0.05;
const MAX_STEPS = 8;
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
  select: {
    state: 'select',
    time: 1.2,
    save: {
      best: 10240,
      runs: 12,
      clears: 1,
      seeds: 38,
      motes: 96,
      bests: [3720, 4460, 0, 0],
      cleared: [true, true, false, false],
    },
    selectedGarden: 2,
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
  clear2: {
    garden: 1,
    state: 'clear',
    atExit: true,
    seeds: 6,
    motes: 21,
    hearts: 3,
    oil: 74,
    score: 8240,
    elapsed: 214,
    time: 215,
  },
  victory: {
    garden: 3,
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

// Keyboard input for LUMENWING.
//
// The game reads two kinds of edges from this module:
//   - held()    is true for as long as a key is down;
//   - hit()     is true only for the frame in which the key went down.
// endFrame() is called once at the end of every game loop iteration, so pressed
// and released always describe exactly one frame.

const PREVENT_DEFAULT = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
]);

export class Input {
  /**
   * @param {EventTarget} [target] element (or window) that receives key events.
   */
  constructor(target = typeof window !== 'undefined' ? window : null) {
    this.target = target;
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.any = false;

    this.onKeyDown = (event) => {
      const code = event.code;
      if (!code) return;
      // Arrows scroll the page and Space activates focused buttons; neither is
      // wanted while flying.
      if (PREVENT_DEFAULT.has(code)) event.preventDefault();
      if (!this.down.has(code)) this.pressed.add(code);
      this.down.add(code);
      this.any = true;
    };

    this.onKeyUp = (event) => {
      const code = event.code;
      if (!code) return;
      this.down.delete(code);
      this.released.add(code);
    };

    // Losing focus mid-key would otherwise leave the moth flying forever.
    this.onBlur = () => {
      this.down.clear();
      this.pressed.clear();
      this.released.clear();
      this.any = false;
    };

    if (this.target && typeof this.target.addEventListener === 'function') {
      this.target.addEventListener('keydown', this.onKeyDown);
      this.target.addEventListener('keyup', this.onKeyUp);
    }
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('blur', this.onBlur);
    }
  }

  /** True while `code` is held down. */
  held(code) {
    return this.down.has(code);
  }

  /** True only on the frame `code` first went down. */
  hit(code) {
    return this.pressed.has(code);
  }

  /**
   * Movement direction from WASD and the arrow keys.
   * Diagonals are normalised so they are not faster than a single axis.
   */
  axis() {
    const left = this.held('KeyA') || this.held('ArrowLeft');
    const right = this.held('KeyD') || this.held('ArrowRight');
    const up = this.held('KeyW') || this.held('ArrowUp');
    const down = this.held('KeyS') || this.held('ArrowDown');

    let x = (right ? 1 : 0) - (left ? 1 : 0);
    let y = (down ? 1 : 0) - (up ? 1 : 0);
    const length = Math.sqrt(x * x + y * y);
    if (length > 1) {
      x /= length;
      y /= length;
    }
    return { x, y };
  }

  /** Retire this frame's one-shot edges. Call after updating the game. */
  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.any = false;
  }

  /** Remove every listener (used when the game view is torn down). */
  destroy() {
    if (this.target && typeof this.target.removeEventListener === 'function') {
      this.target.removeEventListener('keydown', this.onKeyDown);
      this.target.removeEventListener('keyup', this.onKeyUp);
    }
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('blur', this.onBlur);
    }
  }
}

// The page's only script: find the stage and hand it to the game.
const canvas = document.getElementById('game');
if (canvas) new Game(canvas);

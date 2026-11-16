// All of the game's art is drawn here in code: the layered cavern with its
// strata, stalactites and glowing flora, the pickups, the moonflower and the
// lantern light that cuts through the dark. The renderer keeps one offscreen
// canvas for the light mask so the world can be dimmed without touching the HUD.
import { TAU, clamp, hash, hashAt, lerp } from './utils.js';
import { caveAt, caveCenter, VIEW_W, VIEW_H } from './world.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.light = document.createElement('canvas');
    this.light.width = VIEW_W;
    this.light.height = VIEW_H;
    this.lightCtx = this.light.getContext('2d');
    this.stars = this.makeStars();
    this.islands = [];
  }

  makeStars() {
    const list = [];
    for (let i = 0; i < 170; i++) {
      list.push({
        x: hash(i * 7 + 1) * VIEW_W,
        y: hash(i * 13 + 4) * VIEW_H * 0.8,
        r: 0.4 + hash(i * 3 + 2) * 1.6,
        tw: hash(i * 5 + 8) * TAU,
        depth: 0.1 + hash(i * 11 + 3) * 0.3,
        warm: hash(i * 17 + 5) > 0.86,
      });
    }
    return list;
  }

  draw(game) {
    const { ctx } = this;
    const { player, world, cam } = game;
    const garden = world.garden;
    const t = game.time;
    this.islands = world.islands;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = garden.bgTop;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    const shakeX = game.shake > 0 ? (Math.random() - 0.5) * game.shake : 0;
    const shakeY = game.shake > 0 ? (Math.random() - 0.5) * game.shake : 0;
    ctx.save();
    ctx.translate(-cam.x + shakeX, -cam.y + shakeY);
    this.drawBackdrop(ctx, garden, cam, t);
    this.drawMidrock(ctx, garden, cam, t);
    this.drawMoon(ctx, garden, cam, t);
    this.drawCave(ctx, garden, cam, t, game);
    this.drawShaft(ctx, garden, cam, t);
    this.fillLight(ctx, garden, cam);
    this.drawFlora(ctx, garden, cam, t, game);
    this.drawIslands(ctx, garden, t);
    this.drawPickups(ctx, game);
    this.drawExit(ctx, game);
    for (const bat of game.bats) bat.draw(ctx);
    player.draw(ctx);
    game.particles.draw(ctx);
    this.drawNearSilhouette(ctx, garden, cam, t);
    ctx.restore();

    this.drawLighting(game);
    this.drawGlowPass(game);
    this.drawForeground(ctx, garden, cam, t);
    this.drawVignette(ctx);
    if (game.flash > 0) {
      ctx.fillStyle = `rgba(255,80,70,${clamp(game.flash, 0, 0.35)})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  // Far layer: sky, stars, two blurred rock folds and slow light shafts.
  drawBackdrop(ctx, garden, cam, t) {
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    grad.addColorStop(0, garden.bgTop);
    grad.addColorStop(0.55, garden.fog);
    grad.addColorStop(1, garden.bgBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(cam.x, 0, VIEW_W, VIEW_H);

    for (const s of this.stars) {
      const x = ((s.x - cam.x * s.depth) % VIEW_W + VIEW_W) % VIEW_W + cam.x;
      const a = 0.2 + 0.6 * (0.5 + 0.5 * Math.sin(t * 1.2 + s.tw));
      ctx.fillStyle = s.warm ? `rgba(255,220,170,${a * 0.5})` : `rgba(190,246,235,${a * 0.55})`;
      ctx.beginPath();
      ctx.arc(x, s.y, s.r, 0, TAU);
      ctx.fill();
    }

    for (let layer = 0; layer < 2; layer++) {
      const par = layer === 0 ? 0.2 : 0.42;
      const lift = layer === 0 ? 150 : 92;
      ctx.fillStyle = layer === 0 ? 'rgba(2,7,12,0.62)' : 'rgba(4,12,18,0.72)';
      this.foldShape(ctx, garden, cam, par, lift, true);
      this.foldShape(ctx, garden, cam, par, lift, false);
    }

    this.drawFog(ctx, garden, cam, t);
    this.drawMotes(ctx, garden, cam, t);

    // Light shafts falling from the roof: a few fixed places per garden.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const wx = (i + 0.5) * (garden.length / 4) + Math.sin(garden.seed + i) * 300;
      const sx = wx - cam.x * 0.82 - cam.x * 0.18;
      if (sx < -260 || sx > VIEW_W + 260) continue;
      const sway = Math.sin(t * 0.24 + i * 1.7) * 22;
      const beam = ctx.createLinearGradient(0, 60, 0, 560);
      beam.addColorStop(0, `rgba(210,255,240,${0.05 + (i % 2) * 0.02})`);
      beam.addColorStop(1, 'rgba(210,255,240,0)');
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(sx - 34 + sway, 60);
      ctx.lineTo(sx + 40 + sway, 60);
      ctx.lineTo(sx + 190 + sway, 560);
      ctx.lineTo(sx + 30 + sway, 560);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  foldShape(ctx, garden, cam, par, lift, ceiling) {
    ctx.beginPath();
    if (ceiling) {
      ctx.moveTo(cam.x, -60);
      for (let sx = 0; sx <= VIEW_W + 40; sx += 40) {
        const wx = cam.x * par + sx * (1 - par * 0.42);
        ctx.lineTo(cam.x + sx, caveAt(garden, wx).ceiling + lift + Math.sin(wx * 0.004) * 26);
      }
      ctx.lineTo(cam.x + VIEW_W, -60);
    } else {
      ctx.moveTo(cam.x, VIEW_H + 60);
      for (let sx = 0; sx <= VIEW_W + 40; sx += 40) {
        const wx = cam.x * par + sx * (1 - par * 0.42);
        ctx.lineTo(cam.x + sx, caveAt(garden, wx).floor - lift + Math.sin(wx * 0.0035) * 24);
      }
      ctx.lineTo(cam.x + VIEW_W, VIEW_H + 60);
    }
    ctx.closePath();
    ctx.fill();
  }

  drawMoon(ctx, garden, cam, t) {
    const sx = VIEW_W * 0.62 - (cam.x - garden.length * 0.4) * 0.045;
    const sy = 300;
    const r = 92;
    ctx.save();
    const halo = ctx.createRadialGradient(sx, sy, r * 0.6, sx, sy, r * 3.4);
    halo.addColorStop(0, 'rgba(214,246,255,0.10)');
    halo.addColorStop(0.4, 'rgba(180,220,240,0.06)');
    halo.addColorStop(1, 'rgba(160,200,230,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(sx, sy, r * 3.4, 0, TAU);
    ctx.fill();

    const disc = ctx.createRadialGradient(sx - r * 0.3, sy - r * 0.35, r * 0.15, sx, sy, r);
    disc.addColorStop(0, 'rgba(250,252,240,0.42)');
    disc.addColorStop(0.65, 'rgba(206,232,236,0.32)');
    disc.addColorStop(1, 'rgba(150,196,208,0.18)');
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, TAU);
    ctx.fill();

    // Maria: a few soft darker patches so the disc is not a flat circle.
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#5d7f8c';
    for (let i = 0; i < 5; i++) {
      const a = hash(i * 13 + garden.seed) * TAU;
      const d = hash(i * 7 + garden.seed + 2) * r * 0.62;
      const rr = r * (0.1 + hash(i * 3 + garden.seed) * 0.16);
      ctx.beginPath();
      ctx.ellipse(sx + Math.cos(a) * d, sy + Math.sin(a) * d, rr, rr * 0.78, a, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(240,255,252,0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  drawFog(ctx, garden, cam, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const par = 0.32 + i * 0.12;
      const x = VIEW_W * (0.2 + i * 0.3) + Math.sin(t * 0.06 + i) * 80 - cam.x * par * 0.25;
      const y = 330 + i * 96;
      const w = 520 + i * 130;
      const fog = ctx.createRadialGradient(x, y, 20, x, y, w);
      fog.addColorStop(0, 'rgba(120,190,200,0.055)');
      fog.addColorStop(1, 'rgba(90,150,170,0)');
      ctx.fillStyle = fog;
      ctx.beginPath();
      ctx.ellipse(x, y, w, w * 0.22, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  drawMotes(ctx, garden, cam, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const count = 30;
    const span = VIEW_W + 400;
    for (let i = 0; i < count; i++) {
      const seed = i * 97 + garden.seed;
      const baseX = (i * 0.61803398875 + hash(seed) * 0.11) % 1;
      const baseY = 90 + hash(seed + 3) * 540;
      const par = 0.25 + hash(seed + 7) * 0.5;
      const x = ((baseX * span - cam.x * par + Math.sin(t * 0.14 + i) * 22) % span + span) % span - 200;
      const y = baseY + Math.sin(t * 0.22 + i * 1.7) * 14;
      // Keep the central title and start-prompt area clear of stray glows.
      if (x > VIEW_W / 2 - 220 && x < VIEW_W / 2 + 220 && y > 300 && y < VIEW_H) continue;
      const a = (0.1 + hash(seed + 11) * 0.25) * 0.55;
      const rr = (0.7 + hash(seed + 13) * 1.6) * 0.55;
      ctx.fillStyle = `rgba(220,250,240,${a})`;
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  fillLight(ctx, garden, cam) {
    // A wide, very soft pool of cave light so the play space is not pitch
    // black between the lantern and the far walls.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const x = cam.x + VIEW_W / 2;
    const g = ctx.createRadialGradient(x, 372, 60, x, 372, 720);
    g.addColorStop(0, 'rgba(70,150,158,0.10)');
    g.addColorStop(0.55, 'rgba(50,110,125,0.05)');
    g.addColorStop(1, 'rgba(40,90,110,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cam.x, 0, VIEW_W, VIEW_H);
    ctx.restore();
  }

  // Middle layer: a darker rock shelf that sits between the distant folds and
  // the play space, so the cave has near, middle and far planes.
  drawMidrock(ctx, garden, cam, t) {
    const par = 0.68;
    ctx.save();
    for (const side of [true, false]) {
      ctx.fillStyle = 'rgba(5,14,20,0.8)';
      ctx.beginPath();
      const base = side ? -40 : VIEW_H + 40;
      ctx.moveTo(cam.x - 20, base);
      for (let sx = -20; sx <= VIEW_W + 60; sx += 30) {
        const wx = cam.x * par + sx * (1 - par * 0.3);
        const { ceiling, floor } = caveAt(garden, wx);
        const wobble = Math.sin(wx * 0.006 + garden.seed) * 18 + Math.sin(wx * 0.017) * 9;
        const y = side ? ceiling + 76 + wobble : floor - 76 - wobble;
        ctx.lineTo(cam.x + sx, y);
      }
      ctx.lineTo(cam.x + VIEW_W + 60, base);
      ctx.closePath();
      ctx.fill();
      // A faint cold rim so the shelf separates from the background.
      ctx.strokeStyle = 'rgba(110,230,212,0.07)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let sx = -20; sx <= VIEW_W + 60; sx += 30) {
        const wx = cam.x * par + sx * (1 - par * 0.3);
        const { ceiling, floor } = caveAt(garden, wx);
        const wobble = Math.sin(wx * 0.006 + garden.seed) * 18 + Math.sin(wx * 0.017) * 9;
        const y = side ? ceiling + 76 + wobble : floor - 76 - wobble;
        if (sx === -20) ctx.moveTo(cam.x + sx, y);
        else ctx.lineTo(cam.x + sx, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // The play field walls: solid rock, strata, speckles, stalactites and a lit
  // rim. This is the layer the lantern is supposed to reveal.
  drawCave(ctx, garden, cam, t, game) {
    const left = cam.x - 60;
    const right = cam.x + VIEW_W + 60;
    const step = 10;

    const rockGrad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    rockGrad.addColorStop(0, garden.rockDeep);
    rockGrad.addColorStop(0.32, garden.rock);
    rockGrad.addColorStop(0.55, garden.rockDeep);
    rockGrad.addColorStop(0.82, garden.rock);
    rockGrad.addColorStop(1, garden.rockDeep);

    for (const side of ['ceiling', 'floor']) {
      ctx.save();
      ctx.beginPath();
      if (side === 'ceiling') {
        ctx.moveTo(left, -80);
        for (let x = left; x <= right; x += step) ctx.lineTo(x, caveAt(garden, x).ceiling);
        ctx.lineTo(right, -80);
      } else {
        ctx.moveTo(left, VIEW_H + 80);
        for (let x = left; x <= right; x += step) ctx.lineTo(x, caveAt(garden, x).floor);
        ctx.lineTo(right, VIEW_H + 80);
      }
      ctx.closePath();
      ctx.fillStyle = rockGrad;
      ctx.fill();
      ctx.clip();

      // Strata: bands that follow the wall, lighter as they go deeper.
      for (let band = 1; band <= 5; band++) {
        const offset = band * 20 + band * band * 2.4;
        ctx.beginPath();
        for (let x = left; x <= right; x += step) {
          const edge = side === 'ceiling' ? caveAt(garden, x).ceiling : caveAt(garden, x).floor;
          const y = side === 'ceiling' ? edge + offset : edge - offset;
          if (x === left) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = band % 2 === 0 ? 'rgba(150,240,226,0.055)' : 'rgba(0,0,0,0.22)';
        ctx.lineWidth = band % 2 === 0 ? 1.4 : 3 + band;
        ctx.stroke();
      }

      // Speckles and wet glints, deterministic from the world x.
      const start = Math.floor(left / 46) * 46;
      for (let x = start; x < right; x += 46) {
        const h1 = hashAt(x, garden.seed + 3);
        const h2 = hashAt(x + 17, garden.seed + 9);
        const edge = side === 'ceiling' ? caveAt(garden, x).ceiling : caveAt(garden, x).floor;
        for (let i = 0; i < 3; i++) {
          const depth = 10 + h1 * 120 + i * 34;
          const y = side === 'ceiling' ? edge + depth : edge - depth;
          const r = 0.7 + h2 * 1.8;
          ctx.fillStyle = `rgba(190,236,228,${0.04 + h2 * 0.07})`;
          ctx.beginPath();
          ctx.arc(x + h2 * 30, y, r, 0, TAU);
          ctx.fill();
        }
        if (h1 > 0.72) {
          const depth = 8 + h2 * 46;
          const y = side === 'ceiling' ? edge + depth : edge - depth;
          ctx.strokeStyle = 'rgba(160,255,238,0.10)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + 3 + h2 * 5, y + 14 + h1 * 28);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // Stalactites and stalagmites hanging off the wall, drawn as part of it.
    const sStart = Math.floor(left / 118) * 118;
    for (let x = sStart; x < right; x += 118) {
      const h = hashAt(x, garden.seed + 21);
      if (h < 0.35) continue;
      const fromCeiling = h > 0.5;
      const edge = fromCeiling ? caveAt(garden, x).ceiling : caveAt(garden, x).floor;
      const len = 22 + h * 78;
      const wide = 9 + h * 17;
      const grad = ctx.createLinearGradient(x, edge, x, fromCeiling ? edge + len : edge - len);
      grad.addColorStop(0, garden.rock);
      grad.addColorStop(1, garden.rockDeep);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(x - wide, edge + (fromCeiling ? -6 : 6));
      ctx.quadraticCurveTo(x - wide * 0.3, edge + (fromCeiling ? len * 0.55 : -len * 0.55), x, fromCeiling ? edge + len : edge - len);
      ctx.quadraticCurveTo(x + wide * 0.3, edge + (fromCeiling ? len * 0.55 : -len * 0.55), x + wide, edge + (fromCeiling ? -6 : 6));
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = garden.edgeSoft;
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - wide * 0.6, edge + (fromCeiling ? 2 : -2));
      ctx.quadraticCurveTo(x - wide * 0.2, edge + (fromCeiling ? len * 0.5 : -len * 0.5), x, fromCeiling ? edge + len : edge - len);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Rim light on both walls. Emberfall and Dewglass keep the main rim in the
    // garden's muted edge colour, with bright accents only near the player and
    // the exit so the frame cannot collapse into one warm haze.
    const ember = garden.id === 'emberfall';
    const dew = garden.id === 'dewglass';
    const mutedRim = ember || dew;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (mutedRim) {
      for (const pass of [
        { w: 10, a: ember ? 0.12 : 0.16, blur: 18, color: garden.rockDeep },
        { w: 2.2, a: ember ? 0.34 : 0.46, blur: 6, color: garden.edgeSoft },
      ]) {
        ctx.strokeStyle = pass.color;
        ctx.lineWidth = pass.w;
        ctx.globalAlpha = pass.a;
        ctx.shadowColor = pass.color;
        ctx.shadowBlur = pass.blur;
        for (const side of ['ceiling', 'floor']) {
          ctx.beginPath();
          for (let x = left; x <= right; x += step) {
            const y = caveAt(garden, x)[side] + (side === 'ceiling' ? 2 : -2);
            if (x === left) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }

      const accents = [];
      if (game && game.player) accents.push(game.player.x);
      if (game && game.world && game.world.exit) accents.push(game.world.exit.x);
      for (const accentX of accents) {
        const lo = Math.max(left, accentX - 140);
        const hi = Math.min(right, accentX + 140);
        if (hi <= lo) continue;
        ctx.strokeStyle = garden.edge;
        ctx.lineWidth = 2;
        ctx.globalAlpha = ember ? 0.55 : 0.7;
        ctx.shadowColor = garden.edge;
        ctx.shadowBlur = 10;
        for (const side of ['ceiling', 'floor']) {
          ctx.beginPath();
          for (let x = lo; x <= hi; x += step) {
            const y = caveAt(garden, x)[side] + (side === 'ceiling' ? 2 : -2);
            if (x === lo) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
    } else {
      for (const pass of [{ w: 11, a: 0.26, blur: 30 }, { w: 2.8, a: 0.92, blur: 12 }]) {
        ctx.strokeStyle = garden.edge;
        ctx.lineWidth = pass.w;
        ctx.globalAlpha = pass.a;
        ctx.shadowColor = garden.edge;
        ctx.shadowBlur = pass.blur;
        for (const side of ['ceiling', 'floor']) {
          ctx.beginPath();
          for (let x = left; x <= right; x += step) {
            const y = caveAt(garden, x)[side] + (side === 'ceiling' ? 2 : -2);
            if (x === left) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // One wide diagonal beam from the upper left to the lower right, tinted by
  // the garden. It parallaxes slowly against the cave and stays well below the
  // moth's brightness.
  drawShaft(ctx, garden, cam, t) {
    const ember = garden.id === 'emberfall';
    const frost = garden.id === 'frostbloom';
    const tint = ember ? '255,208,198' : frost ? '198,222,255' : '245,243,224';
    const slide = (((cam.x * 0.22 + Math.sin(t * 0.1) * 30) % 260) + 260) % 260 - 130;
    const sx = cam.x + slide;
    ctx.save();
    const wide = ctx.createLinearGradient(sx - 160, 0, sx + 280, 0);
    wide.addColorStop(0, `rgba(${tint},0)`);
    wide.addColorStop(0.34, `rgba(${tint},0.10)`);
    wide.addColorStop(0.64, `rgba(${tint},0.10)`);
    wide.addColorStop(1, `rgba(${tint},0)`);
    ctx.fillStyle = wide;
    ctx.beginPath();
    ctx.moveTo(sx - 160, -80);
    ctx.lineTo(sx + 280, -80);
    ctx.lineTo(sx + 1000, VIEW_H + 80);
    ctx.lineTo(sx + 560, VIEW_H + 80);
    ctx.closePath();
    ctx.fill();

    const core = ctx.createLinearGradient(sx + 40, -40, sx + VIEW_W + 380, VIEW_H + 40);
    core.addColorStop(0, `rgba(${tint},0.06)`);
    core.addColorStop(0.5, `rgba(${tint},0.2)`);
    core.addColorStop(1, `rgba(${tint},0.04)`);
    ctx.strokeStyle = core;
    ctx.lineWidth = 4;
    ctx.shadowColor = `rgba(${tint},0.25)`;
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.moveTo(sx + 56, -40);
    ctx.lineTo(sx + 800, VIEW_H + 40);
    ctx.stroke();
    ctx.restore();
  }

  drawFlora(ctx, garden, cam, t, game) {
    const ember = garden.id === 'emberfall';
    const dew = garden.id === 'dewglass';
    const mutedFlora = ember || dew;
    const lineColor = mutedFlora ? garden.edgeSoft : garden.flora;
    const lineAlpha = ember ? 0.18 : dew ? 0.22 : 0.22;
    const bulbAlpha = ember ? 0.26 : dew ? 0.38 : 0.52;
    const bulbBlur = ember ? 5 : dew ? 7 : 9;
    const poolAlpha = ember ? 0.09 : dew ? 0.12 : 0.18;
    const start = Math.floor(cam.x / 74) * 74;
    for (let x = start; x < cam.x + VIEW_W + 74; x += 74) {
      const h = hashAt(x, garden.seed);
      const { ceiling, floor } = caveAt(garden, x);
      const sway = Math.sin(t * 1.05 + x * 0.01) * 5;

      // Hanging vines with a bulb of light at the tip.
      if (h > 0.72) {
        const len = 22 + h * 62;
        ctx.strokeStyle = lineColor;
        ctx.globalAlpha = lineAlpha;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, ceiling + 3);
        ctx.bezierCurveTo(x + sway * 0.6, ceiling + len * 0.4, x + sway, ceiling + len * 0.75, x + sway * 1.5, ceiling + len);
        ctx.stroke();
        ctx.globalAlpha = bulbAlpha;
        ctx.fillStyle = garden.accent;
        ctx.shadowColor = garden.accent;
        ctx.shadowBlur = bulbBlur;
        ctx.beginPath();
        ctx.arc(x + sway * 1.5, ceiling + len, 1.45 + h * 1.3, 0, TAU);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = ember ? 0.12 : 0.18;
        ctx.fillStyle = lineColor;
        ctx.beginPath();
        ctx.ellipse(x + sway * 0.6, ceiling + len * 0.42, 3.2, 8, 0.5, 0, TAU);
        ctx.fill();
      }

      // Fern fans on the floor.
      if (h < 0.62) {
        const len = 16 + h * 46;
        ctx.globalAlpha = ember ? 0.26 : dew ? 0.3 : 0.36;
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 1.4;
        for (let f = -2; f <= 2; f++) {
          ctx.beginPath();
          ctx.moveTo(x + 34, floor - 2);
          ctx.quadraticCurveTo(x + 34 + f * 8 + sway * 0.4, floor - len * 0.6, x + 34 + f * 17 + sway, floor - len);
          ctx.stroke();
        }
        ctx.globalAlpha = ember ? 0.38 : dew ? 0.52 : 0.7;
        ctx.fillStyle = mutedFlora ? garden.edgeSoft : garden.edge;
        ctx.shadowColor = mutedFlora ? garden.edgeSoft : garden.edge;
        ctx.shadowBlur = ember ? 4 : dew ? 6 : 8;
        for (let f = -1; f <= 1; f++) {
          ctx.beginPath();
          ctx.arc(x + 34 + f * 17 + sway, floor - len * (0.7 - Math.abs(f) * 0.15), 1.8, 0, TAU);
          ctx.fill();
        }
        ctx.shadowBlur = 0;
      }

      // Shelf mushrooms clinging to the wall.
      if (h > 0.22 && h < 0.4) {
        const shelfY = floor - 40 - h * 60;
        for (let m = 0; m < 2; m++) {
          const rr = 5 + h * 6 - m * 2;
          ctx.globalAlpha = (0.18 - m * 0.05) * (mutedFlora ? 0.7 : 1);
          ctx.fillStyle = mutedFlora ? garden.edgeSoft : 'rgba(150,240,220,1)';
          ctx.beginPath();
          ctx.ellipse(x + 42, shelfY + m * 10, rr * 1.8, rr * 0.7, -0.25, Math.PI, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }

    // A few shallow glowing pools on the floor, a warm counterpoint.
    ctx.globalAlpha = 1;
    for (let x = Math.floor(cam.x / 520) * 520; x < cam.x + VIEW_W + 520; x += 520) {
      const h = hashAt(x, garden.seed + 44);
      if (h < 0.4) continue;
      const y = caveAt(garden, x).floor - 4;
      const w = 42 + h * 66;
      const glow = ctx.createRadialGradient(x, y, 2, x, y, w);
      glow.addColorStop(0, `rgba(255,216,140,${poolAlpha})`);
      glow.addColorStop(1, 'rgba(255,190,90,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.ellipse(x, y, w, w * 0.22, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = `rgba(255,230,170,${poolAlpha + 0.02})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(x, y, w * 0.7, w * 0.14, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawIslands(ctx, garden, t) {
    for (const island of this.islands) {
      const r = island.r;
      const grad = ctx.createRadialGradient(island.x - r * 0.35, island.y - r * 0.4, r * 0.1, island.x, island.y, r);
      grad.addColorStop(0, garden.rock);
      grad.addColorStop(0.7, garden.rockDeep);
      grad.addColorStop(1, '#010409');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(island.x, island.y, r, r * 0.88, Math.sin(island.x) * 0.35, 0, TAU);
      ctx.fill();

      // Rim light along the top edge, so the boulder reads in the dark.
      ctx.strokeStyle = garden.edgeSoft;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(island.x, island.y - r * 0.08, r * 0.94, r * 0.78, Math.sin(island.x) * 0.35, Math.PI * 1.02, Math.PI * 1.92);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // A cluster of pale growth on the crown.
      for (let i = 0; i < 3; i++) {
        const a = hashAt(island.x + i * 31, garden.seed) * TAU;
        const rr = r * (0.45 + hashAt(island.x + i * 17, garden.seed + 5) * 0.45);
        const px = island.x + Math.cos(a) * rr;
        const py = island.y - r * 0.55 + Math.sin(a) * rr * 0.32;
        const glow = ctx.createRadialGradient(px, py, 0, px, py, 14);
        glow.addColorStop(0, garden.flora);
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.arc(px, py, 14, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  drawPickups(ctx, game) {
    const t = game.time;
    for (const seed of game.world.seeds) {
      if (seed.taken) continue;
      const bob = Math.sin(t * 1.7 + seed.phase) * 6;
      ctx.save();
      ctx.translate(seed.x, seed.y + bob);
      const halo = ctx.createRadialGradient(0, 0, 2, 0, 0, 52);
      halo.addColorStop(0, 'rgba(255,228,140,0.4)');
      halo.addColorStop(1, 'rgba(255,196,80,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, 52, 0, TAU);
      ctx.fill();
      ctx.rotate(t * 0.35 + seed.phase);
      const petal = ctx.createLinearGradient(0, -18, 0, 18);
      petal.addColorStop(0, '#fff9de');
      petal.addColorStop(0.5, '#ffe08e');
      petal.addColorStop(1, '#f0a44a');
      ctx.fillStyle = petal;
      ctx.strokeStyle = 'rgba(90,48,12,0.55)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * 13, Math.sin(a) * 13, 7.5, 13.5, a, 0, TAU);
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = '#fffbe8';
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,70,20,0.5)';
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    for (const drop of game.world.oil) {
      if (drop.taken) continue;
      const bob = Math.sin(t * 2.1 + drop.phase) * 5;
      ctx.save();
      ctx.translate(drop.x, drop.y + bob);
      const halo = ctx.createRadialGradient(0, 0, 2, 0, 0, 34);
      halo.addColorStop(0, 'rgba(255,206,120,0.4)');
      halo.addColorStop(1, 'rgba(255,160,60,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, 34, 0, TAU);
      ctx.fill();
      const body = ctx.createLinearGradient(0, -17, 0, 12);
      body.addColorStop(0, '#fff4cf');
      body.addColorStop(1, '#f0a842');
      ctx.fillStyle = body;
      ctx.strokeStyle = 'rgba(96,52,12,0.6)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.bezierCurveTo(13, -3, 10, 9, 0, 13);
      ctx.bezierCurveTo(-10, 9, -13, -3, 0, -18);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.ellipse(-3.5, -6, 2.2, 3.4, -0.4, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    for (const mote of game.world.motes) {
      if (mote.taken) continue;
      const bob = Math.sin(t * 2.4 + mote.phase) * 8;
      const a = 0.5 + 0.4 * Math.sin(t * 3 + mote.phase);
      ctx.save();
      ctx.translate(mote.x, mote.y + bob);
      ctx.globalCompositeOperation = 'lighter';
      const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, 18);
      halo.addColorStop(0, `rgba(255,246,200,${a})`);
      halo.addColorStop(1, 'rgba(255,232,150,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `rgba(255,250,224,${Math.min(1, a + 0.2)})`;
      ctx.beginPath();
      ctx.arc(0, 0, 3.2, 0, TAU);
      ctx.fill();
      ctx.fillRect(-14, -0.9, 28, 1.8);
      ctx.fillRect(-0.9, -14, 1.8, 28);
      ctx.restore();
    }
  }

  drawExit(ctx, game) {
    const exit = game.world.exit;
    const open = game.player.seeds >= game.world.garden.seeds;
    const t = game.time;
    const petals = 9;
    const spread = open ? 1 : 0.5;
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.5);
    ctx.save();
    ctx.translate(exit.x, exit.y);

    // Beacon: a pale column from the bloom to the roof of the cavern.
    const shaftW = 90;
    const shaftTop = -exit.y - 60;
    const shaftAlpha = open ? 0.16 : 0.05;
    const shaft = ctx.createLinearGradient(-shaftW / 2, 0, shaftW / 2, 0);
    shaft.addColorStop(0, 'rgba(214,230,255,0)');
    shaft.addColorStop(0.35, `rgba(214,230,255,${shaftAlpha})`);
    shaft.addColorStop(0.65, `rgba(214,230,255,${shaftAlpha})`);
    shaft.addColorStop(1, 'rgba(214,230,255,0)');
    ctx.fillStyle = shaft;
    ctx.fillRect(-shaftW / 2, shaftTop, shaftW, -shaftTop);
    const shaftCore = ctx.createLinearGradient(0, 0, 0, shaftTop);
    shaftCore.addColorStop(0, `rgba(238,244,255,${open ? 0.2 : 0.05})`);
    shaftCore.addColorStop(1, 'rgba(238,244,255,0)');
    ctx.fillStyle = shaftCore;
    ctx.fillRect(-10, shaftTop, 20, -shaftTop);

    const halo = ctx.createRadialGradient(0, 0, 2, 0, 0, open ? 150 : 70);
    halo.addColorStop(0, open ? 'rgba(238,236,255,0.6)' : 'rgba(120,150,160,0.2)');
    halo.addColorStop(0.55, open ? 'rgba(170,196,255,0.16)' : 'rgba(90,120,130,0.06)');
    halo.addColorStop(1, 'rgba(150,180,255,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, open ? 150 : 70, 0, TAU);
    ctx.fill();

    // One slow bright ring so the target reads even in a still frame.
    ctx.strokeStyle = open
      ? `rgba(228,238,255,${0.3 + pulse * 0.28})`
      : 'rgba(170,196,210,0.12)';
    ctx.lineWidth = open ? 2.4 : 1.4;
    ctx.shadowColor = open ? 'rgba(200,220,255,0.7)' : 'transparent';
    ctx.shadowBlur = open ? 18 : 0;
    ctx.beginPath();
    ctx.arc(0, 0, (open ? 78 : 46) + pulse * 6, 0, TAU);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Stem, thicker and rooted in the floor.
    ctx.strokeStyle = open ? '#b9d8c8' : '#3c5257';
    ctx.lineWidth = open ? 3.4 : 2;
    ctx.globalAlpha = open ? 0.8 : 0.45;
    ctx.beginPath();
    ctx.moveTo(4, exit.r + 6);
    ctx.bezierCurveTo(-6, exit.r + 44, 10, exit.r + 74, 2, exit.r + 96);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Layered petals, cool against the moth's warm gold.
    for (let i = 0; i < petals; i++) {
      const a = (i / petals) * TAU + t * (open ? 0.16 : 0.05);
      ctx.save();
      ctx.rotate(a);
      const len = (open ? 46 : 24) * (i % 2 === 0 ? 1 : 0.82);
      const petal = ctx.createLinearGradient(0, 0, 0, -len);
      petal.addColorStop(0, open ? '#f6f2ff' : '#5b6d72');
      petal.addColorStop(0.55, open ? '#cfd4ff' : '#42545a');
      petal.addColorStop(1, open ? '#8f9fe8' : '#2c3b40');
      ctx.fillStyle = petal;
      ctx.strokeStyle = open ? 'rgba(120,130,220,0.5)' : 'rgba(20,30,34,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, -len * 0.58, 10.5 * spread, len, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Stamens and a warm pollen core, so the flower still feels alive.
    if (open) {
      ctx.strokeStyle = 'rgba(255,240,190,0.75)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU + t * 0.3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * 14, Math.sin(a) * 14);
        ctx.stroke();
        ctx.fillStyle = '#ffeaa8';
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 14, Math.sin(a) * 14, 2, 0, TAU);
        ctx.fill();
      }
    }
    const core = ctx.createRadialGradient(0, 0, 1, 0, 0, open ? 22 : 9);
    core.addColorStop(0, open ? '#ffffff' : '#26363a');
    core.addColorStop(0.35, open ? '#fff6c8' : '#2c3e42');
    core.addColorStop(0.7, open ? '#ffd878' : '#2c3e42');
    core.addColorStop(1, open ? 'rgba(255,190,70,0.3)' : 'rgba(30,44,48,0)');
    ctx.fillStyle = core;
    ctx.shadowColor = open ? '#ffe9a8' : 'transparent';
    ctx.shadowBlur = open ? 36 : 0;
    ctx.beginPath();
    ctx.arc(0, 0, open ? 20 : 9, 0, TAU);
    ctx.fill();
    if (open) {
      ctx.fillStyle = 'rgba(255,255,245,0.95)';
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  drawLighting(game) {
    const ctx = this.lightCtx;
    const { player, cam, world } = game;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    // Ambient dark, not black: the cave stays readable and the lantern adds to
    // it instead of being the only thing in the frame.
    ctx.fillStyle = 'rgba(2,4,10,0.18)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.globalCompositeOperation = 'destination-out';

    const sx = player.x - cam.x;
    const sy = player.y - cam.y;
    const radius = player.lightRadius();
    let hole = ctx.createRadialGradient(sx, sy, 10, sx, sy, radius);
    hole.addColorStop(0, 'rgba(0,0,0,1)');
    hole.addColorStop(0.5, 'rgba(0,0,0,0.9)');
    hole.addColorStop(0.78, 'rgba(0,0,0,0.4)');
    hole.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = hole;
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, TAU);
    ctx.fill();

    if (player.pulse > 0) {
      const p = player.pulse / 1.2;
      const r = 150 + (1 - p) * 470;
      hole = ctx.createRadialGradient(sx, sy, r * 0.15, sx, sy, r);
      hole.addColorStop(0, 'rgba(0,0,0,0.75)');
      hole.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = hole;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, TAU);
      ctx.fill();
    }

    const exit = world.exit;
    if (player.seeds >= world.garden.seeds) {
      const ex = exit.x - cam.x;
      const ey = exit.y - cam.y;
      hole = ctx.createRadialGradient(ex, ey, 6, ex, ey, 260);
      hole.addColorStop(0, 'rgba(0,0,0,0.9)');
      hole.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = hole;
      ctx.beginPath();
      ctx.arc(ex, ey, 260, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    this.ctx.drawImage(this.light, 0, 0);
  }

  drawGlowPass(game) {
    const ctx = this.ctx;
    const { player, cam } = game;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const sx = player.x - cam.x;
    const sy = player.y - cam.y;
    const radius = player.pulse > 0 ? 230 : 186;
    const glow = ctx.createRadialGradient(sx, sy, 4, sx, sy, radius);
    glow.addColorStop(0, 'rgba(255,214,140,0.18)');
    glow.addColorStop(0.35, 'rgba(255,180,90,0.08)');
    glow.addColorStop(1, 'rgba(255,150,50,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // A nearer, darker mass across the lower third. It is drawn last in world
  // space, below the moth's usual lane, and gets a thin rim on its upper edge.
  drawNearSilhouette(ctx, garden, cam, t) {
    const par = 1.24;
    const span = 760;
    const shift = ((cam.x * par) % span + span) % span;
    const cx = cam.x + shift - 140 + Math.sin(t * 0.18) * 6;
    const topY = cam.y + VIEW_H - 122;
    const baseY = cam.y + VIEW_H + 50;
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = garden.rockDeep;
    ctx.beginPath();
    ctx.moveTo(cx - 310, baseY);
    ctx.quadraticCurveTo(cx - 280, topY + 42, cx - 190, topY + 12);
    ctx.quadraticCurveTo(cx - 96, topY - 18, cx - 16, topY + 26);
    ctx.quadraticCurveTo(cx + 92, topY + 78, cx + 170, topY + 44);
    ctx.quadraticCurveTo(cx + 268, topY + 12, cx + 310, baseY);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = garden.edgeSoft;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(cx - 250, topY + 54);
    ctx.quadraticCurveTo(cx - 190, topY + 14, cx - 96, topY - 10);
    ctx.quadraticCurveTo(cx - 16, topY + 28, cx + 92, topY + 80);
    ctx.quadraticCurveTo(cx + 170, topY + 46, cx + 250, topY + 16);
    ctx.stroke();
    ctx.restore();
  }

  drawForeground(ctx, garden, cam, t) {
    // Two soft silhouettes at the screen edges give the frame a near plane.
    ctx.save();
    for (const side of [-1, 1]) {
      const par = 1.22;
      const screenX = side === -1 ? -30 : VIEW_W + 30;
      const wobble = Math.sin(t * 0.5 + side) * 6;
      const y = VIEW_H + 40;
      const grad = ctx.createLinearGradient(screenX, y - 260, screenX + side * 200, y);
      grad.addColorStop(0, 'rgba(1,3,6,0.88)');
      grad.addColorStop(1, 'rgba(1,3,6,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(screenX + side * 60, y);
      ctx.quadraticCurveTo(screenX - side * 40 + wobble, VIEW_H - 170, screenX + side * 10, VIEW_H - 260);
      ctx.quadraticCurveTo(screenX + side * 80, VIEW_H - 240, screenX + side * 150, y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  drawVignette(ctx) {
    const v = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.4, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.95);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.14)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}

// Every word the player reads: the title screen, the in-flight HUD, the pause
// card and the three end screens (garden cleared, all gardens awake, lantern
// out). Drawn in screen space on top of the world so the layout never drifts.
import { TAU, clamp, formatTime } from './utils.js';
import { VIEW_W, VIEW_H } from './world.js';

const SERIF = 'Georgia, "Iowan Old Style", "Palatino Linotype", serif';
const SANS = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';

function spacing(ctx, text, x, y, gap, align = 'center') {
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (chars.length - 1);
  let cursor = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], cursor + widths[i] / 2, y);
    cursor += widths[i] + gap;
  }
  return total;
}

export class Hud {
  constructor() {
    this.hintFade = 0;
  }

  draw(ctx, game) {
    const { state } = game;
    if (state === 'title') {
      this.drawTitle(ctx, game);
      return;
    }
    this.drawFlightHud(ctx, game);
    if (state === 'paused') this.drawPause(ctx, game);
    if (state === 'clear') this.drawClear(ctx, game);
    if (state === 'victory') this.drawVictory(ctx, game);
    if (state === 'gameover') this.drawGameOver(ctx, game);
  }

  // ---------------------------------------------------------------- title ---
  drawTitle(ctx, game) {
    const t = game.time;
    const veil = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    veil.addColorStop(0, 'rgba(2,6,14,0.62)');
    veil.addColorStop(0.42, 'rgba(2,8,16,0.38)');
    veil.addColorStop(0.78, 'rgba(2,6,12,0.56)');
    veil.addColorStop(1, 'rgba(1,4,9,0.84)');
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // A soft column of light behind the title, breathing slowly.
    const beam = ctx.createRadialGradient(VIEW_W / 2, 250, 20, VIEW_W / 2, 250, 520);
    beam.addColorStop(0, `rgba(255,214,133,${0.13 + Math.sin(t * 0.7) * 0.03})`);
    beam.addColorStop(0.5, 'rgba(255,190,90,0.05)');
    beam.addColorStop(1, 'rgba(255,180,80,0)');
    ctx.fillStyle = beam;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Small eyebrow, then the name.
    ctx.font = `600 15px ${SANS}`;
    ctx.fillStyle = 'rgba(200,240,232,0.62)';
    spacing(ctx, 'A LANTERN MOTH IN THREE SLEEPING GARDENS', VIEW_W / 2, 176, 5.4);

    ctx.font = `700 86px ${SERIF}`;
    ctx.shadowColor = 'rgba(255,208,120,0.55)';
    ctx.shadowBlur = 34;
    const name = ctx.createLinearGradient(0, 190, 0, 268);
    name.addColorStop(0, '#fff8e2');
    name.addColorStop(0.55, '#ffe3a8');
    name.addColorStop(1, '#f3b967');
    ctx.fillStyle = name;
    spacing(ctx, 'LUMENWING', VIEW_W / 2, 232, 8);
    ctx.shadowBlur = 0;

    // A thin divider with a seed at its centre.
    ctx.strokeStyle = 'rgba(255,220,150,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(VIEW_W / 2 - 250, 284);
    ctx.lineTo(VIEW_W / 2 - 20, 284);
    ctx.moveTo(VIEW_W / 2 + 20, 284);
    ctx.lineTo(VIEW_W / 2 + 250, 284);
    ctx.stroke();
    ctx.fillStyle = '#ffdf9c';
    ctx.shadowColor = '#ffd07a';
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(VIEW_W / 2, 284, 4.5, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.font = `italic 400 21px ${SERIF}`;
    ctx.fillStyle = 'rgba(232,244,238,0.86)';
    ctx.fillText('Gather the sunseeds. Wake the moonflowers. Keep your light.', VIEW_W / 2, 326);

    // Three garden names as a quiet row of chapters.
    ctx.font = `500 14px ${SANS}`;
    const names = ['I  DEWGLASS', 'II  EMBERFALL', 'III  FROSTBLOOM'];
    names.forEach((n, i) => {
      const x = VIEW_W / 2 + (i - 1) * 214;
      ctx.fillStyle = i === 0 ? 'rgba(255,224,160,0.85)' : 'rgba(198,226,220,0.5)';
      spacing(ctx, n, x, 372, 3.2);
    });

    // Controls card.
    const cardW = 640;
    const cardH = 126;
    const cardX = VIEW_W / 2 - cardW / 2;
    const cardY = 408;
    ctx.fillStyle = 'rgba(6,16,24,0.66)';
    this.roundRect(ctx, cardX, cardY, cardW, cardH, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,230,208,0.22)';
    ctx.lineWidth = 1;
    this.roundRect(ctx, cardX, cardY, cardW, cardH, 14);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.font = `600 12px ${SANS}`;
    ctx.fillStyle = 'rgba(140,236,220,0.72)';
    spacing(ctx, 'FLY', cardX + 34, cardY + 28, 2.6, 'left');
    ctx.fillStyle = 'rgba(255,226,168,0.72)';
    spacing(ctx, 'PULSE', cardX + 258, cardY + 28, 2.6, 'left');
    ctx.fillStyle = 'rgba(190,214,236,0.72)';
    spacing(ctx, 'PAUSE / MUTE', cardX + 410, cardY + 28, 2.6, 'left');
    ctx.font = `600 19px ${SANS}`;
    ctx.fillStyle = '#fbf8ee';
    ctx.fillText('Arrows or WASD', cardX + 34, cardY + 58);
    ctx.fillText('Space', cardX + 258, cardY + 58);
    ctx.fillText('P  /  M', cardX + 410, cardY + 58);

    ctx.font = `400 15px ${SERIF}`;
    ctx.fillStyle = 'rgba(206,230,224,0.66)';
    ctx.fillText('The lantern burns oil as you fly. Seeds refill it, and every', cardX + 34, cardY + 92);
    ctx.fillText('moonflower you wake carries you on to the next garden.', cardX + 34, cardY + 113);

    // Press-to-start, pulsing.
    const pulse = 0.55 + 0.45 * Math.sin(t * 2.4);
    ctx.fillStyle = 'rgba(2,6,12,0.55)';
    this.roundRect(ctx, VIEW_W / 2 - 270, 584, 540, 56, 28);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,220,150,0.18)';
    ctx.lineWidth = 1;
    this.roundRect(ctx, VIEW_W / 2 - 270, 584, 540, 56, 28);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = `600 22px ${SANS}`;
    ctx.fillStyle = `rgba(255,248,224,${0.65 + pulse * 0.35})`;
    ctx.shadowColor = 'rgba(255,208,120,0.5)';
    ctx.shadowBlur = 20;
    spacing(ctx, 'PRESS  ENTER  TO  WAKE', VIEW_W / 2, 612, 4.2);
    ctx.shadowBlur = 0;

    if (game.best > 0) {
      ctx.font = `500 14px ${SANS}`;
      ctx.fillStyle = 'rgba(198,226,220,0.5)';
      spacing(ctx, `BEST FLIGHT  ${game.best.toLocaleString('en-US')}`, VIEW_W / 2, 654, 3);
    }

    ctx.font = `400 12px ${SANS}`;
    ctx.fillStyle = 'rgba(180,206,200,0.34)';
    ctx.fillText('A game drawn entirely in code. No downloads, no network.', VIEW_W / 2, 692);
    ctx.restore();
  }

  // ------------------------------------------------------------------ hud ---
  drawFlightHud(ctx, game) {
    const { player, world } = game;
    const garden = world.garden;
    ctx.save();
    ctx.textBaseline = 'middle';

    // Top-left plate: chapter and garden.
    this.plate(ctx, 30, 26, 292, 64);
    ctx.textAlign = 'left';
    ctx.font = `600 12px ${SANS}`;
    ctx.fillStyle = 'rgba(150,240,224,0.9)';
    spacing(ctx, `GARDEN ${world.index + 1} OF 3`, 50, 45, 2.4, 'left');
    ctx.font = `600 20px ${SERIF}`;
    ctx.fillStyle = '#f8f4e6';
    ctx.fillText(garden.name, 50, 70);

    // Top-centre plate: sunseeds gathered, as a count with lit and unlit pips.
    const seedW = 236;
    const seedX = VIEW_W / 2 - seedW / 2;
    this.plate(ctx, seedX, 26, seedW, 64);
    const got = player.seeds;
    const need = garden.seeds;
    const ready = got >= need;
    const pipGap = 24;
    const pipStart = VIEW_W / 2 - ((need - 1) * pipGap) / 2;
    for (let i = 0; i < need; i++) {
      this.seedIcon(ctx, pipStart + i * pipGap, 47, i < got, garden.accent);
    }
    ctx.textAlign = 'center';
    ctx.font = `700 15px ${SANS}`;
    ctx.fillStyle = ready ? '#ffe9ad' : '#f2f7f2';
    const label = ready ? `MOONFLOWER AWAKE` : `SUNSEEDS  ${got} / ${need}`;
    spacing(ctx, label, VIEW_W / 2, 73, 2.4);

    // Top-right plate: hearts and score.
    const rightX = VIEW_W - 30 - 268;
    this.plate(ctx, rightX, 26, 268, 64);
    for (let i = 0; i < player.maxHearts; i++) {
      this.heartIcon(ctx, rightX + 28 + i * 36, 49, i < player.hearts);
    }
    ctx.textAlign = 'right';
    ctx.font = `600 12px ${SANS}`;
    ctx.fillStyle = 'rgba(206,230,224,0.72)';
    spacing(ctx, 'SCORE', VIEW_W - 50, 43, 2.4, 'right');
    ctx.font = `700 24px ${SANS}`;
    ctx.fillStyle = '#fbf7e8';
    ctx.fillText(player.score.toLocaleString('en-US'), VIEW_W - 50, 68);

    // Bottom-left: the oil that keeps the lantern lit, plus the pulse key.
    const oilCardY = VIEW_H - 26 - 78;
    this.plate(ctx, 30, oilCardY, 330, 78);
    ctx.textAlign = 'left';
    const low = player.oil < 24;
    ctx.font = `600 12px ${SANS}`;
    ctx.fillStyle = low ? `rgba(255,150,120,${0.65 + Math.sin(game.time * 8) * 0.3})` : 'rgba(255,220,150,0.92)';
    spacing(ctx, low ? 'LANTERN OIL  LOW' : 'LANTERN OIL', 50, oilCardY + 22, 2.4, 'left');

    ctx.save();
    ctx.textAlign = 'right';
    ctx.font = `600 10px ${SANS}`;
    ctx.fillStyle = 'rgba(170,200,196,0.7)';
    spacing(ctx, 'PULSE', 340, oilCardY + 22, 2, 'right');
    ctx.restore();
    this.keycap(ctx, 246, oilCardY + 13, 46, 'SPACE');

    const barX = 50;
    const barY = oilCardY + 40;
    const barW = 290;
    const barH = 14;
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    this.roundRect(ctx, barX, barY, barW, barH, 7);
    ctx.fill();
    const fill = clamp(player.oil / player.maxOil, 0, 1);
    ctx.save();
    this.roundRect(ctx, barX, barY, barW, barH, 7);
    ctx.clip();
    const oilGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    oilGrad.addColorStop(0, low ? '#ff7d5c' : '#ffb85c');
    oilGrad.addColorStop(1, low ? '#ff5c5c' : '#ffe6a6');
    ctx.fillStyle = oilGrad;
    ctx.fillRect(barX, barY, barW * fill, barH);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,220,150,0.18)';
    ctx.lineWidth = 1;
    this.roundRect(ctx, barX, barY, barW, barH, 7);
    ctx.stroke();
    if (low) {
      ctx.fillStyle = `rgba(255,190,170,${0.6 + Math.sin(game.time * 6) * 0.3})`;
      ctx.beginPath();
      ctx.arc(barX + barW + 14, barY + barH / 2, 3, 0, TAU);
      ctx.fill();
    }

    // Bottom-right: flight time and where this run stands in the three gardens.
    const timeX = VIEW_W - 30 - 268;
    this.plate(ctx, timeX, oilCardY, 268, 78);
    ctx.textAlign = 'right';
    ctx.font = `600 12px ${SANS}`;
    ctx.fillStyle = 'rgba(206,230,224,0.72)';
    spacing(ctx, 'FLIGHT TIME', VIEW_W - 50, oilCardY + 22, 2.4, 'right');
    ctx.font = `700 24px ${SANS}`;
    ctx.fillStyle = '#fbf7e8';
    ctx.fillText(formatTime(game.elapsed), VIEW_W - 50, oilCardY + 47);
    for (let i = 0; i < 3; i++) {
      const dotX = timeX + 36 + i * 18;
      const done = i < world.index;
      const here = i === world.index;
      ctx.fillStyle = done ? '#8ff2dd' : here ? '#ffd685' : 'rgba(200,226,220,0.22)';
      ctx.beginPath();
      ctx.arc(dotX, oilCardY + 63, here ? 4 : 3, 0, TAU);
      ctx.fill();
    }

    // A quiet first-garden hint that fades after a few seconds.
    if (world.index === 0 && game.elapsed < 9) {
      const a = clamp(Math.min(game.elapsed / 0.6, (9 - game.elapsed) / 1.5), 0, 1) * 0.85;
      ctx.textAlign = 'center';
      ctx.font = `italic 400 18px ${SERIF}`;
      ctx.fillStyle = `rgba(240,248,238,${a})`;
      ctx.fillText('Follow the glow. Sunseeds wake the moonflower at the end of the garden.', VIEW_W / 2, VIEW_H - 92);
    }
    ctx.restore();
  }

  keycap(ctx, x, y, w, label) {
    ctx.fillStyle = 'rgba(255,236,190,0.12)';
    this.roundRect(ctx, x, y, w, 19, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,220,150,0.4)';
    ctx.lineWidth = 1;
    this.roundRect(ctx, x, y, w, 19, 4);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = `600 9px ${SANS}`;
    ctx.fillStyle = 'rgba(255,240,205,0.9)';
    ctx.fillText(label, x + w / 2, y + 10.5);
  }

  // ---------------------------------------------------------------- cards ---
  drawPause(ctx, game) {
    this.veil(ctx, 0.62);
    this.card(ctx, 340, 210, 600, 300);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 52px ${SERIF}`;
    ctx.fillStyle = '#fdf6e4';
    spacing(ctx, 'PAUSED', VIEW_W / 2, 292, 7);
    ctx.font = `400 16px ${SERIF}`;
    ctx.fillStyle = 'rgba(222,238,232,0.76)';
    ctx.fillText('The garden holds its breath.', VIEW_W / 2, 342);
    ctx.font = `600 15px ${SANS}`;
    ctx.fillStyle = 'rgba(255,226,168,0.9)';
    ctx.fillText('P  resume', VIEW_W / 2, 404);
    ctx.fillStyle = 'rgba(198,226,220,0.7)';
    ctx.fillText(game.muted ? 'M  sound on' : 'M  sound off', VIEW_W / 2, 434);
    ctx.fillStyle = 'rgba(198,226,220,0.5)';
    ctx.font = `400 13px ${SANS}`;
    ctx.fillText('Garden progress and score are kept while paused.', VIEW_W / 2, 478);
    ctx.restore();
  }

  drawClear(ctx, game) {
    this.veil(ctx, 0.5);
    this.card(ctx, 340, 196, 600, 330);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const g = game.world.garden;
    ctx.font = `600 12px ${SANS}`;
    ctx.fillStyle = 'rgba(140,236,220,0.85)';
    spacing(ctx, 'MOONFLOWER WOKEN', VIEW_W / 2, 250, 3.4);
    ctx.font = `700 44px ${SERIF}`;
    ctx.fillStyle = '#fdf6e4';
    ctx.shadowColor = 'rgba(255,208,120,0.35)';
    ctx.shadowBlur = 20;
    ctx.fillText(g.name, VIEW_W / 2, 302);
    ctx.shadowBlur = 0;
    ctx.font = `italic 400 17px ${SERIF}`;
    ctx.fillStyle = 'rgba(224,238,232,0.78)';
    ctx.fillText(g.subtitle + '.', VIEW_W / 2, 340);

    this.statRow(ctx, VIEW_W / 2, 392, [
      ['SUNSEEDS', `${game.world.garden.seeds}`],
      ['MOTES', `${game.motes}`],
      ['TIME', formatTime(game.elapsed)],
    ]);

    const pulse = 0.55 + 0.45 * Math.sin(game.time * 2.6);
    ctx.font = `600 17px ${SANS}`;
    ctx.fillStyle = `rgba(255,244,214,${0.5 + pulse * 0.5})`;
    spacing(ctx, game.world.index >= 2 ? 'PRESS  ENTER  TO  WAKE  THEM  ALL' : 'PRESS  ENTER  TO  FLY  ON', VIEW_W / 2, 484, 3.4);
    ctx.restore();
  }

  drawVictory(ctx, game) {
    this.veil(ctx, 0.42);
    this.card(ctx, 300, 152, 680, 420);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const t = game.time;
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * TAU + t * 0.12;
      const r = 138 + Math.sin(t * 0.9 + i) * 12;
      const x = VIEW_W / 2 + Math.cos(a) * r * 1.6;
      const y = 322 + Math.sin(a) * r * 0.8;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, 18);
      glow.addColorStop(0, 'rgba(255,236,168,0.55)');
      glow.addColorStop(1, 'rgba(255,210,120,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, 18, 0, TAU);
      ctx.fill();
    }

    ctx.font = `600 12px ${SANS}`;
    ctx.fillStyle = 'rgba(140,236,220,0.85)';
    spacing(ctx, 'ALL THREE GARDENS AWAKE', VIEW_W / 2, 214, 3.6);
    ctx.font = `700 58px ${SERIF}`;
    const gold = ctx.createLinearGradient(0, 236, 0, 292);
    gold.addColorStop(0, '#fffbe8');
    gold.addColorStop(1, '#f2c274');
    ctx.fillStyle = gold;
    ctx.shadowColor = 'rgba(255,208,120,0.6)';
    ctx.shadowBlur = 32;
    spacing(ctx, 'DAWN', VIEW_W / 2, 266, 10);
    ctx.shadowBlur = 0;
    ctx.font = `italic 400 18px ${SERIF}`;
    ctx.fillStyle = 'rgba(230,242,236,0.82)';
    ctx.fillText('The lantern moth carried the morning through the dark.', VIEW_W / 2, 316);

    this.statRow(ctx, VIEW_W / 2, 372, [
      ['SCORE', game.player.score.toLocaleString('en-US')],
      ['TIME', formatTime(game.elapsed)],
      ['BEST', Math.max(game.best, game.player.score).toLocaleString('en-US')],
    ]);

    if (game.player.score >= game.best && game.newBest) {
      ctx.font = `600 14px ${SANS}`;
      ctx.fillStyle = 'rgba(255,226,168,0.95)';
      spacing(ctx, 'NEW  BEST  FLIGHT', VIEW_W / 2, 430, 4);
    }

    const pulse = 0.55 + 0.45 * Math.sin(t * 2.6);
    ctx.font = `600 17px ${SANS}`;
    ctx.fillStyle = `rgba(255,244,214,${0.5 + pulse * 0.5})`;
    spacing(ctx, 'PRESS  R  TO  FLY  AGAIN', VIEW_W / 2, 500, 3.6);
    ctx.restore();
  }

  drawGameOver(ctx, game) {
    this.veil(ctx, 0.66);
    this.card(ctx, 340, 190, 600, 344);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 12px ${SANS}`;
    ctx.fillStyle = 'rgba(255,140,110,0.85)';
    spacing(ctx, 'THE LANTERN WENT DARK', VIEW_W / 2, 246, 3.6);
    ctx.font = `700 46px ${SERIF}`;
    ctx.fillStyle = '#fdf1e4';
    ctx.fillText('The garden keeps you.', VIEW_W / 2, 300);
    ctx.font = `italic 400 17px ${SERIF}`;
    ctx.fillStyle = 'rgba(224,234,230,0.74)';
    ctx.fillText(game.reason, VIEW_W / 2, 340);

    this.statRow(ctx, VIEW_W / 2, 392, [
      ['GARDEN', `${game.world.index + 1} / 3`],
      ['SCORE', game.player.score.toLocaleString('en-US')],
      ['BEST', Math.max(game.best, game.player.score).toLocaleString('en-US')],
    ]);

    const pulse = 0.55 + 0.45 * Math.sin(game.time * 2.6);
    ctx.font = `600 17px ${SANS}`;
    ctx.fillStyle = `rgba(255,244,214,${0.5 + pulse * 0.5})`;
    spacing(ctx, 'PRESS  R  TO  TRY  AGAIN', VIEW_W / 2, 484, 3.6);
    ctx.restore();
  }

  // --------------------------------------------------------------- pieces ---
  plate(ctx, x, y, w, h) {
    ctx.fillStyle = 'rgba(4,12,18,0.55)';
    this.roundRect(ctx, x, y, w, h, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,230,208,0.13)';
    ctx.lineWidth = 1;
    this.roundRect(ctx, x, y, w, h, 12);
    ctx.stroke();
  }

  card(ctx, x, y, w, h) {
    ctx.fillStyle = 'rgba(5,14,20,0.86)';
    this.roundRect(ctx, x, y, w, h, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,220,150,0.24)';
    ctx.lineWidth = 1.2;
    this.roundRect(ctx, x, y, w, h, 18);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(120,230,208,0.10)';
    this.roundRect(ctx, x + 5, y + 5, w - 10, h - 10, 14);
    ctx.stroke();
  }

  veil(ctx, alpha) {
    ctx.fillStyle = `rgba(2,6,12,${alpha})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  statRow(ctx, cx, y, items) {
    const gap = 190;
    ctx.textAlign = 'center';
    items.forEach(([label, value], i) => {
      const x = cx + (i - (items.length - 1) / 2) * gap;
      ctx.font = `600 10px ${SANS}`;
      ctx.fillStyle = 'rgba(170,200,196,0.62)';
      spacing(ctx, label, x, y - 10, 2.6);
      ctx.font = `700 24px ${SANS}`;
      ctx.fillStyle = '#f6f2e4';
      ctx.fillText(value, x, y + 16);
    });
  }

  seedIcon(ctx, x, y, filled, color) {
    ctx.save();
    ctx.translate(x, y);
    if (filled) {
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU - Math.PI / 2;
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * 4.6, Math.sin(a) * 4.6, 2.8, 5.2, a, 0, TAU);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fffbe8';
      ctx.beginPath();
      ctx.arc(0, 0, 2, 0, TAU);
      ctx.fill();
    } else {
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = 'rgba(196,222,216,0.9)';
      ctx.lineWidth = 1.1;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU - Math.PI / 2;
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * 4.6, Math.sin(a) * 4.6, 2.6, 4.8, a, 0, TAU);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, 0, 1.7, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  heartIcon(ctx, x, y, filled) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = filled ? 1 : 0.24;
    ctx.fillStyle = filled ? '#ff8f72' : '#7c9290';
    if (filled) {
      ctx.shadowColor = 'rgba(255,120,90,0.8)';
      ctx.shadowBlur = 12;
    }
    ctx.beginPath();
    ctx.moveTo(0, 7);
    ctx.bezierCurveTo(-11, -1, -8, -11, 0, -5.5);
    ctx.bezierCurveTo(8, -11, 11, -1, 0, 7);
    ctx.fill();
    if (filled) {
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#ffd9c8';
      ctx.beginPath();
      ctx.ellipse(-3.4, -2.6, 2, 2.6, -0.5, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }
}

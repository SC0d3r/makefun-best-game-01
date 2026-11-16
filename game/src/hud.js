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

function trackedWidth(ctx, text, gap) {
  const chars = [...text];
  return chars.reduce((sum, c) => sum + ctx.measureText(c).width, 0) + gap * (chars.length - 1);
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
    if (state === 'victory') {
      this.drawVictory(ctx, game);
      return;
    }
    this.drawFlightHud(ctx, game);
    if (state === 'paused') this.drawPause(ctx, game);
    if (state === 'clear') this.drawClear(ctx, game);
    if (state === 'gameover') this.drawGameOver(ctx, game);
  }

  // ---------------------------------------------------------------- title ---
  drawTitle(ctx, game) {
    const t = game.time;
    const veil = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    veil.addColorStop(0, 'rgba(2,6,14,0.58)');
    veil.addColorStop(0.38, 'rgba(2,8,16,0.34)');
    veil.addColorStop(0.78, 'rgba(2,6,12,0.54)');
    veil.addColorStop(1, 'rgba(1,4,9,0.84)');
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // A soft column of light behind the title, breathing slowly.
    const beam = ctx.createRadialGradient(VIEW_W / 2, 228, 20, VIEW_W / 2, 228, 380);
    beam.addColorStop(0, `rgba(255,214,133,${0.13 + Math.sin(t * 0.7) * 0.03})`);
    beam.addColorStop(0.5, 'rgba(255,190,90,0.05)');
    beam.addColorStop(1, 'rgba(255,180,80,0)');
    ctx.fillStyle = beam;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Small eyebrow, then the name.
    ctx.font = `600 24px ${SANS}`;
    ctx.fillStyle = 'rgba(200,240,232,0.62)';
    spacing(ctx, 'A LANTERN MOTH IN THREE SLEEPING GARDENS', VIEW_W / 2, 150, 5.4);

    ctx.font = `700 96px ${SERIF}`;
    ctx.shadowColor = 'rgba(255,208,120,0.55)';
    ctx.shadowBlur = 34;
    const name = ctx.createLinearGradient(0, 172, 0, 250);
    name.addColorStop(0, '#fff8e2');
    name.addColorStop(0.55, '#ffe3a8');
    name.addColorStop(1, '#f3b967');
    ctx.fillStyle = name;
    spacing(ctx, 'LUMENWING', VIEW_W / 2, 214, 8);
    ctx.shadowBlur = 0;

    // A thin divider with a seed at its centre.
    ctx.strokeStyle = 'rgba(255,220,150,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(VIEW_W / 2 - 250, 266);
    ctx.lineTo(VIEW_W / 2 - 20, 266);
    ctx.moveTo(VIEW_W / 2 + 20, 266);
    ctx.lineTo(VIEW_W / 2 + 250, 266);
    ctx.stroke();
    ctx.fillStyle = '#ffdf9c';
    ctx.shadowColor = '#ffd07a';
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(VIEW_W / 2, 266, 4.5, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.font = `italic 400 26px ${SERIF}`;
    ctx.fillStyle = 'rgba(232,244,238,0.88)';
    ctx.fillText('Fly a lantern moth. Gather sunseeds, wake moonflowers, keep your light.', VIEW_W / 2, 308);

    // Controls: one quiet line on a wide plate.
    const controlsText = 'ARROWS FLY     SPACE PULSE     P PAUSE / M MUTE';
    let controlsSize = 22;
    ctx.font = `600 ${controlsSize}px ${SANS}`;
    if (trackedWidth(ctx, controlsText, 2.2) > 720) controlsSize = 20;
    ctx.fillStyle = 'rgba(6,16,24,0.66)';
    this.roundRect(ctx, 260, 396, 760, 60, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,230,208,0.22)';
    ctx.lineWidth = 1;
    this.roundRect(ctx, 260, 396, 760, 60, 14);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = `600 ${controlsSize}px ${SANS}`;
    ctx.fillStyle = 'rgba(255,236,200,0.92)';
    spacing(ctx, controlsText, VIEW_W / 2, 426, 2.2);

    // The game's second noun, level with the control card on the right.
    this.drawTitleMoonflower(ctx, 1060, 470, t, 36);

    // Start button, pushed down so it separates from the controls card.
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.8);
    const pillW = 560;
    const pillH = 76;
    const pillX = VIEW_W / 2 - pillW / 2;
    const pillY = 560;
    ctx.save();
    ctx.shadowColor = `rgba(255,208,120,${0.2 + pulse * 0.16})`;
    ctx.shadowBlur = 26;
    const pillFill = ctx.createLinearGradient(pillX, 0, pillX + pillW, 0);
    pillFill.addColorStop(0, 'rgba(255,196,96,0.32)');
    pillFill.addColorStop(1, 'rgba(255,196,96,0.02)');
    ctx.fillStyle = pillFill;
    this.roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,226,150,0.9)';
    ctx.lineWidth = 1;
    this.roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
    ctx.stroke();
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.font = `600 32px ${SANS}`;
    ctx.fillStyle = '#fff9ec';
    const textW = spacing(ctx, 'PRESS ENTER TO WAKE', VIEW_W / 2, pillY + pillH / 2, 3.2);
    ctx.strokeStyle = `rgba(255,214,130,${0.25 + pulse * 0.45})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(VIEW_W / 2 - textW / 2, pillY + pillH - 12);
    ctx.lineTo(VIEW_W / 2 + textW / 2, pillY + pillH - 12);
    ctx.stroke();

    if (game.best > 0) {
      ctx.font = `500 20px ${SANS}`;
      ctx.fillStyle = 'rgba(198,226,220,0.55)';
      spacing(ctx, `BEST FLIGHT  ${game.best.toLocaleString('en-US')}`, VIEW_W / 2, 672, 3);
    }

    ctx.font = `500 18px ${SANS}`;
    ctx.fillStyle = 'rgba(180,206,200,0.4)';
    spacing(ctx, 'I  DEWGLASS     II  EMBERFALL     III  FROSTBLOOM', VIEW_W / 2, 698, 2.4);
    ctx.restore();
  }

  // The moonflower on the cover, in the same visual language as drawExit.
  drawTitleMoonflower(ctx, x, y, t, r = 36) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.4);
    ctx.save();
    ctx.translate(x, y);

    // A short, faint shaft of light above the bloom.
    const shaft = ctx.createLinearGradient(0, -r * 2.8, 0, 0);
    shaft.addColorStop(0, 'rgba(214,230,255,0)');
    shaft.addColorStop(0.55, 'rgba(214,230,255,0.1)');
    shaft.addColorStop(1, 'rgba(214,230,255,0.03)');
    ctx.fillStyle = shaft;
    ctx.fillRect(-r * 0.32, -r * 2.8, r * 0.64, r * 2.8);

    const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, r * 2.4);
    glow.addColorStop(0, 'rgba(236,232,255,0.5)');
    glow.addColorStop(0.5, 'rgba(170,196,255,0.14)');
    glow.addColorStop(1, 'rgba(150,180,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.4, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = `rgba(228,238,255,${0.25 + pulse * 0.2})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.35 + pulse * 3, 0, TAU);
    ctx.stroke();

    const petals = 9;
    for (let i = 0; i < petals; i++) {
      const a = (i / petals) * TAU + t * 0.12;
      ctx.save();
      ctx.rotate(a);
      const len = r * (i % 2 === 0 ? 0.98 : 0.82);
      const petal = ctx.createLinearGradient(0, 0, 0, -len);
      petal.addColorStop(0, '#f6f2ff');
      petal.addColorStop(0.55, '#cfd4ff');
      petal.addColorStop(1, '#8f9fe8');
      ctx.fillStyle = petal;
      ctx.strokeStyle = 'rgba(120,130,220,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, -len * 0.58, r * 0.19, len, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    ctx.strokeStyle = 'rgba(255,240,190,0.7)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + t * 0.3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * r * 0.26, Math.sin(a) * r * 0.26);
      ctx.stroke();
      ctx.fillStyle = '#ffeaa8';
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r * 0.26, Math.sin(a) * r * 0.26, 1.8, 0, TAU);
      ctx.fill();
    }
    const core = ctx.createRadialGradient(0, 0, 1, 0, 0, r * 0.4);
    core.addColorStop(0, '#ffffff');
    core.addColorStop(0.35, '#fff6c8');
    core.addColorStop(0.7, '#ffd878');
    core.addColorStop(1, 'rgba(255,190,70,0.3)');
    ctx.fillStyle = core;
    ctx.shadowColor = '#ffe9a8';
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.36, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,245,0.95)';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.14, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // ------------------------------------------------------------------ hud ---
  drawFlightHud(ctx, game) {
    const { player, world } = game;
    const garden = world.garden;
    ctx.save();
    ctx.textBaseline = 'middle';

    // Top-left: the score, as one big bright number.
    this.plate(ctx, 30, 26, 280, 78);
    ctx.textAlign = 'left';
    ctx.font = `600 20px ${SANS}`;
    ctx.fillStyle = 'rgba(150,240,224,0.88)';
    spacing(ctx, 'SCORE', 50, 44, 2.2, 'left');
    ctx.font = `700 44px ${SANS}`;
    ctx.fillStyle = '#fff8e2';
    ctx.shadowColor = 'rgba(255,214,140,0.55)';
    ctx.shadowBlur = 14;
    ctx.fillText(player.score.toLocaleString('en-US'), 50, 78);
    ctx.shadowBlur = 0;

    // Top-centre: flight time, turning amber after four minutes.
    const timeW = 230;
    const timeX = VIEW_W / 2 - timeW / 2;
    this.plate(ctx, timeX, 26, timeW, 78);
    ctx.textAlign = 'center';
    ctx.font = `600 20px ${SANS}`;
    ctx.fillStyle = 'rgba(206,230,224,0.85)';
    spacing(ctx, 'TIME', VIEW_W / 2, 44, 3);
    const late = game.elapsed > 240;
    ctx.font = `700 34px ${SANS}`;
    ctx.fillStyle = late ? '#ffc46b' : '#fbf7e8';
    ctx.shadowColor = late ? 'rgba(255,180,90,0.5)' : 'rgba(255,214,140,0.35)';
    ctx.shadowBlur = 10;
    ctx.fillText(formatTime(game.elapsed), VIEW_W / 2, 78);
    ctx.shadowBlur = 0;

    // Top-right: the sunseed count and one pip per moonflower seed.
    const seedW = 280;
    const seedX = VIEW_W - 30 - seedW;
    this.plate(ctx, seedX, 26, seedW, 78);
    const got = player.seeds;
    const need = garden.seeds;
    ctx.textAlign = 'left';
    ctx.font = `600 20px ${SANS}`;
    ctx.fillStyle = 'rgba(255,226,168,0.9)';
    spacing(ctx, 'SUNSEEDS', seedX + 20, 46, 2.2, 'left');
    ctx.textAlign = 'right';
    ctx.font = `700 34px ${SANS}`;
    ctx.fillStyle = got >= need ? '#ffe9ad' : '#fbf7e8';
    ctx.fillText(`${got} / ${need}`, seedX + seedW - 20, 46);
    const pipGap = 24;
    const pipCenter = seedX + seedW / 2;
    const pipStart = pipCenter - ((need - 1) * pipGap) / 2;
    for (let i = 0; i < need; i++) {
      this.seedIcon(ctx, pipStart + i * pipGap, 78, i < got, garden.accent);
    }

    // Bottom-left: oil bar, hearts and the pulse key in one plate.
    const oilCardY = VIEW_H - 26 - 74;
    this.plate(ctx, 24, oilCardY, 288, 74);
    const low = player.oil < 24;
    ctx.textAlign = 'left';
    ctx.font = `600 20px ${SANS}`;
    ctx.fillStyle = low ? `rgba(255,150,120,${0.7 + Math.sin(game.time * 8) * 0.25})` : 'rgba(255,220,150,0.94)';
    spacing(ctx, low ? 'OIL LOW' : 'LANTERN OIL', 44, oilCardY + 20, 0.8, 'left');
    for (let i = 0; i < player.maxHearts; i++) {
      this.heartIcon(ctx, 224 + i * 22, oilCardY + 20, i < player.hearts, 0.88);
    }

    const barX = 44;
    const barY = oilCardY + 38;
    const barW = 248;
    const barH = 18;
    ctx.fillStyle = 'rgba(18,12,7,0.72)';
    this.roundRect(ctx, barX, barY, barW, barH, 9);
    ctx.fill();
    const fill = clamp(player.oil / player.maxOil, 0, 1);
    ctx.save();
    this.roundRect(ctx, barX + 2, barY + 2, barW - 4, barH - 4, 7);
    ctx.clip();
    const oilGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    oilGrad.addColorStop(0, low ? '#ff7d5c' : '#ffb04e');
    oilGrad.addColorStop(0.7, low ? '#ff5c5c' : '#ffd77e');
    oilGrad.addColorStop(1, low ? '#ffb08a' : '#fff0c0');
    ctx.fillStyle = oilGrad;
    ctx.fillRect(barX + 2, barY + 2, (barW - 4) * fill, barH - 4);
    ctx.restore();
    ctx.strokeStyle = 'rgba(20,12,4,0.95)';
    ctx.lineWidth = 1.5;
    this.roundRect(ctx, barX, barY, barW, barH, 9);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = `700 20px ${SANS}`;
    ctx.fillStyle = '#20140a';
    ctx.fillText(`${Math.round(player.oil)}%`, barX + barW / 2, barY + barH / 2 + 0.5);

    // Lower centre: the cover carries the win/lose rules in words.
    const rulesX = 320;
    const rulesY = 552;
    const rulesW = 650;
    const rulesH = 142;
    ctx.fillStyle = 'rgba(3,9,14,0.86)';
    this.roundRect(ctx, rulesX, rulesY, rulesW, rulesH, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,226,168,0.38)';
    ctx.lineWidth = 1;
    this.roundRect(ctx, rulesX, rulesY, rulesW, rulesH, 18);
    ctx.stroke();

    const winText = 'WIN:  WAKE 3 MOONFLOWERS';
    const loseText = 'LOSE:  LANTERN OUT = RUN OVER';
    let ruleSize = 28;
    while (ruleSize > 24) {
      ctx.font = `700 ${ruleSize}px ${SANS}`;
      if (
        trackedWidth(ctx, winText, 1.6) <= 606 &&
        trackedWidth(ctx, loseText, 1.6) <= 606
      ) break;
      ruleSize--;
    }
    ctx.textAlign = 'center';
    ctx.font = `700 ${ruleSize}px ${SANS}`;
    ctx.fillStyle = '#ffe9ad';
    spacing(ctx, winText, 645, 582, 1.6);
    ctx.fillStyle = '#ffb49e';
    spacing(ctx, loseText, 645, 618, 1.6);

    const controlsText = 'ARROWS FLY    SPACE PULSE';
    let controlSize = 23;
    while (controlSize > 21) {
      ctx.font = `600 ${controlSize}px ${SANS}`;
      if (trackedWidth(ctx, controlsText, 1.8) <= 606) break;
      controlSize--;
    }
    ctx.font = `600 ${controlSize}px ${SANS}`;
    ctx.fillStyle = 'rgba(255,236,200,0.94)';
    spacing(ctx, controlsText, 645, 654, 1.8);

    ctx.restore();
  }

  keycap(ctx, x, y, w, label, h = 19, size = 9) {
    ctx.fillStyle = 'rgba(255,236,190,0.12)';
    this.roundRect(ctx, x, y, w, h, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,220,150,0.4)';
    ctx.lineWidth = 1;
    this.roundRect(ctx, x, y, w, h, 6);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = `600 ${size}px ${SANS}`;
    ctx.fillStyle = 'rgba(255,240,205,0.92)';
    ctx.fillText(label, x + w / 2, y + h / 2 + 0.5);
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
    this.veil(ctx, 0.5);
    const cx = VIEW_W / 2;
    const t = game.time;

    // The results card: near opaque, 2 px edge, soft outer shadow.
    const cardX = 300;
    const cardY = 96;
    const cardW = 680;
    const cardH = 536;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.65)';
    ctx.shadowBlur = 46;
    ctx.shadowOffsetY = 18;
    ctx.fillStyle = 'rgba(4,12,18,0.94)';
    this.roundRect(ctx, cardX, cardY, cardW, cardH, 22);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = 'rgba(255,220,150,0.55)';
    ctx.lineWidth = 2;
    this.roundRect(ctx, cardX, cardY, cardW, cardH, 22);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // A little warm bokeh behind the header.
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU + t * 0.1;
      const r = 118 + Math.sin(t * 0.9 + i) * 10;
      const x = cx + Math.cos(a) * r * 1.55;
      const y = 196 + Math.sin(a) * r * 0.52;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, 16);
      glow.addColorStop(0, 'rgba(255,236,168,0.4)');
      glow.addColorStop(1, 'rgba(255,210,120,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, 16, 0, TAU);
      ctx.fill();
    }

    ctx.font = `700 32px ${SANS}`;
    ctx.fillStyle = '#fff8e2';
    ctx.shadowColor = 'rgba(255,208,120,0.55)';
    ctx.shadowBlur = 24;
    spacing(ctx, 'RUN COMPLETE', cx, 146, 5);
    ctx.shadowBlur = 0;

    ctx.font = `700 84px ${SERIF}`;
    const gold = ctx.createLinearGradient(0, 174, 0, 254);
    gold.addColorStop(0, '#fffbe8');
    gold.addColorStop(1, '#f2c274');
    ctx.fillStyle = gold;
    ctx.shadowColor = 'rgba(255,208,120,0.6)';
    ctx.shadowBlur = 32;
    spacing(ctx, 'DAWN BREAKS', cx, 214, 2);
    ctx.shadowBlur = 0;

    ctx.font = `italic 400 22px ${SERIF}`;
    ctx.fillStyle = 'rgba(230,242,236,0.72)';
    ctx.fillText('The lantern moth carried the morning through the dark.', cx, 278);

    // Stats card with the score as the one hero number.
    const statX = 360;
    const statY = 300;
    const statW = 560;
    const statH = 196;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = 'rgba(2,7,12,0.91)';
    this.roundRect(ctx, statX, statY, statW, statH, 16);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = 'rgba(255,220,150,0.34)';
    ctx.lineWidth = 2;
    this.roundRect(ctx, statX, statY, statW, statH, 16);
    ctx.stroke();
    ctx.restore();

    ctx.font = `600 20px ${SANS}`;
    ctx.fillStyle = 'rgba(180,214,208,0.8)';
    spacing(ctx, 'SCORE', cx, statY + 28, 3);
    ctx.font = `700 72px ${SANS}`;
    ctx.fillStyle = '#fff8e2';
    ctx.shadowColor = 'rgba(255,208,120,0.45)';
    ctx.shadowBlur = 18;
    ctx.fillText(game.player.score.toLocaleString('en-US'), cx, statY + 86);
    ctx.shadowBlur = 0;

    const timeBestX = [cx - 118, cx + 118];
    const bestText = game.best > game.player.score ? game.best.toLocaleString('en-US') : 'NEW';
    ctx.font = `600 20px ${SANS}`;
    ctx.fillStyle = 'rgba(180,214,208,0.78)';
    spacing(ctx, 'TIME', timeBestX[0], statY + 140, 2.4);
    spacing(ctx, 'BEST', timeBestX[1], statY + 140, 2.4);
    ctx.font = `700 30px ${SANS}`;
    ctx.fillStyle = '#f6f2e4';
    ctx.fillText(formatTime(game.elapsed), timeBestX[0], statY + 172);
    ctx.fillText(bestText, timeBestX[1], statY + 172);

    // Restart pill with a key glyph, the only prompt on the screen.
    const pillW = 620;
    const pillH = 96;
    const pillX = cx - pillW / 2;
    const pillY = 520;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
    ctx.save();
    ctx.shadowColor = `rgba(255,205,110,${0.22 + pulse * 0.14})`;
    ctx.shadowBlur = 30;
    const pillFill = ctx.createLinearGradient(pillX, 0, pillX + pillW, 0);
    pillFill.addColorStop(0, 'rgba(255,205,110,0.24)');
    pillFill.addColorStop(1, 'rgba(255,205,110,0.12)');
    ctx.fillStyle = pillFill;
    this.roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,222,150,0.8)';
    ctx.lineWidth = 1.5;
    this.roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
    ctx.stroke();
    ctx.restore();

    ctx.font = `600 44px ${SANS}`;
    const label = 'FLY AGAIN';
    const labelW = ctx.measureText(label).width;
    const keyW = 44;
    const gap = 16;
    const startX = cx - (keyW + gap + labelW) / 2;
    ctx.fillStyle = 'rgba(255,222,150,0.12)';
    this.roundRect(ctx, startX, pillY + (pillH - keyW) / 2, keyW, keyW, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,222,150,0.8)';
    ctx.lineWidth = 1.2;
    this.roundRect(ctx, startX, pillY + (pillH - keyW) / 2, keyW, keyW, 8);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = `700 26px ${SANS}`;
    ctx.fillStyle = '#fff4d8';
    ctx.fillText('R', startX + keyW / 2, pillY + pillH / 2 + 1);
    ctx.textAlign = 'left';
    ctx.font = `600 44px ${SANS}`;
    ctx.fillStyle = '#fff8ec';
    ctx.fillText(label, startX + keyW + gap, pillY + pillH / 2 + 1);

    ctx.restore();
  }

  drawGameOver(ctx, game) {
    this.veil(ctx, 0.66);
    this.card(ctx, 320, 140, 640, 430);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 30px ${SANS}`;
    ctx.fillStyle = 'rgba(255,140,110,0.85)';
    spacing(ctx, 'THE LANTERN WENT DARK', VIEW_W / 2, 186, 3.6);
    ctx.font = `700 80px ${SERIF}`;
    ctx.fillStyle = '#fdf1e4';
    // Georgia Bold at 80 px is slightly wider than the 640 px card, so trim the
    // width without changing the size of the letterforms.
    ctx.save();
    ctx.translate(VIEW_W / 2, 250);
    ctx.scale(0.95, 1);
    ctx.fillText('THE LIGHT DIES', 0, 0);
    ctx.restore();
    ctx.font = `italic 400 22px ${SERIF}`;
    ctx.fillStyle = 'rgba(224,234,230,0.74)';
    ctx.fillText(game.reason, VIEW_W / 2, 300);

    this.statRow(ctx, VIEW_W / 2, 360, [
      ['GARDEN', `${game.world.index + 1} / 3`],
      ['SCORE', game.player.score.toLocaleString('en-US')],
      ['BEST', Math.max(game.best, game.player.score).toLocaleString('en-US')],
    ], 16, 32);

    const pulse = 0.55 + 0.45 * Math.sin(game.time * 2.6);
    ctx.font = `600 40px ${SANS}`;
    ctx.fillStyle = `rgba(255,244,214,${0.5 + pulse * 0.5})`;
    spacing(ctx, 'PRESS R TO RELIGHT', VIEW_W / 2, 470, 3.6);
    ctx.restore();
  }

  // --------------------------------------------------------------- pieces ---
  plate(ctx, x, y, w, h, r = 12) {
    ctx.fillStyle = 'rgba(4,12,18,0.55)';
    this.roundRect(ctx, x, y, w, h, r);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,230,208,0.13)';
    ctx.lineWidth = 1;
    this.roundRect(ctx, x, y, w, h, r);
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

  statRow(ctx, cx, y, items, labelSize = 10, valueSize = 24) {
    const gap = 190;
    ctx.textAlign = 'center';
    items.forEach(([label, value], i) => {
      const x = cx + (i - (items.length - 1) / 2) * gap;
      ctx.font = `600 ${labelSize}px ${SANS}`;
      ctx.fillStyle = 'rgba(170,200,196,0.62)';
      spacing(ctx, label, x, y - 10, 2.6);
      ctx.font = `700 ${valueSize}px ${SANS}`;
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

  heartIcon(ctx, x, y, filled, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
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

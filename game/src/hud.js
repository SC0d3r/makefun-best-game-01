// The in-flight HUD only. Every full-screen card (title, select, pause, clear,
// victory, game over) lives in screens.js and is dispatched from Hud.draw.
import { clamp, formatTime } from './utils.js';
import { VIEW_W, VIEW_H } from './world.js';
import {
  SANS,
  drawTitle,
  drawGardenSelect,
  drawVictory,
  drawPause,
  drawClear,
  drawGameOver,
  plate,
  spacing,
  trackedWidth,
  seedIcon,
  heartIcon,
  roundRect,
} from './screens.js';
import { GARDENS } from './gardens.js';

export class Hud {
  constructor() {
    this.hintFade = 0;
  }

  draw(ctx, game) {
    const { state } = game;
    if (state === 'title') {
      drawTitle(ctx, game);
      return;
    }
    if (state === 'select') {
      drawGardenSelect(ctx, game);
      return;
    }
    if (state === 'victory') {
      drawVictory(ctx, game);
      return;
    }
    this.drawFlightHud(ctx, game);
    if (state === 'paused') drawPause(ctx, game);
    if (state === 'clear') drawClear(ctx, game);
    if (state === 'gameover') drawGameOver(ctx, game);
  }

  // ------------------------------------------------------------------ hud ---
  drawFlightHud(ctx, game) {
    const { player, world } = game;
    const garden = world.garden;
    ctx.save();
    ctx.textBaseline = 'middle';

    // Top-left: the score, as one big bright number.
    plate(ctx, 30, 26, 280, 78);
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
    plate(ctx, timeX, 26, timeW, 78);
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

    // Top-right: sunseeds gathered, the garden number, and one pip per seed.
    const seedW = 280;
    const seedX = VIEW_W - 30 - seedW;
    plate(ctx, seedX, 26, seedW, 78);
    const got = player.seeds;
    const need = garden.seeds;
    ctx.textAlign = 'left';
    ctx.font = `600 24px ${SANS}`;
    ctx.fillStyle = 'rgba(255,226,168,0.9)';
    spacing(ctx, `SEEDS ${got}`, seedX + 20, 44, 1.8, 'left');
    ctx.font = `600 13px ${SANS}`;
    ctx.fillStyle = 'rgba(206,230,224,0.72)';
    spacing(ctx, `GARDEN ${world.index + 1}/${GARDENS.length}`, seedX + 20, 64, 1.6, 'left');
    const pipGap = 24;
    const pipCenter = seedX + seedW / 2;
    const pipStart = pipCenter - ((need - 1) * pipGap) / 2;
    for (let i = 0; i < need; i++) {
      seedIcon(ctx, pipStart + i * pipGap, 88, i < got, garden.accent);
    }

    // Bottom-left: oil bar, hearts and the pulse key in one plate.
    const oilCardY = VIEW_H - 26 - 74;
    plate(ctx, 24, oilCardY, 288, 74);
    const low = player.oil < 24;
    ctx.textAlign = 'left';
    ctx.font = `600 20px ${SANS}`;
    ctx.fillStyle = low ? `rgba(255,150,120,${0.7 + Math.sin(game.time * 8) * 0.25})` : 'rgba(255,220,150,0.94)';
    spacing(ctx, low ? 'OIL LOW' : 'LANTERN OIL', 44, oilCardY + 20, 0.8, 'left');
    for (let i = 0; i < player.maxHearts; i++) {
      heartIcon(ctx, 224 + i * 22, oilCardY + 20, i < player.hearts, 0.88);
    }

    const barX = 44;
    const barY = oilCardY + 38;
    const barW = 248;
    const barH = 18;
    ctx.fillStyle = 'rgba(18,12,7,0.72)';
    roundRect(ctx, barX, barY, barW, barH, 9);
    ctx.fill();
    const fill = clamp(player.oil / player.maxOil, 0, 1);
    ctx.save();
    roundRect(ctx, barX + 2, barY + 2, barW - 4, barH - 4, 7);
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
    roundRect(ctx, barX, barY, barW, barH, 9);
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
    roundRect(ctx, rulesX, rulesY, rulesW, rulesH, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,226,168,0.38)';
    ctx.lineWidth = 1;
    roundRect(ctx, rulesX, rulesY, rulesW, rulesH, 18);
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
}

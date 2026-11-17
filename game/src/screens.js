// Every full-screen card and menu: the title, the garden-select map, the pause
// card and the three end screens (garden cleared, all gardens awake, lantern
// out). These are plain functions so the Hud class only owns the flight HUD.
import { TAU, formatTime } from './gardens.js';
import { VIEW_W, VIEW_H } from './world.js';
import { GARDENS } from './gardens.js';
import { isGardenUnlocked } from './save.js';

// --------------------------------------------------------- garden select ---

export function drawGardenSelect(ctx, game) {
  const t = game.time;
  const save = game.save || {};
  const bests = Array.isArray(save.bests) ? save.bests : [];
  const selected = Number.isInteger(game.selectedGarden) ? game.selectedGarden : 0;

  // The same dark, warm-edged backdrop as the title, with no extra decoration.
  const veilGrad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  veilGrad.addColorStop(0, 'rgba(2,6,14,0.72)');
  veilGrad.addColorStop(0.45, 'rgba(2,8,16,0.6)');
  veilGrad.addColorStop(1, 'rgba(1,4,9,0.9)');
  ctx.fillStyle = veilGrad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  const beam = ctx.createRadialGradient(150, 90, 10, 150, 90, 560);
  beam.addColorStop(0, `rgba(255,214,133,${0.08 + Math.sin(t * 0.7) * 0.02})`);
  beam.addColorStop(1, 'rgba(255,180,80,0)');
  ctx.fillStyle = beam;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.save();
  ctx.textBaseline = 'middle';

  // Header block: the ladder title, then identity and the headline best.
  ctx.textAlign = 'left';
  ctx.font = `700 64px ${SERIF}`;
  const titleFill = ctx.createLinearGradient(0, 64, 0, 128);
  titleFill.addColorStop(0, '#fff8e2');
  titleFill.addColorStop(1, '#f3b967');
  ctx.fillStyle = titleFill;
  ctx.shadowColor = 'rgba(255,208,120,0.4)';
  ctx.shadowBlur = 18;
  spacing(ctx, 'CHOOSE A GARDEN', 64, 96, 4, 'left');
  ctx.shadowBlur = 0;

  const cleared = Number.isFinite(save.clears) ? save.clears : 0;
  const best = Number.isFinite(save.best) ? save.best : 0;
  ctx.font = `600 44px ${SANS}`;
  ctx.fillStyle = 'rgba(200,240,232,0.72)';
  spacing(
    ctx,
    `LUMENWING  GARDENS AWAKE ${cleared}/${GARDENS.length}`,
    64,
    156,
    1.4,
    'left',
  );
  ctx.textAlign = 'right';
  ctx.font = `600 30px ${SANS}`;
  ctx.fillStyle = 'rgba(198,226,220,0.62)';
  ctx.fillText(`BEST ${best.toLocaleString('en-US')}`, 1216, 156);

  for (let index = 0; index < GARDENS.length; index++) {
    const garden = GARDENS[index];
    const rect = gardenCardRect(index);
    const unlocked = isGardenUnlocked(save, index);
    const isSelected = unlocked && index === selected;
    const cx = rect.x + rect.w / 2;

    ctx.save();
    if (!unlocked) ctx.globalAlpha = 0.45;

    // Card body, then a restrained wash of the garden's own palette.
    ctx.fillStyle = 'rgba(4,12,18,0.8)';
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 16);
    ctx.fill();

    ctx.save();
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 16);
    ctx.clip();
    ctx.globalAlpha *= 0.3;
    const wash = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
    wash.addColorStop(0, garden.bgBottom);
    wash.addColorStop(0.7, garden.bgTop);
    wash.addColorStop(1, 'rgba(4,12,18,0)');
    ctx.fillStyle = wash;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.restore();

    // Bright thin edge when open, a thicker warm-gold glow when selected.
    ctx.lineWidth = isSelected ? 4 : 1.5;
    ctx.strokeStyle = isSelected
      ? '#ffd685'
      : unlocked
        ? 'rgba(255,226,150,0.5)'
        : 'rgba(170,195,205,0.32)';
    if (isSelected) {
      ctx.shadowColor = 'rgba(255,208,120,0.7)';
      ctx.shadowBlur = 24;
    }
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 16);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // The locked card's large lock sits behind the name and note, not over them.
    if (!unlocked) lockGlyph(ctx, cx, rect.y + 150, 2);

    // Name, shrinking only if it would run past the card's inner width.
    let nameSize = 60;
    ctx.font = `700 ${nameSize}px ${SERIF}`;
    while (nameSize > 44 && ctx.measureText(garden.name).width > rect.w - 64) {
      nameSize -= 2;
      ctx.font = `700 ${nameSize}px ${SERIF}`;
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = unlocked ? '#fdf6e4' : 'rgba(226,234,244,0.92)';
    if (unlocked) {
      ctx.shadowColor = 'rgba(255,208,120,0.35)';
      ctx.shadowBlur = 14;
    }
    ctx.fillText(garden.name, cx, rect.y + 78, rect.w - 64);
    ctx.shadowBlur = 0;
    ctx.font = `400 26px ${SERIF}`;
    ctx.fillStyle = 'rgba(224,238,232,0.6)';
    ctx.fillText(garden.subtitle, cx, rect.y + 126, rect.w - 56);

    if (unlocked) {
      // One pip per sunseed the garden asks for.
      const need = garden.seeds;
      const pipGap = 26;
      const pipStart = cx - ((need - 1) * pipGap) / 2;
      for (let pip = 0; pip < need; pip++) {
        seedIcon(ctx, pipStart + pip * pipGap, rect.y + 170, false, garden.accent);
      }

      // One status line: cleared cards carry their best, open cards say OPEN.
      const cardBest = Number.isFinite(bests[index]) ? bests[index] : 0;
      const status =
        save.cleared && save.cleared[index]
          ? cardBest > 0
            ? `CLEARED   BEST ${cardBest.toLocaleString('en-US')}`
            : 'CLEARED'
          : cardBest > 0
            ? `OPEN   BEST ${cardBest.toLocaleString('en-US')}`
            : 'OPEN';
      ctx.textAlign = 'left';
      ctx.font = `600 30px ${SANS}`;
      ctx.fillStyle = 'rgba(206,230,224,0.82)';
      ctx.fillText(status, rect.x + 28, rect.y + 210, rect.w - 56);
    } else {
      ctx.textAlign = 'center';
      ctx.font = `600 30px ${SANS}`;
      ctx.fillStyle = 'rgba(240,224,200,0.86)';
      const earlier = index > 0 ? GARDENS[index - 1].name : 'the first garden';
      const note = garden.lockNote || `Wake ${earlier}`;
      ctx.fillText(`LOCKED   ${note}`, cx, rect.y + 210, rect.w - 56);
    }

    ctx.restore();
  }

  ctx.font = `600 24px ${SANS}`;
  ctx.fillStyle = 'rgba(255,236,200,0.9)';
  ctx.textAlign = 'left';

  // With a draft open the panel owns the screen; the map-only control line
  // stays out from under it.
  if (game.draft) {
    ctx.restore();
    drawDraft(ctx, game);
    return;
  }

  spacing(ctx, 'ARROWS CHOOSE     ENTER FLY', 64, 706, 2.6, 'left');

  ctx.restore();
}

export function drawVictory(ctx, game) {
  veil(ctx, 0.5);
  const cx = VIEW_W / 2;
  const t = game.time;

  // The results card: near opaque, 2 px edge, soft outer shadow.
  const cardX = 260;
  const cardY = 60;
  const cardW = 760;
  const cardH = 600;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.65)';
  ctx.shadowBlur = 46;
  ctx.shadowOffsetY = 18;
  ctx.fillStyle = 'rgba(4,12,18,0.94)';
  roundRect(ctx, cardX, cardY, cardW, cardH, 24);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = 'rgba(255,220,150,0.55)';
  ctx.lineWidth = 2;
  roundRect(ctx, cardX, cardY, cardW, cardH, 24);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // A little warm bokeh behind the heading.
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU + t * 0.1;
    const r = 118 + Math.sin(t * 0.9 + i) * 10;
    const x = cx + Math.cos(a) * r * 1.55;
    const y = 156 + Math.sin(a) * r * 0.52;
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
  spacing(ctx, 'RUN COMPLETE', cx, 96, 5);
  ctx.shadowBlur = 0;

  ctx.font = `700 84px ${SERIF}`;
  const gold = ctx.createLinearGradient(0, 114, 0, 198);
  gold.addColorStop(0, '#fffbe8');
  gold.addColorStop(1, '#f2c274');
  ctx.fillStyle = gold;
  ctx.shadowColor = 'rgba(255,208,120,0.6)';
  ctx.shadowBlur = 32;
  spacing(ctx, 'DAWN BREAKS', cx, 156, 2);
  ctx.shadowBlur = 0;

  // Top-right fine print: motes are the run's quiet collectible.
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 28px ${SANS}`;
  ctx.fillStyle = 'rgba(190,218,212,0.6)';
  ctx.fillText(`MOTES ${(game.stats && game.stats.motes) || 0}`, 968, 100);

  // Warm rules: full width above and below, a short one under the score.
  ctx.strokeStyle = 'rgba(255,220,150,0.32)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(300, 212);
  ctx.lineTo(980, 212);
  ctx.moveTo(300, 548);
  ctx.lineTo(980, 548);
  ctx.moveTo(600, 346);
  ctx.lineTo(960, 346);
  ctx.stroke();

  // Grade medallion in the left column.
  const medalX = 396;
  const medalY = 326;
  const medalR = 86;
  ctx.textAlign = 'center';
  ctx.font = `600 24px ${SANS}`;
  ctx.fillStyle = 'rgba(178,210,204,0.62)';
  spacing(ctx, 'GRADE', medalX, 232, 4);

  ctx.fillStyle = 'rgba(10,22,28,0.9)';
  ctx.beginPath();
  ctx.arc(medalX, medalY, medalR, 0, TAU);
  ctx.fill();
  const inner = ctx.createRadialGradient(medalX, medalY, medalR * 0.42, medalX, medalY, medalR);
  inner.addColorStop(0, 'rgba(255,214,133,0)');
  inner.addColorStop(0.72, 'rgba(255,214,133,0.08)');
  inner.addColorStop(1, 'rgba(255,214,133,0.3)');
  ctx.fillStyle = inner;
  ctx.beginPath();
  ctx.arc(medalX, medalY, medalR, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,214,133,0.92)';
  ctx.lineWidth = 3;
  ctx.shadowColor = 'rgba(255,208,120,0.5)';
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.arc(medalX, medalY, medalR, 0, TAU);
  ctx.stroke();
  ctx.shadowBlur = 0;

  const score = Number.isFinite(game.player && game.player.score) ? game.player.score : 0;
  const grade =
    score >= 14000 ? 'S' : score >= 10500 ? 'A' : score >= 7500 ? 'B' : score >= 5000 ? 'C' : 'D';
  const gradeFill = ctx.createLinearGradient(0, medalY - 64, 0, medalY + 64);
  gradeFill.addColorStop(0, '#fffbe8');
  gradeFill.addColorStop(0.55, '#ffe3a8');
  gradeFill.addColorStop(1, '#f2b45c');
  ctx.textBaseline = 'middle';
  ctx.font = `700 128px ${SERIF}`;
  ctx.fillStyle = gradeFill;
  ctx.fillText(grade, medalX, medalY + 2);

  // Best run, directly under the medallion.
  if (game.newBest) {
    ctx.font = `700 46px ${SANS}`;
    ctx.fillStyle = '#ffd685';
    ctx.shadowColor = 'rgba(255,208,120,0.55)';
    ctx.shadowBlur = 18;
    ctx.fillText('NEW BEST', medalX, 456);
    ctx.shadowBlur = 0;
  } else {
    const best = Number.isFinite(game.best) ? game.best : 0;
    ctx.font = `600 34px ${SANS}`;
    ctx.fillStyle = 'rgba(190,218,212,0.68)';
    ctx.fillText(`BEST ${best.toLocaleString('en-US')}`, medalX, 456);
  }

  // Score block in the right column.
  const colX = 780;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 24px ${SANS}`;
  ctx.fillStyle = 'rgba(178,210,204,0.62)';
  spacing(ctx, 'SCORE', colX, 248, 4);
  ctx.textBaseline = 'middle';
  ctx.font = `700 72px ${SANS}`;
  ctx.fillStyle = '#fff8e2';
  ctx.shadowColor = 'rgba(255,208,120,0.45)';
  ctx.shadowBlur = 20;
  ctx.fillText(score.toLocaleString('en-US'), colX, 314);
  ctx.shadowBlur = 0;

  // Three tall stat rows under the score.
  const stats = game.stats || {};
  const statRows = [
    ['SUNSEEDS', `${stats.seeds || 0}`, 402],
    ['GARDENS', `${stats.gardens || 0}/${GARDENS.length}`, 458],
    ['TIME', formatTime(game.elapsed), 514],
  ];
  ctx.textBaseline = 'alphabetic';
  for (const [label, value, baseline] of statRows) {
    ctx.textAlign = 'left';
    ctx.font = `600 26px ${SANS}`;
    ctx.fillStyle = 'rgba(178,210,204,0.66)';
    ctx.fillText(label, 600, baseline);
    ctx.textAlign = 'right';
    ctx.font = `700 64px ${SANS}`;
    ctx.fillStyle = '#f6f2e4';
    ctx.fillText(value, 960, baseline);
  }

  // Restart pill with a key glyph, the only prompt on the screen.
  const pillW = 640;
  const pillH = 80;
  const pillX = 320;
  const pillY = 570;
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
  ctx.save();
  ctx.shadowColor = `rgba(255,205,110,${0.22 + pulse * 0.14})`;
  ctx.shadowBlur = 30;
  const pillFill = ctx.createLinearGradient(pillX, 0, pillX + pillW, 0);
  pillFill.addColorStop(0, 'rgba(255,205,110,0.24)');
  pillFill.addColorStop(1, 'rgba(255,205,110,0.12)');
  ctx.fillStyle = pillFill;
  roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,222,150,0.8)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  ctx.stroke();
  ctx.restore();

  ctx.textBaseline = 'middle';
  ctx.font = `700 72px ${SANS}`;
  const label = 'FLY AGAIN';
  const labelW = ctx.measureText(label).width;
  const keyW = 64;
  const gap = 18;
  const startX = cx - (keyW + gap + labelW) / 2;
  ctx.fillStyle = 'rgba(255,222,150,0.12)';
  roundRect(ctx, startX, pillY + (pillH - keyW) / 2, keyW, keyW, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,222,150,0.8)';
  ctx.lineWidth = 1.2;
  roundRect(ctx, startX, pillY + (pillH - keyW) / 2, keyW, keyW, 10);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.font = `700 36px ${SANS}`;
  ctx.fillStyle = '#fff4d8';
  ctx.fillText('R', startX + keyW / 2, pillY + pillH / 2 + 1);
  ctx.textAlign = 'left';
  ctx.font = `700 72px ${SANS}`;
  ctx.fillStyle = '#fff8ec';
  ctx.fillText(label, startX + keyW + gap, pillY + pillH / 2 + 2);

  ctx.restore();
}

// ------------------------------------------------------------- the draft ---

/**
 * The three-card upgrade draft, drawn over the still-visible garden map. This
 * is presentation only: buyUpgrade() and skipDraft() in main.js own the state.
 */
export function drawDraft(ctx, game) {
  const draft = game.draft;
  const offers = draft.offers || [];
  const sunseeds = Number.isFinite(game.sunseeds) ? game.sunseeds : 0;

  ctx.fillStyle = 'rgba(1,4,9,0.82)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.font = `600 26px ${SANS}`;
  ctx.fillStyle = 'rgba(180,214,208,0.7)';
  spacing(ctx, 'GARDEN CLEARED', VIEW_W / 2, 78, 5.2);

  const headline = ctx.createLinearGradient(0, 104, 0, 168);
  headline.addColorStop(0, '#fff8e2');
  headline.addColorStop(0.55, '#ffe3a8');
  headline.addColorStop(1, '#f3b967');
  ctx.font = `700 64px ${SERIF}`;
  ctx.fillStyle = headline;
  ctx.shadowColor = 'rgba(255,208,120,0.5)';
  ctx.shadowBlur = 26;
  spacing(ctx, 'CHOOSE ONE', VIEW_W / 2, 136, 3);
  ctx.shadowBlur = 0;

  const cardW = 380;
  const cardH = 300;
  const cardY = 200;
  const cardX = [55, 450, 845];

  for (let i = 0; i < offers.length && i < cardX.length; i++) {
    const offer = offers[i];
    const cardLeft = cardX[i];
    const selected = i === draft.index;
    const affordable = sunseeds >= offer.cost;
    const cx = cardLeft + cardW / 2;

    ctx.save();
    if (!affordable) ctx.globalAlpha = 0.45;

    ctx.fillStyle = 'rgba(5,14,20,0.92)';
    roundRect(ctx, cardLeft, cardY, cardW, cardH, 18);
    ctx.fill();

    ctx.lineWidth = selected ? 4 : 1.5;
    ctx.strokeStyle = selected ? '#ffd685' : 'rgba(255,226,150,0.35)';
    if (selected) {
      ctx.shadowColor = 'rgba(255,208,120,0.7)';
      ctx.shadowBlur = 24;
    }
    roundRect(ctx, cardLeft, cardY, cardW, cardH, 18);
    ctx.stroke();
    ctx.shadowBlur = 0;

    let nameSize = 60;
    ctx.font = `700 ${nameSize}px ${SERIF}`;
    while (nameSize > 44 && ctx.measureText(offer.name).width > cardW - 32) {
      nameSize -= 2;
      ctx.font = `700 ${nameSize}px ${SERIF}`;
    }
    ctx.fillStyle = '#fdf6e4';
    ctx.fillText(offer.name, cx, cardY + 78);

    ctx.font = `500 22px ${SANS}`;
    ctx.fillStyle = 'rgba(216,236,230,0.84)';
    ctx.fillText(offer.effect, cx, cardY + 150, cardW - 32);

    seedIcon(ctx, cx, cardY + 206, true, '#ffd685');

    ctx.font = `700 64px ${SANS}`;
    if (affordable) {
      ctx.fillStyle = '#ffe9ad';
      ctx.fillText(`COST ${offer.cost}`, cx, cardY + 246);
    } else {
      ctx.fillStyle = '#ff9b86';
      ctx.fillText(`NEED ${offer.cost}`, cx, cardY + 246);
    }

    ctx.restore();
  }

  ctx.font = `700 64px ${SERIF}`;
  ctx.fillStyle = game.draftFlash > 0 ? '#ff9b86' : '#fff1cf';
  if (game.draftFlash > 0) {
    ctx.shadowBlur = 0;
  } else {
    ctx.shadowColor = 'rgba(255,208,120,0.4)';
    ctx.shadowBlur = 16;
  }
  ctx.fillText(`SUNSEEDS ${sunseeds}`, VIEW_W / 2, 588);
  ctx.shadowBlur = 0;

  ctx.font = `600 22px ${SANS}`;
  ctx.fillStyle = 'rgba(255,236,200,0.86)';
  spacing(ctx, 'LEFT RIGHT CHOOSE    ENTER BUY    ESC SKIP', VIEW_W / 2, 650, 2.2);

  ctx.restore();
}

// ---------------------------------------------------------------- title ---
export function drawTitle(ctx, game) {
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
  spacing(ctx, 'A LANTERN MOTH IN FOUR SLEEPING GARDENS', VIEW_W / 2, 150, 5.4);

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

  // Two literal objectives, read as the rules of the run rather than flavour.
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 58px ${SANS}`;
  ctx.fillStyle = '#ffdf9c';
  ctx.shadowColor = 'rgba(255,208,120,0.45)';
  ctx.shadowBlur = 18;
  spacing(ctx, 'GOAL: WAKE FOUR GARDENS', VIEW_W / 2, 336, 1.6);
  ctx.shadowBlur = 0;
  ctx.font = `600 58px ${SANS}`;
  ctx.fillStyle = '#ff9b86';
  spacing(ctx, 'LOSE: LIGHT RUNS OUT', VIEW_W / 2, 404, 1.6);

  ctx.font = `400 34px ${SERIF}`;
  ctx.fillStyle = 'rgba(255,242,214,0.9)';
  spacing(ctx, 'EIGHT UPGRADES   PROGRESS SAVES EVERY CLEAR', VIEW_W / 2, 466, 1.2);

  // Controls: one quiet line on a wide plate.
  ctx.textBaseline = 'middle';
  const controlsText = 'ARROWS FLY     SPACE PULSE     P PAUSE / M MUTE';
  ctx.fillStyle = 'rgba(6,16,24,0.66)';
  roundRect(ctx, 260, 492, 760, 56, 14);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,230,208,0.22)';
  ctx.lineWidth = 1;
  roundRect(ctx, 260, 492, 760, 56, 14);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.font = `600 24px ${SANS}`;
  ctx.fillStyle = 'rgba(255,236,200,0.92)';
  spacing(ctx, controlsText, VIEW_W / 2, 520, 2.2);

  // The game's second noun, level with the control card on the right.
  drawTitleMoonflower(ctx, 1150, 330, t, 36);

  // Start button, pushed down so it separates from the controls card.
  const pulse = 0.5 + 0.5 * Math.sin(t * 1.8);
  const pillW = 560;
  const pillH = 76;
  const pillX = VIEW_W / 2 - pillW / 2;
  const pillY = 566;
  ctx.save();
  ctx.shadowColor = `rgba(255,208,120,${0.2 + pulse * 0.16})`;
  ctx.shadowBlur = 26;
  const pillFill = ctx.createLinearGradient(pillX, 0, pillX + pillW, 0);
  pillFill.addColorStop(0, 'rgba(255,196,96,0.32)');
  pillFill.addColorStop(1, 'rgba(255,196,96,0.02)');
  ctx.fillStyle = pillFill;
  roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,226,150,0.9)';
  ctx.lineWidth = 1;
  roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  ctx.stroke();
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.font = `600 40px ${SANS}`;
  ctx.fillStyle = '#fff9ec';
  const textW = spacing(ctx, 'PRESS ENTER TO WAKE', VIEW_W / 2, pillY + pillH / 2, 3.2);
  ctx.strokeStyle = `rgba(255,214,130,${0.25 + pulse * 0.45})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(VIEW_W / 2 - textW / 2, pillY + pillH - 12);
  ctx.lineTo(VIEW_W / 2 + textW / 2, pillY + pillH - 12);
  ctx.stroke();

  if (game.best > 0) {
    ctx.font = `500 26px ${SANS}`;
    ctx.fillStyle = 'rgba(198,226,220,0.55)';
    spacing(ctx, `BEST FLIGHT  ${game.best.toLocaleString('en-US')}`, VIEW_W / 2, 688, 3);
  }

  ctx.restore();
}

// The moonflower on the cover, in the same visual language as drawExit.
export function drawTitleMoonflower(ctx, x, y, t, r = 36) {
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

export function drawClear(ctx, game) {
  veil(ctx, 0.5);
  card(ctx, 340, 196, 600, 330);
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

  statRow(ctx, VIEW_W / 2, 392, [
    ['SUNSEEDS', `${game.world.garden.seeds}`],
    ['MOTES', `${game.motes}`],
    ['TIME', formatTime(game.elapsed)],
  ]);

  const pulse = 0.55 + 0.45 * Math.sin(game.time * 2.6);
  ctx.font = `600 17px ${SANS}`;
  ctx.fillStyle = `rgba(255,244,214,${0.5 + pulse * 0.5})`;
  spacing(ctx, game.world.index >= GARDENS.length - 1 ? 'PRESS  ENTER  TO  WAKE  THEM  ALL' : 'PRESS  ENTER  TO  FLY  ON', VIEW_W / 2, 484, 3.4);
  ctx.restore();
}

export function drawGameOver(ctx, game) {
  veil(ctx, 0.66);
  card(ctx, 320, 140, 640, 430);
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

  statRow(ctx, VIEW_W / 2, 360, [
    ['GARDEN', `${game.world.index + 1} / ${GARDENS.length}`],
    ['SCORE', game.player.score.toLocaleString('en-US')],
    ['BEST', Math.max(game.best, game.player.score).toLocaleString('en-US')],
  ], 16, 32);

  const pulse = 0.55 + 0.45 * Math.sin(game.time * 2.6);
  ctx.font = `600 40px ${SANS}`;
  ctx.fillStyle = `rgba(255,244,214,${0.5 + pulse * 0.5})`;
  spacing(ctx, 'PRESS R TO RELIGHT', VIEW_W / 2, 470, 3.6);
  ctx.restore();
}

export function drawPause(ctx, game) {
  veil(ctx, 0.62);
  card(ctx, 340, 210, 600, 300);
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

/** Where the four garden cards sit on the select screen. */
export function gardenCardRect(index) {
  return {
    x: CARD_START_X + (index % 2) * (CARD_W + CARD_GAP),
    y: index < 2 ? 196 : 460,
    w: CARD_W,
    h: CARD_H,
  };
}

// One run's small scoreboard. The Game keeps a single instance per run and
// replaces it with a new tally, so these helpers stay pure and allocation-light.

export function newRunStats() {
  return {
    seeds: 0,
    motes: 0,
    pulses: 0,
    bats: 0,
    gardens: 0,
    startedAt: 0,
  };
}

/** Raise one counter by `amount`, returning a new stats object. */
export function tally(stats, key, amount = 1) {
  if (!stats) return stats;
  const current = Number.isFinite(stats[key]) ? stats[key] : 0;
  const delta = Number.isFinite(amount) ? amount : 0;
  return { ...stats, [key]: current + delta };
}

export function spacing(ctx, text, x, y, gap, align = 'center') {
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (chars.length - 1);
  let cursor = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  // Per-character drawing must be centred on each cell, whatever alignment the
  // caller uses for single fillText calls, or left-aligned runs overlap by half
  // a glyph (the hub identity line lost its I this way).
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'center';
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], cursor + widths[i] / 2, y);
    cursor += widths[i] + gap;
  }
  ctx.textAlign = prevAlign;
  return total;
}

export function trackedWidth(ctx, text, gap) {
  const chars = [...text];
  return chars.reduce((sum, c) => sum + ctx.measureText(c).width, 0) + gap * (chars.length - 1);
}

// --------------------------------------------------------------- pieces ---
export function plate(ctx, x, y, w, h, r = 12) {
  ctx.fillStyle = 'rgba(4,12,18,0.55)';
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,230,208,0.13)';
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, r);
  ctx.stroke();
}

export function card(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(5,14,20,0.86)';
  roundRect(ctx, x, y, w, h, 18);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,220,150,0.24)';
  ctx.lineWidth = 1.2;
  roundRect(ctx, x, y, w, h, 18);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(120,230,208,0.10)';
  roundRect(ctx, x + 5, y + 5, w - 10, h - 10, 14);
  ctx.stroke();
}

export function veil(ctx, alpha) {
  ctx.fillStyle = `rgba(2,6,12,${alpha})`;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

export function statRow(ctx, cx, y, items, labelSize = 10, valueSize = 24) {
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

export function keycap(ctx, x, y, w, label, h = 19, size = 9) {
  ctx.fillStyle = 'rgba(255,236,190,0.12)';
  roundRect(ctx, x, y, w, h, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,220,150,0.4)';
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, 6);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.font = `600 ${size}px ${SANS}`;
  ctx.fillStyle = 'rgba(255,240,205,0.92)';
  ctx.fillText(label, x + w / 2, y + h / 2 + 0.5);
}

export function seedIcon(ctx, x, y, filled, color) {
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

export function heartIcon(ctx, x, y, filled, scale = 1) {
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

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export const SERIF = 'Georgia, "Iowan Old Style", "Palatino Linotype", serif';
export const SANS = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';

const CARD_W = 560;
const CARD_H = 232;
const CARD_GAP = 32;
const CARD_START_X = 64;

function lockGlyph(ctx, x, y, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.strokeStyle = 'rgba(255,226,168,0.8)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, -18, 16, Math.PI, 0);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,226,168,0.14)';
  roundRect(ctx, -22, -18, 44, 38, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,226,168,0.85)';
  ctx.lineWidth = 2;
  roundRect(ctx, -22, -18, 44, 38, 8);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,226,168,0.9)';
  ctx.beginPath();
  ctx.arc(0, 2, 4, 0, TAU);
  ctx.fill();
  ctx.restore();
}

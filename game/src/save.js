// The persistent save: one small record per browser, plus the pure helpers
// that fold a finished run into it. Storage is optional; every access is
// guarded so private mode behaves exactly like a first visit.

export const SAVE_KEY = 'lumenwing.save.v1';

export const DEFAULT_SAVE = {
  best: 0,
  runs: 0,
  clears: 0,
  seeds: 0,
  motes: 0,
  bests: [0, 0, 0, 0],
  cleared: [false, false, false, false],
};

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function boolean(value) {
  return value === true;
}

/** A fresh copy of the default save, with its own arrays. */
export function defaultSave() {
  return {
    ...DEFAULT_SAVE,
    bests: [...DEFAULT_SAVE.bests],
    cleared: [...DEFAULT_SAVE.cleared],
  };
}

/** Read, validate and merge a stored save; any failure means a fresh save. */
export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();

    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return defaultSave();

    const bests = Array.isArray(data.bests) ? data.bests : [];
    const cleared = Array.isArray(data.cleared) ? data.cleared : [];

    return {
      best: number(data.best),
      runs: number(data.runs),
      clears: number(data.clears),
      seeds: number(data.seeds),
      motes: number(data.motes),
      bests: DEFAULT_SAVE.bests.map((value, index) =>
        number(bests[index], value),
      ),
      cleared: DEFAULT_SAVE.cleared.map((value, index) =>
        cleared[index] === undefined ? value : boolean(cleared[index]),
      ),
    };
  } catch {
    return DEFAULT_SAVE;
  }
}

/** Persist a save, returning false when storage refuses it. */
export function writeSave(save) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

/** The first garden is always open; the fourth garden wakes when the third is cleared. */
export function isGardenUnlocked(save, index) {
  if (index === 0) return true;
  if (index === 1) return !!(save && save.cleared && save.cleared[0]);
  if (index === 2) return !!(save && save.cleared && save.cleared[1]);
  if (index === 3) return !!(save && save.cleared && save.cleared[2]);
  return false;
}

/** Fold one finished run into a new save without mutating the old one. */
export function recordRun(save, { score, total, gardenIndex, cleared, campaignCleared, seeds, motes }) {
  const previous = save || defaultSave();
  const next = {
    ...previous,
    bests: [...(previous.bests || DEFAULT_SAVE.bests)],
    cleared: [...(previous.cleared || DEFAULT_SAVE.cleared)],
  };

  const runScore = number(score);
  const totalScore = total === undefined ? runScore : number(total);
  const index = Number.isInteger(gardenIndex) ? gardenIndex : -1;
  const hasGarden = index >= 0 && index < next.bests.length;

  next.runs = number(previous.runs) + 1;
  next.best = Math.max(number(previous.best), totalScore);
  if (hasGarden && runScore > number(next.bests[index])) {
    next.bests[index] = runScore;
  }
  if (hasGarden && cleared) {
    next.cleared[index] = true;
    if (campaignCleared) next.clears = number(previous.clears) + 1;
  }
  next.seeds = number(previous.seeds) + number(seeds);
  next.motes = number(previous.motes) + number(motes);

  return next;
}

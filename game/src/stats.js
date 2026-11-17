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

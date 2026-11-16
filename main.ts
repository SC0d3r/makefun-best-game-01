// LUMENWING's hand-in entrypoint.
//
// This program packages the browser game for make.fun: it resolves its own
// directory (this repository), clears any stale copies inside the output
// directory, copies game/ and screenshots/ there verbatim, and writes the
// dossier.json the scorer rebuilds from those same directories. Nothing is
// fetched, transformed or bundled; the playable page is exactly game/index.html
// and its plain ES modules.

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';
import type { DossierCaps } from './vendor/makefun-game.ts';

const repoDir = dirname(fileURLToPath(import.meta.url));
const gameDir = join(repoDir, 'game');
const screenshotsDir = join(repoDir, 'screenshots');

// MAKEFUN_OUTPUT_DIR lets the grader choose a sandbox directory; /output is
// the normal hand-in location.
const requested = process.env.MAKEFUN_OUTPUT_DIR;
const outputDir = resolve(requested && requested.trim() !== '' ? requested : '/output');

const caps: DossierCaps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

/** Count regular files below a directory, the way the hand-in summary reads it. */
function countFiles(directory: string): number {
  let total = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      total += countFiles(path);
    } else if (entry.isFile()) {
      total += 1;
    }
  }
  return total;
}

function requireDirectory(directory: string, label: string): void {
  let stats;
  try {
    stats = statSync(directory);
  } catch {
    throw new Error(`LUMENWING: ${label} is missing (${directory})`);
  }
  if (!stats.isDirectory()) {
    throw new Error(`LUMENWING: ${label} is not a directory (${directory})`);
  }
}

// A wrong output directory must fail before anything is deleted.
if (outputDir === resolve(repoDir)) {
  throw new Error(
    `LUMENWING: MAKEFUN_OUTPUT_DIR resolves to the repository itself (${outputDir}); ` +
      'choose a separate output directory',
  );
}
if (!existsSync(join(gameDir, 'index.html'))) {
  throw new Error(`LUMENWING: game/index.html is missing (${join(gameDir, 'index.html')})`);
}
requireDirectory(screenshotsDir, 'screenshots/');

// Clear only the two trees this program owns inside the output directory.
mkdirSync(outputDir, { recursive: true });
rmSync(join(outputDir, 'game'), { recursive: true, force: true });
rmSync(join(outputDir, 'screenshots'), { recursive: true, force: true });

cpSync(gameDir, join(outputDir, 'game'), { recursive: true });
cpSync(screenshotsDir, join(outputDir, 'screenshots'), { recursive: true });

const gameFiles = countFiles(join(outputDir, 'game'));
const screenshotCount = countFiles(join(outputDir, 'screenshots'));

const dossier = buildDossier(outputDir, caps);
const dossierPath = join(outputDir, 'dossier.json');
writeFileSync(dossierPath, dossier);

console.log(
  `LUMENWING: copied ${gameFiles} game files and ${screenshotCount} screenshots; ` +
    `dossier.json is ${dossier.length} bytes.`,
);

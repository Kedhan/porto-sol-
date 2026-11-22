// Red Mesa Heat — entry program for make.fun gta6-01 (round 5).
// This file hands the game in: it copies the playable game (game/) and
// its screenshots (screenshots/) from beside this file into the output
// directory, then writes the dossier the judge reads, built with the
// vendored make.fun library (vendor/makefun-game.ts) — the scorer runs
// that same file, byte for byte, on what is handed in, so the dossier
// here must be exactly what buildDossier writes. Nothing is built by
// hand in this file: no custom dossier format, no file listing of its
// own. All paths resolve from this file's own directory, so it runs
// from any working directory (the grader runs `node /bot/main.ts`
// from elsewhere). It writes only under the output directory; no
// network, no chmod, no other writes.
//
// Run it like:
//
//   MAKEFUN_OUTPUT_DIR=/tmp/redmesa-out5 node main.ts
//
// With no MAKEFUN_OUTPUT_DIR set it writes to /output, the grader's
// output directory.

import { cpSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-game.ts";

// The directory this file lives in: the repo root, beside game/ and
// screenshots/. The output directory is the grader's /output unless
// MAKEFUN_OUTPUT_DIR points somewhere else (local runs, tests).
const here = fileURLToPath(new URL(".", import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

// The scorer's caps from the competition's gate.json. Only
// text_max_bytes shapes the dossier's bytes; the rest refuse an entry
// the scorer would refuse (too many or too large screenshots, too
// many game files or bytes, or a game path over 1000 bytes).
const dossierCaps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

// Hand in the game first: buildDossier reads game/ and screenshots/
// from the output directory, so they have to be copied there before
// the dossier is built.
mkdirSync(out, { recursive: true });
cpSync(join(here, "game"), join(out, "game"), { recursive: true });
mkdirSync(join(out, "screenshots"), { recursive: true });
if (existsSync(join(here, "screenshots"))) {
  cpSync(join(here, "screenshots"), join(out, "screenshots"), { recursive: true });
}

// Now the dossier, built by the library — exactly the bytes the
// scorer's own copy of buildDossier writes from the same directory.
const dossierPath = join(out, "dossier.json");
writeFileSync(dossierPath, buildDossier(out, dossierCaps));

console.log(`handed in: ${dossierPath} (${statSync(dossierPath).size} bytes)`);

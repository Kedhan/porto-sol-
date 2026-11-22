// Red Mesa Heat — dossier builder (round 4: script-relative paths)
// Collects the game into the make.fun dossier format (makefun/dossier/v1):
// a markdown "text" part holding every source file verbatim, plus the
// four screenshots as base64 images. All paths resolve from this file's
// own directory, so it runs from any working directory — the grader runs
// it as `node /bot/main.ts` from elsewhere, and it must still find the
// game. Run it like:
//
//   MAKEFUN_OUTPUT_DIR=/tmp/redmesa-out4 node main.ts
//
// With no MAKEFUN_OUTPUT_DIR set it writes to ./out next to this file.
// Only node builtins are used, so plain `node` runs this file as-is.
// It writes only to MAKEFUN_OUTPUT_DIR (or ./out); no network, no chmod.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const GAME_DIR = join(ROOT, "game");
const SHOTS_DIR = join(ROOT, "screenshots");
const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR || join(ROOT, "out");

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

// Walk a directory recursively and return every file under it, as paths
// relative to `base`, using forward slashes, sorted alphabetically.
function collectFiles(dir, base) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...collectFiles(full, base));
    } else if (entry.isFile()) {
      found.push(relative(base, full).split(sep).join("/"));
    }
  }
  return found.sort();
}

// Count the subdirectories under `dir` (not counting `dir` itself).
function countDirs(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) total += 1 + countDirs(join(dir, entry.name));
  }
  return total;
}

function sha256Hex(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function lineCount(text) {
  const parts = text.split("\n");
  if (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
  return parts.length;
}

function fenceLang(relPath) {
  if (relPath.endsWith(".html")) return "html";
  if (relPath.endsWith(".css")) return "css";
  if (relPath.endsWith(".js")) return "js";
  if (relPath.endsWith(".json")) return "json";
  return "";
}

function humanBytes(n) {
  return n + " bytes";
}

// ---------------------------------------------------------------------------
// gather the game
// ---------------------------------------------------------------------------

const indexHtml = readFileSync(join(GAME_DIR, "index.html"), "utf8");

// The script load order is whatever index.html declares, so read it back
// from the <script src="..."> tags instead of hard-coding a list.
const scriptTags = [...indexHtml.matchAll(/<script\s+src="([^"]+)"/g)].map((m) => m[1]);

const sourceRels = ["index.html"];
for (const src of scriptTags) {
  // Scripts under vendor/ are vendored libraries, not game sources.
  if (src.startsWith("vendor/")) continue;
  if (existsSync(join(GAME_DIR, src))) sourceRels.push(src);
}
if (existsSync(join(GAME_DIR, "styles.css"))) sourceRels.push("styles.css");

const allGameFiles = collectFiles(GAME_DIR, GAME_DIR);
const vendoredRels = allGameFiles.filter((p) => p.startsWith("vendor/"));
const sourceSet = new Set(sourceRels);
const assetRels = allGameFiles.filter((p) => !sourceSet.has(p) && !vendoredRels.includes(p));

function fileBytes(rel) {
  return statSync(join(GAME_DIR, rel)).size;
}

const sourceBytes = sourceRels.reduce((sum, rel) => sum + fileBytes(rel), 0);
const vendoredBytes = vendoredRels.reduce((sum, rel) => sum + fileBytes(rel), 0);
const totalBytes = allGameFiles.reduce((sum, rel) => sum + fileBytes(rel), 0);
const totalEntries = allGameFiles.length + countDirs(GAME_DIR);

// ---------------------------------------------------------------------------
// build the markdown "text" part
// ---------------------------------------------------------------------------

const out = [];
out.push("## Game");
out.push("");
out.push(`Source files: ${sourceRels.length} (${humanBytes(sourceBytes)})`);
out.push(`Vendored files: ${vendoredRels.length} (${humanBytes(vendoredBytes)})`);
for (const rel of vendoredRels) {
  out.push(`  ${rel} (${humanBytes(fileBytes(rel))})`);
}
if (assetRels.length === 0) {
  out.push("Assets: none");
} else {
  out.push(`Assets: ${assetRels.length}`);
  for (const rel of assetRels) out.push(`  ${rel} (${humanBytes(fileBytes(rel))})`);
}
out.push(`Totals: ${totalEntries} files and directories (${humanBytes(totalBytes)})`);
out.push("");
out.push("## Sources");
out.push("");

const sections = sourceRels.map((rel) => {
  const text = readFileSync(join(GAME_DIR, rel), "utf8");
  const head = `### ${rel} (${lineCount(text)} lines, ${humanBytes(fileBytes(rel))})`;
  return head + "\n\n```" + fenceLang(rel) + "\n" + text + "```";
});
out.push(sections.join("\n\n"));

// ---------------------------------------------------------------------------
// screenshots
// ---------------------------------------------------------------------------

const shotNames = readdirSync(SHOTS_DIR)
  .filter((name) => /\.jpe?g$/i.test(name))
  .sort();

const images = shotNames.map((name) => {
  const bytes = readFileSync(join(SHOTS_DIR, name));
  return {
    base64: bytes.toString("base64"),
    media_type: "image/jpeg",
    name,
    sha256: sha256Hex(bytes),
  };
});

let cover = images.findIndex((img) => img.name.startsWith("01-"));
if (cover < 0) cover = 0;

// ---------------------------------------------------------------------------
// write dossier.json
// ---------------------------------------------------------------------------

const dossier = {
  cover,
  images,
  schema: "makefun/dossier/v1",
  text: out.join("\n") + "\n",
};

mkdirSync(OUT_DIR, { recursive: true });
const outPath = join(OUT_DIR, "dossier.json");
writeFileSync(outPath, JSON.stringify(dossier));

console.log(`dossier written: ${outPath}`);
console.log(`  sources: ${sourceRels.length} files, ${sourceBytes} bytes`);
console.log(`  vendored: ${vendoredRels.length} files, ${vendoredBytes} bytes`);
console.log(`  screenshots: ${images.length} (cover: ${images[cover] ? images[cover].name : "none"})`);
console.log(`  dossier size: ${statSync(outPath).size} bytes`);

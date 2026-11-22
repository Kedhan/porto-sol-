// Red Mesa Heat — local dev server (round 4: script-relative paths)
// Serves the game directory over HTTP so the game can be played and
// screenshot-tested in a desktop browser. The game root resolves from
// this file's own directory, so it works from any working directory.
// Run it from anywhere:
//
//   node serve.ts            # http://localhost:8080
//   PORT=8091 node serve.ts  # pick another port
//
// Only node builtins are used, so plain `node` runs this file as-is.
// It never lists directories and never serves anything outside game/.

import { createServer } from "node:http";
import { createReadStream, stat } from "node:fs";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
const GAME_ROOT = join(dirname(fileURLToPath(import.meta.url)), "game");

// Content types the game needs. Text types carry a charset; images do not.
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
};

function mimeFor(filePath) {
  return MIME[extname(filePath).toLowerCase()] || "application/octet-stream";
}

function logLine(method, url, status, bytes, ms) {
  const stamp = new Date().toISOString().slice(11, 19);
  console.log(`${stamp} ${method} ${url} -> ${status} (${bytes} bytes, ${ms}ms)`);
}

const server = createServer((req, res) => {
  const started = Date.now();
  const method = req.method || "GET";
  const rawUrl = req.url || "/";

  // Anything that is not a plain read is refused outright.
  if (method !== "GET" && method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("method not allowed\n");
    logLine(method, rawUrl, 405, 0, Date.now() - started);
    return;
  }

  // Split off the query string, decode percent-escapes, and map "/" to the
  // game's front page.
  let pathname;
  try {
    pathname = decodeURIComponent(rawUrl.split("?")[0]);
  } catch (err) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("bad request\n");
    logLine(method, rawUrl, 400, 0, Date.now() - started);
    return;
  }
  if (pathname === "/") pathname = "/index.html";

  // Resolve inside game/ and refuse any path that climbs out of it.
  const resolved = normalize(join(GAME_ROOT, pathname));
  if (resolved !== GAME_ROOT && !resolved.startsWith(GAME_ROOT + sep)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("forbidden\n");
    logLine(method, rawUrl, 403, 0, Date.now() - started);
    return;
  }

  stat(resolved, (statErr, stats) => {
    if (statErr || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("not found\n");
      logLine(method, rawUrl, 404, 0, Date.now() - started);
      return;
    }

    res.writeHead(200, {
      "Content-Type": mimeFor(resolved),
      "Content-Length": stats.size,
      "Cache-Control": "no-cache",
    });
    if (method === "HEAD") {
      res.end();
      logLine(method, rawUrl, 200, 0, Date.now() - started);
      return;
    }
    const stream = createReadStream(resolved);
    stream.on("error", () => {
      if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("read error\n");
      logLine(method, rawUrl, 500, 0, Date.now() - started);
      return;
    });
    stream.on("end", () => logLine(method, rawUrl, 200, stats.size, Date.now() - started));
    stream.pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Red Mesa Heat dev server: http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
  console.log(`serving: ${GAME_ROOT}`);
});

server.on("error", (err) => {
  console.error(`server error: ${err.message}`);
  process.exit(1);
});

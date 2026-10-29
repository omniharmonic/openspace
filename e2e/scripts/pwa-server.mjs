// A static server for the Studio PWA update check: serves one of several production builds
// (directories) and can switch between them, like a deploy, without restarting.
//
//   node scripts/pwa-server.mjs <port> <dir-a> [<dir-b> ...]
//   POST /__deploy?to=<index>   → serve that build from now on
//
// Like production: `sw.js` and HTML are revalidated every time; hashed assets are immutable;
// unknown paths fall back to index.html (the SPA shell).
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const [port, ...given] = process.argv.slice(2);
const dirs = given.map((d) => resolve(d));
if (!port || given.length === 0) {
  console.error("usage: pwa-server.mjs <port> <dir> [<dir> ...]");
  process.exit(2);
}
let current = 0;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (req.method === "POST" && url.pathname === "/__deploy") {
    const to = Number(url.searchParams.get("to"));
    if (!Number.isInteger(to) || !dirs[to]) {
      res.writeHead(400).end("bad build");
      return;
    }
    current = to;
    res.writeHead(200).end(`serving ${dirs[to]}`);
    return;
  }
  if (url.pathname === "/__blank") {
    // A same-origin page that isn't Studio (for tests that fake another tab).
    res.writeHead(200, { "Content-Type": "text/html" }).end("<!doctype html><title>blank</title>");
    return;
  }
  const root = dirs[current];
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  let file = join(root, rel);
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
    // Hashed assets that no longer exist are a real 404 (what a stale tab sees after a deploy).
    if (rel.startsWith("/assets/")) {
      res.writeHead(404).end();
      return;
    }
    file = join(root, "index.html");
    if (!existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
  }
  const type = TYPES[extname(file)] ?? "application/octet-stream";
  const immutable = rel.startsWith("/assets/") && !rel.includes("workbox");
  res.writeHead(200, {
    "Content-Type": type,
    "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
  });
  createReadStream(file).pipe(res);
}).listen(Number(port), () => console.log(`pwa-server on ${port}`));

// A small static server for built sites, behaving like the hosts sites publish to (GitHub
// Pages, Cloudflare): gzip for text, long caching for hashed `_os/` and `_astro/` files,
// `/path/` → `/path/index.html`, and the site's 404 page.
//   node scripts/serve.mjs <dir> [port]
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { createGzip } from "node:zlib";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".webmanifest": "application/manifest+json",
};
const COMPRESS = /^(text\/|application\/(json|xml|manifest)|image\/svg)/;

export function serve(dir, port = 0) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    let rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    if (rel.endsWith("/")) rel += "index.html";
    let file = join(dir, rel);
    let status = 200;
    try {
      const s = await stat(file);
      if (s.isDirectory()) file = join(file, "index.html");
      await stat(file);
    } catch {
      status = 404;
      file = join(dir, "404.html");
      try {
        await stat(file);
      } catch {
        res.writeHead(404).end("Not found");
        return;
      }
    }
    const type = TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
    const headers = {
      "content-type": type,
      "cache-control": /\/(_os|_astro)\//.test(rel)
        ? "public, max-age=31536000, immutable"
        : "public, max-age=600",
    };
    if (COMPRESS.test(type) && /gzip/.test(req.headers["accept-encoding"] ?? "")) {
      res.writeHead(status, { ...headers, "content-encoding": "gzip", vary: "accept-encoding" });
      createReadStream(file).pipe(createGzip()).pipe(res);
    } else {
      const body = await readFile(file);
      res.writeHead(status, { ...headers, "content-length": body.length });
      res.end(body);
    }
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [dir, port = "8800"] = process.argv.slice(2);
  if (!dir) throw new Error("usage: serve.mjs <dir> [port]");
  const server = await serve(dir, Number(port));
  console.log(`Serving ${dir} at http://localhost:${server.address().port}/`);
}

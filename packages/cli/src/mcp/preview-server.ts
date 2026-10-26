/**
 * A tiny local preview server for the MCP tools: renders draft pages through the real renderer
 * on every request (so it always shows the files as they are now), serves `media/` and, when the
 * renderer's built assets are available, the behavior modules.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { dirname, extname, join, normalize, sep } from "node:path";
import { renderPreviewHtml } from "@openspace/mcp-tools";
import type { SiteDocument } from "@openspace/schema";

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".pdf": "application/pdf",
  ".js": "text/javascript",
  ".css": "text/css",
};

/** The renderer's built behaviors folder, if this install has one. */
function behaviorsDir(): string | null {
  try {
    const req = createRequire(import.meta.url);
    const pkg = req.resolve("@openspace/renderer/package.json");
    const dir = join(dirname(pkg), "dist", "behaviors");
    return existsSync(dir) ? dir : null;
  } catch {
    return null;
  }
}

export interface PreviewServer {
  url: string;
  close(): Promise<void>;
}

export async function startPreviewServer(
  root: string,
  load: () => Promise<SiteDocument>,
  opts: { port?: number; host?: string } = {},
): Promise<PreviewServer> {
  const behaviors = behaviorsDir();
  const server: Server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const path = decodeURIComponent(url.pathname);
      const serveFile = async (base: string, rel: string) => {
        const file = normalize(join(base, rel));
        if (!file.startsWith(normalize(base) + sep)) return false;
        try {
          const body = await readFile(file);
          res.writeHead(200, {
            "content-type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
            "cache-control": "no-store",
          });
          res.end(body);
          return true;
        } catch {
          return false;
        }
      };
      if (path.startsWith("/media/")) {
        if (await serveFile(root, path.slice(1))) return;
      } else if (path.startsWith("/_os/behaviors/") && behaviors) {
        if (await serveFile(behaviors, path.slice("/_os/behaviors/".length))) return;
      } else {
        const doc = await load();
        const slug = path.replace(/^\/+|\/+$/g, "").replace(/\/index\.html$/, "");
        const page = Object.values(doc.pages).find((p) => p.slug === slug);
        if (page) {
          const html = renderPreviewHtml(doc, page.id, { behaviorsUrl: "/_os/behaviors" });
          res.writeHead(200, {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
          });
          res.end(html);
          return;
        }
      }
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
    } catch (e) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end(`Preview failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port ?? 0, opts.host ?? "127.0.0.1", () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  server.unref();
  return {
    url: `http://${opts.host ?? "127.0.0.1"}:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

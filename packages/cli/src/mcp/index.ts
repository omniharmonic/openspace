/**
 * `openspace mcp [dir]`: the shared OpenSpace MCP tool set over stdio against a local site
 * (arch §10.4). stdout carries the protocol; everything human goes to stderr.
 */
import type { Readable, Writable } from "node:stream";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer, type ImageResizer } from "@omniharmonic/openspace-mcp-tools";
import { CliError, type Io } from "../io";
import { FileSiteStore } from "./file-store";
import { createScreenshotter, loadPlaywright } from "./screenshot";

export { FileSiteStore } from "./file-store";
export { startPreviewServer } from "./preview-server";

export interface McpOptions {
  publish?: boolean;
  previewPort?: number;
  screenshots?: boolean;
  stdin?: Readable;
  stdout?: Writable;
}

/** sharp (optional) as the image resizer for uploads above 2400px. */
async function loadResizer(): Promise<ImageResizer | undefined> {
  try {
    const spec = "sharp";
    const mod = (await import(/* @vite-ignore */ spec)) as { default: (b: Uint8Array) => unknown };
    // biome-ignore lint/suspicious/noExplicitAny: optional dependency without types here
    const sharp = mod.default as any;
    return async (bytes, maxEdge) => {
      const out = await sharp(bytes)
        .rotate()
        .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
        .toBuffer({ resolveWithObject: true });
      return { bytes: new Uint8Array(out.data), width: out.info.width, height: out.info.height };
    };
  } catch {
    return undefined;
  }
}

/** Run the stdio server until the client disconnects. */
export async function runMcp(io: Io, dir: string, opts: McpOptions = {}): Promise<void> {
  let store: FileSiteStore;
  const pw =
    opts.screenshots === false
      ? { error: "disabled with --no-screenshots" }
      : await loadPlaywright();
  try {
    store = await FileSiteStore.open(dir, {
      previewPort: opts.previewPort,
      resize: await loadResizer(),
      screenshotter: "chromium" in pw ? createScreenshotter(pw.chromium) : undefined,
    });
  } catch (e) {
    throw new CliError(`Can't serve ${dir}: ${e instanceof Error ? e.message : String(e)}`);
  }
  const server = createMcpServer(
    store,
    { sites: "*", publish: opts.publish !== false, role: "owner" },
    {
      onError: (e, where) =>
        io.err(`openspace mcp: ${where}: ${e instanceof Error ? e.stack : String(e)}`),
    },
  );
  const transport = new StdioServerTransport(
    opts.stdin ?? process.stdin,
    opts.stdout ?? process.stdout,
  );
  const closed = new Promise<void>((resolve) => {
    transport.onclose = () => resolve();
  });
  (opts.stdin ?? process.stdin).once("end", () => void transport.close());
  await server.connect(transport);
  io.err(
    `openspace mcp: serving ${dir} over stdio (${store.capabilities.canPublish ? "git: publish commits content" : "no git: edits are saved to files"}; screenshots ${store.capabilities.canScreenshot ? "on" : `off — ${"error" in pw ? pw.error : ""}`}).`,
  );
  await closed;
  await server.close();
  await store.close();
}

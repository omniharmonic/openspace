// Local docs preview with live reload (programmatic, works on any Node 22).
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dev } from "astro";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const server = await dev({ root, logLevel: "info" });
process.on("SIGINT", async () => {
  await server.stop();
  process.exit(0);
});

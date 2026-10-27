// Local preview of openspace.host with live reload (programmatic, works on any Node 22).
import { dev } from "astro";

const server = await dev({ root: process.cwd(), logLevel: "info" });
process.on("SIGINT", async () => {
  await server.stop();
  process.exit(0);
});

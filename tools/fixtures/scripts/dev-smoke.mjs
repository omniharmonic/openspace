import { dev } from "astro";

const root = process.argv[2];
const asked = 4300 + Math.floor(Math.random() * 600);
const server = await dev({
  root,
  logLevel: process.env.ASTRO_LOG ?? "warn",
  server: { port: asked },
});
// Ask the server where it listens: when the random port is taken (another dev server, a preview),
// Vite moves to the next free one, and fetching the asked port reached the other process.
const port = server.address.port;
try {
  for (const p of ["/", "/journal/2026-10-26-opening-day/", "/shop/"]) {
    const r = await fetch(`http://localhost:${port}${p}`);
    const t = await r.text();
    console.log(
      p,
      r.status,
      t.includes("<!doctype html>") || t.includes("<!DOCTYPE html>"),
      t.length,
    );
  }
} finally {
  await server.stop();
}

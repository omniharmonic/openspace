import { dev } from "astro";

const root = process.argv[2];
const server = await dev({ root, logLevel: "warn", server: { port: 4391 } });
try {
  for (const p of ["/", "/journal/2026-10-26-opening-day/", "/shop/"]) {
    const r = await fetch(`http://localhost:4391${p}`);
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

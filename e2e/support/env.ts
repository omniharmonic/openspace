/** Ports and origins of the e2e servers (kept off the default dev ports 8787/5173). */
export const HUB_PORT = Number(process.env.E2E_HUB_PORT ?? 8877);
export const STUDIO_PORT = Number(process.env.E2E_STUDIO_PORT ?? 5277);
export const HUB_URL = `http://localhost:${HUB_PORT}`;
export const STUDIO_URL = `http://localhost:${STUDIO_PORT}`;

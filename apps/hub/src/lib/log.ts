import type { LogLevel } from "../env";

/** Structured JSON logger (one line per event; Workers Logs indexes the fields). */
export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(fields: Record<string, unknown>): Logger;
}

/** Personal MCP tokens travel in URLs (`/mcp/t/<token>`); never log them whole. */
const TOKEN_IN_PATH = /\/mcp\/t\/(osmcp_)?([A-Za-z0-9_-]*?)([A-Za-z0-9_-]{0,4})(?=[/?#"\s\\]|$)/g;

/** `…/mcp/t/osmcp_<secret>` → `…/mcp/t/osmcp_…<last4>`. */
export function redactSecrets(text: string): string {
  return text.replace(TOKEN_IN_PATH, (_m, _p, _mid, last: string) => `/mcp/t/osmcp_…${last}`);
}

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

function serializeError(err: unknown): unknown {
  if (err instanceof Error) return { name: err.name, message: err.message, stack: err.stack };
  return err;
}

export function createLogger(level: LogLevel = "info", base: Record<string, unknown> = {}): Logger {
  const emit = (lvl: LogLevel, msg: string, fields?: Record<string, unknown>) => {
    if (ORDER[lvl] < ORDER[level]) return;
    const entry: Record<string, unknown> = { level: lvl, msg, ...base };
    if (fields)
      for (const [k, v] of Object.entries(fields)) entry[k] = k === "err" ? serializeError(v) : v;
    const line = redactSecrets(JSON.stringify(entry));
    if (lvl === "error") console.error(line);
    else if (lvl === "warn") console.warn(line);
    else console.log(line);
  };
  return {
    debug: (m, f) => emit("debug", m, f),
    info: (m, f) => emit("info", m, f),
    warn: (m, f) => emit("warn", m, f),
    error: (m, f) => emit("error", m, f),
    child: (fields) => createLogger(level, { ...base, ...fields }),
  };
}

/** Process I/O, injectable so commands are testable in-process. */
export interface Io {
  cwd: string;
  env: Record<string, string | undefined>;
  out(text: string): void;
  err(text: string): void;
  /** Node version used for engine checks. */
  nodeVersion: string;
}

export function processIo(): Io {
  return {
    cwd: process.cwd(),
    env: process.env,
    out: (t) => process.stdout.write(`${t}\n`),
    err: (t) => process.stderr.write(`${t}\n`),
    nodeVersion: process.versions.node,
  };
}

/** Bufferless capture for tests. */
export function captureIo(cwd: string, env: Record<string, string | undefined> = {}) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const io: Io = {
    cwd,
    env,
    out: (t) => stdout.push(t),
    err: (t) => stderr.push(t),
    nodeVersion: process.versions.node,
  };
  return { io, stdout, stderr, text: () => stdout.join("\n"), errText: () => stderr.join("\n") };
}

/** Colour is opt-in: a TTY, no NO_COLOR, not dumb. Output is plain text otherwise. */
export function useColor(io: Io, isTTY = Boolean(process.stdout.isTTY)): boolean {
  if (io.env.NO_COLOR !== undefined && io.env.NO_COLOR !== "") return false;
  if (io.env.TERM === "dumb") return false;
  return isTTY;
}

export function paint(enabled: boolean, code: number, text: string): string {
  return enabled ? `\u001b[${code}m${text}\u001b[0m` : text;
}

/** Thrown by a command to end with a message and a non-zero exit code. */
export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode = 1,
  ) {
    super(message);
    this.name = "CliError";
  }
}

import type { LogEntry, Transport } from "../types";

// ─── ANSI Color Codes ────────────────────────────────────────────────────────

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

const COLORS: Record<string, string> = {
  error: "\x1b[31m",   // red
  warn: "\x1b[33m",    // yellow
  info: "\x1b[32m",    // green
  debug: "\x1b[90m",   // gray
};

const BG_COLORS: Record<string, string> = {
  error: "\x1b[41m\x1b[97m",  // red bg, white text
  warn: "\x1b[43m\x1b[30m",   // yellow bg, black text
  info: "\x1b[42m\x1b[30m",   // green bg, black text
  debug: "\x1b[100m\x1b[37m", // gray bg, white text
};

// ─── Formatters ──────────────────────────────────────────────────────────────

function formatPretty(entry: LogEntry): string {
  const color = COLORS[entry.level] ?? RESET;
  const bg = BG_COLORS[entry.level] ?? "";
  const ts = `${DIM}${entry.timestamp}${RESET}`;
  const level = `${bg}${BOLD} ${entry.level.toUpperCase().padEnd(5)} ${RESET}`;
  const service = entry.context?.["service"]
    ? `${DIM}${entry.context["service"]}:${RESET} `
    : "";
  const msg = `${color}${entry.message}${RESET}`;
  const meta =
    entry.metadata && Object.keys(entry.metadata).length > 0
      ? ` ${DIM}${JSON.stringify(entry.metadata)}${RESET}`
      : "";

  return `${ts} ${level} ${service}${msg}${meta}`;
}

function formatJson(entry: LogEntry): string {
  return JSON.stringify(entry);
}

function formatMinimal(entry: LogEntry): string {
  const color = COLORS[entry.level] ?? RESET;
  return `${color}${entry.level.toUpperCase()}${RESET}: ${entry.message}`;
}

// ─── Terminal Transport ──────────────────────────────────────────────────────

export class TerminalTransport implements Transport {
  private format: "json" | "pretty" | "minimal";
  private buffer: string[] = [];
  private bufferSize: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private useAsync: boolean;

  constructor(options: {
    format: "json" | "pretty" | "minimal";
    async?: boolean;
    bufferSize?: number;
  }) {
    this.format = options.format;
    this.useAsync = options.async ?? true;
    this.bufferSize = options.bufferSize ?? 100;

    if (this.useAsync) {
      this.timer = setInterval(() => this.flush(), 50);
      this.timer.unref();
    }
  }

  write(entry: LogEntry): void {
    let line: string;
    switch (this.format) {
      case "pretty":
        line = formatPretty(entry);
        break;
      case "minimal":
        line = formatMinimal(entry);
        break;
      case "json":
      default:
        line = formatJson(entry);
        break;
    }

    if (this.useAsync) {
      this.buffer.push(line);
      if (this.buffer.length >= this.bufferSize) {
        this.flush();
      }
    } else {
      const stream = entry.level === "error" ? process.stderr : process.stdout;
      stream.write(line + "\n");
    }
  }

  flush(): void {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0);
    const output = batch.join("\n") + "\n";

    // Write errors to stderr, everything else to stdout.
    // For async batches, use stdout for simplicity.
    process.stdout.write(output);
  }

  close(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.flush();
  }
}

import type {
  LogLevel,
  LoggerOptions,
  LogEntry,
  Transport,
  Format,
  TransportStrategy,
  Environment,
} from "./types";
import { LOG_LEVEL_PRIORITY } from "./types";
import { TerminalTransport } from "./transports/terminal";
import { FileTransport } from "./transports/file";
import { SidecarTransport } from "./transports/sidecar";
import { currentTraceId } from '@dexter.js/types';

const DEFAULT_SOCKET_PATH = "/tmp/dexter.sock";

// ─── Redaction ───────────────────────────────────────────────────────────────

function redactFields(
  obj: Record<string, unknown>,
  fields: Set<string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (fields.has(key.toLowerCase())) {
      result[key] = "[REDACTED]";
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      result[key] = redactFields(value as Record<string, unknown>, fields);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        item !== null && typeof item === "object"
          ? redactFields(item as Record<string, unknown>, fields)
          : item,
      );
    } else {
      result[key] = value;
    }
  }

  return result;
}

// ─── Logger Class ────────────────────────────────────────────────────────────

export class Logger {
  private level: LogLevel;
  private context: Record<string, unknown>;
  private transports: Transport[] = [];
  private redactSet: Set<string>;
  private _sidecarTransport: SidecarTransport | null = null;

  constructor(private options: InternalOptions) {
    this.level = options.level;
    this.context = options.context;
    this.redactSet = new Set(
      (options.redact ?? []).map((f) => f.toLowerCase()),
    );

    this.initTransports();
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  debug(message: string, metadata?: Record<string, unknown>): void {
    this.log("debug", message, metadata);
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.log("info", message, metadata);
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    this.log("warn", message, metadata);
  }

  error(message: string, metadata?: Record<string, unknown>): void {
    this.log("error", message, metadata);
  }

  /**
   * Create a child logger with additional context merged in.
   * All logs from the child automatically include the parent's context plus
   * the new fields.
   */
  child(childContext: Record<string, unknown>): Logger {
    const merged = { ...this.context, ...childContext };
    const childLogger = new Logger({
      ...this.options,
      context: merged,
    });
    // Share transports with parent to avoid duplicating file handles / sockets.
    childLogger.transports = this.transports;
    childLogger._sidecarTransport = this._sidecarTransport;
    return childLogger;
  }

  /**
   * Connect this logger to the DexterJS sidecar so logs flow through
   * the monitoring pipeline. Called by `monitor()` when a logger instance
   * is passed in.
   */
  connectToSidecar(socketPath: string = DEFAULT_SOCKET_PATH): void {
    // Avoid duplicate connections.
    if (this._sidecarTransport) return;

    const terminalFallback = this.transports.find(
      (t) => t instanceof TerminalTransport,
    ) as TerminalTransport | undefined;

    this._sidecarTransport = new SidecarTransport({
      socketPath,
      bufferSize: this.options.bufferSize,
      fallback: terminalFallback,
    });

    this.transports.push(this._sidecarTransport);
  }

  /** Flush all transport buffers. */
  flush(): void {
    for (const t of this.transports) {
      t.flush();
    }
  }

  /** Close all transports and release resources. */
  close(): void {
    for (const t of this.transports) {
      t.close();
    }
    this.transports = [];
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  private log(
    level: LogLevel,
    message: string,
    metadata?: Record<string, unknown>,
  ): void {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.level]) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      traceId : currentTraceId(),
      context:
        Object.keys(this.context).length > 0 ? { ...this.context } : undefined,
      metadata: metadata
        ? this.redactSet.size > 0
          ? redactFields(metadata, this.redactSet)
          : { ...metadata }
        : undefined,
    };

    for (const transport of this.transports) {
      try {
        transport.write(entry);
      } catch {
        // Never let transport failures crash the host application.
      }
    }
  }

  private initTransports(): void {
    const { env, transport, format, file, async: useAsync, bufferSize } =
      this.options;

    const resolvedTransport = this.resolveTransport(transport, env);

    if (
      resolvedTransport === "terminal" ||
      resolvedTransport === "both"
    ) {
      this.transports.push(
        new TerminalTransport({ format, async: useAsync, bufferSize }),
      );
    }

    if (
      resolvedTransport === "file" ||
      resolvedTransport === "both"
    ) {
      if (file) {
        this.transports.push(
          new FileTransport({ ...file, async: useAsync, bufferSize }),
        );
      }
    }
  }

  private resolveTransport(
    transport: "auto" | "terminal" | "file" | "both",
    env: "development" | "production",
  ): "terminal" | "file" | "both" {
    if (transport !== "auto") {
      return transport;
    }

    // auto resolution
    if (env === "development") {
      return "terminal";
    }

    // production — default to file if file config is provided, else terminal
    if (this.options.file) {
      return "file";
    }

    return "terminal";
  }
}

// ─── Internal Resolved Options ───────────────────────────────────────────────

interface InternalOptions {
  level: LogLevel;
  format: Format;
  env: Environment;
  transport: TransportStrategy;
  file?: Required<LoggerOptions>["file"];
  context: Record<string, unknown>;
  async: boolean;
  bufferSize: number;
  redact: string[];
}

// ─── Factory ─────────────────────────────────────────────────────────────────

function resolveEnv(): Environment {
  const env = process.env["NODE_ENV"];
  if (env === "production") return "production";
  return "development";
}

export function createLogger(options?: LoggerOptions): Logger {
  const env = options?.env ?? resolveEnv();
  const resolved: InternalOptions = {
    level: options?.level ?? "info",
    format: options?.format ?? (env === "production" ? "json" : "pretty"),
    env,
    transport: options?.transport ?? "auto",
    file: options?.file,
    context: options?.context ?? {},
    async: options?.async ?? true,
    bufferSize: options?.bufferSize ?? 100,
    redact: options?.redact ?? [],
  };

  return new Logger(resolved);
}

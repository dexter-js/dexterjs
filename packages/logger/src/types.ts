// ─── Log Levels ──────────────────────────────────────────────────────────────

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

// ─── Output Formats ─────────────────────────────────────────────────────────
export type Format = "json" | "pretty" | "minimal";

// ─── Environments & Transports ─────────────────────────────────────────────
export type Environment = "development" | "production";

// Auto-detect transport based on environment and terminal presence:
export type TransportStrategy = "auto" | "terminal" | "file" | "both";


export const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info:  1,
  warn:  2,
  error: 3,
  fatal: 4,
};

// ─── File Options ────────────────────────────────────────────────────────────

export interface FileOptions {
  /** Absolute or relative path to the log directory. */
  path: string;
  /** Write separate files per log level. */
  split: boolean;
  /** Custom filenames per level (defaults: error.log, warn.log, etc.). */
  filenames?: {
    error?: string;
    warn?: string;
    info?: string;
    debug?: string;
    fatal?: string
  };
  /** Log rotation configuration. */
  rotation: {
    /** Maximum file size before rotation, e.g. '10mb', '500kb'. */
    maxSize: string;
    /** Number of days to keep rotated files. */
    maxFiles: number;
    /** Gzip rotated files. */
    compress: boolean;
  };
}

// ─── Logger Options ──────────────────────────────────────────────────────────

export interface LoggerOptions {
  /** Minimum log level (default: 'info'). */
  level?: LogLevel;
  /** Output format (default: 'json' in production, 'pretty' in development). */
  format?: Format;
  /** Environment override (defaults to NODE_ENV). */
  env?: Environment;
  /**
   * Transport strategy.
   * - 'auto'     — picks based on env and monitor presence.
   * - 'terminal' — stdout & stderr only
   * - 'file'     — file only
   * - 'both'     — terminal + file
   */
  transport?: TransportStrategy;
  /** File transport configuration (required when transport includes file). */
  file?: FileOptions;
  /** Static context fields attached to every log entry. */
  context?: {
    service?: string;
    version?: string;
    env?: string;
    [key: string]: unknown;
  };
  /** Use async buffered writes (default: true). */
  async?: boolean;
  /** Write buffer size before force flush (default: 100). */
  bufferSize?: number;
  /** Field names to recursively redact from metadata. */
  redact?: string[];
}

// ─── Log Entry ───────────────────────────────────────────────────────────────

export interface LogEntry {
  level: string;
  message: string;
  timestamp: string;
  traceId?: string;
  context?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// ─── Transport Interface ─────────────────────────────────────────────────────

export interface Transport {
  write(entry: LogEntry): void;
  flush(): void;
  close(): void;
}

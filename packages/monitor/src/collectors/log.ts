import type { LogLevel } from "@dexter.js/types";
import { currentTraceId } from "../context";
import { SocketEmitter } from "../emitter";

/**
 * Structured log collector that automatically attaches the current traceId
 * obtained from {@link AsyncLocalStorage}.
 */
export class LogCollector {
  private emitter: SocketEmitter;

  constructor(emitter: SocketEmitter) {
    this.emitter = emitter;
  }

  /** Emit a structured log event to the sidecar. */
  log(
    level: LogLevel,
    message: string,
    metadata?: Record<string, unknown>,
  ): void {
    const traceId = currentTraceId();

    this.emitter.emit({
      type: "log",
      payload: {
        traceId,
        level,
        message,
        metadata,
        timestamp: Date.now(),
      },
    });
  }

  // ── Convenience methods ─────────────────────────────────────────────────

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

  fatal(message: string, metadata?: Record<string, unknown>): void {
    this.log("fatal", message, metadata);
  }
}

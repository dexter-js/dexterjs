// ─── @dexter.js/logger ───────────────────────────────────────────────────────
// Zero-dependency, production-grade structured logger for Node.js.

export { createLogger, Logger } from "./logger";

export type {
  LogLevel,
  LoggerOptions,
  LogEntry,
  FileOptions,
  Transport,
} from "./types";

export { TerminalTransport } from "./transports/terminal";
export { FileTransport } from "./transports/file";
export { SidecarTransport } from "./transports/sidecar";

// Default logger instance — zero config, just import and use.
import { createLogger } from "./logger";
export const logger = createLogger();

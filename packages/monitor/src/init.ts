import { spawn, type ChildProcess } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import type { DexterConfig } from "@dexter.js/types";
import { SocketEmitter } from "./emitter";
import { MetricsCollector } from "./collectors/metrics";

// ─── Monitor Options ─────────────────────────────────────────────────────────

export interface MonitorOptions {
  /** Express app instance to auto-instrument. */
  app: any;
  /** Optional @dexter.js/logger instance — if passed, logs flow through monitor. */
  logger?: any;
  /** Dashboard port (default: 4000). */
  port?: number;
  /** Auto-spawn sidecar process (default: true). */
  autoSpawn?: boolean;
  /** Custom Unix socket path. */
  socketPath?: string;
  /** Custom path to sidecar entry point. */
  sidecarPath?: string;
}

let _emitter: SocketEmitter | null = null;
let _sidecarProcess: ChildProcess | null = null;
let _metricsCollector: MetricsCollector | null = null;

const DEFAULT_SOCKET_PATH = "/tmp/dexter.sock";

/**
 * Initialize DexterJS monitoring.
 *
 * 1. Optionally spawns the sidecar as a child process.
 * 2. Starts the {@link SocketEmitter} and {@link MetricsCollector}.
 * 3. If a logger is provided, connects it to the sidecar socket.
 * 4. Returns the emitter for manual event emission.
 */
export function monitor(options: MonitorOptions): SocketEmitter {
  const port = options.port ?? 4000;
  const autoSpawn = options.autoSpawn ?? true;
  const socketPath = options.socketPath ?? DEFAULT_SOCKET_PATH;
  const sidecarPath =
    options.sidecarPath ??
    path.resolve(__dirname, "../../sidecar/dist/index.js");

  if (_emitter) return _emitter;

  // ── Auto-spawn sidecar ──────────────────────────────────────────────────
  if (autoSpawn) {
    spawnSidecar({ port, sidecarPath });
  }

  // ── Emitter ─────────────────────────────────────────────────────────────
  _emitter = new SocketEmitter(socketPath);
  _emitter.start();

  // ── Connect logger to sidecar ───────────────────────────────────────────
  if (options.logger && typeof options.logger.connectToSidecar === "function") {
    options.logger.connectToSidecar(socketPath);
  }

  // ── Metrics collector ───────────────────────────────────────────────────
  _metricsCollector = new MetricsCollector(_emitter);
  _metricsCollector.start();

  // ── Graceful shutdown ───────────────────────────────────────────────────
  const shutdown = (): void => {
    _metricsCollector?.stop();
    _emitter?.stop();
    _sidecarProcess?.kill("SIGTERM");
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  process.once("beforeExit", shutdown);

  return _emitter;
}

/** Returns the global emitter if monitor has been initialised. */
export function getEmitter(): SocketEmitter | null {
  return _emitter;
}

/** Legacy alias — init() maps to monitor() for backward compatibility. */
export function init(config?: DexterConfig): SocketEmitter {
  return monitor({
    app: null,
    port: config?.port,
    autoSpawn: config?.autoSpawn,
    sidecarPath: config?.sidecarPath,
  });
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function spawnSidecar(cfg: { port: number; sidecarPath: string }): void {
  const sidecarEntry = cfg.sidecarPath;

  if (!fs.existsSync(sidecarEntry)) {
    console.warn(
      `[dexter] sidecar not found at ${sidecarEntry} — skipping auto-spawn. ` +
        `Build the sidecar first or set autoSpawn: false.`,
    );
    return;
  }

  _sidecarProcess = spawn(process.execPath, [sidecarEntry], {
    env: { ...process.env, DEXTER_PORT: String(cfg.port) },
    stdio: "ignore",
    detached: false,
  });

  _sidecarProcess.unref();

  _sidecarProcess.on("error", (err) => {
    console.error("[dexter] failed to start sidecar:", err.message);
  });

  _sidecarProcess.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.warn(`[dexter] sidecar exited with code ${code}`);
    }
  });
}

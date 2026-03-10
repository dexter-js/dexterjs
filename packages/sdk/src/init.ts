import { spawn, type ChildProcess } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import type { DexterConfig } from "@dexter.js/types";
import { SocketEmitter } from "./emitter";
import { MetricsCollector } from "./collectors/metrics";

let _emitter: SocketEmitter | null = null;
let _sidecarProcess: ChildProcess | null = null;
let _metricsCollector: MetricsCollector | null = null;

const DEFAULT_CONFIG: Required<DexterConfig> = {
  port: 4000,
  autoSpawn: true,
  sidecarPath: path.resolve(__dirname, "../../sidecar/dist/index.js"),
};

/**
 * Initialise DexterJS.
 *
 * 1. Merges the supplied config with defaults.
 * 2. Optionally spawns the sidecar as a child process.
 * 3. Starts the {@link SocketEmitter} and {@link MetricsCollector}.
 */
export function init(config?: DexterConfig): SocketEmitter {
  const cfg: Required<DexterConfig> = { ...DEFAULT_CONFIG, ...config };

  if (_emitter) return _emitter;

  // ── Auto-spawn sidecar ──────────────────────────────────────────────────
  if (cfg.autoSpawn) {
    spawnSidecar(cfg);
  }

  // ── Emitter ─────────────────────────────────────────────────────────────
  _emitter = new SocketEmitter();
  _emitter.start();

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

/** Returns the global emitter if DexterJS has been initialised. */
export function getEmitter(): SocketEmitter | null {
  return _emitter;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function spawnSidecar(cfg: Required<DexterConfig>): void {
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

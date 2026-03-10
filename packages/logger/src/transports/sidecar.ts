import * as net from "node:net";
import type { LogEntry, Transport } from "../types";

const FLUSH_INTERVAL_MS = 500;

/**
 * Sends log entries to the DexterJS sidecar via Unix domain socket.
 * Falls back to terminal output if the socket is unreachable.
 */
export class SidecarTransport implements Transport {
  private socketPath: string;
  private buffer: LogEntry[] = [];
  private bufferSize: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private connected: boolean = false;
  private fallback: Transport | null = null;

  constructor(options: {
    socketPath: string;
    bufferSize?: number;
    fallback?: Transport;
  }) {
    this.socketPath = options.socketPath;
    this.bufferSize = options.bufferSize ?? 100;
    this.fallback = options.fallback ?? null;

    this.timer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
    this.timer.unref();
  }

  write(entry: LogEntry): void {
    this.buffer.push(entry);
    if (this.buffer.length >= this.bufferSize) {
      this.flush();
    }
  }

  flush(): void {
    if (this.buffer.length === 0) return;

    const batch = this.buffer.splice(0);
    const payload = JSON.stringify({
      events: batch.map((entry) => ({
        type: "log" as const,
        payload: {
          traceId: (entry.context?.["traceId"] as string) ?? "unknown",
          level: entry.level,
          message: entry.message,
          metadata: entry.metadata,
          timestamp: Date.now(),
        },
      })),
      sentAt: Date.now(),
    }) + "\n";

    const client = net.createConnection({ path: this.socketPath }, () => {
      this.connected = true;
      client.end(payload);
    });

    client.on("error", () => {
      // Socket unreachable — fall back to terminal if available.
      this.connected = false;
      if (this.fallback) {
        for (const entry of batch) {
          this.fallback.write(entry);
        }
        this.fallback.flush();
      }
    });

    client.unref();
  }

  close(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.flush();
  }

  /** Whether the transport has successfully connected at least once. */
  isConnected(): boolean {
    return this.connected;
  }
}

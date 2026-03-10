import * as net from "node:net";
import type { EventBatch, EventEnvelope } from "@dexter.js/types";

const SOCKET_PATH = "/tmp/dexter.sock";
const FLUSH_INTERVAL_MS = 500;

/**
 * Batches DexterJS events and flushes them to the sidecar over a Unix domain
 * socket every {@link FLUSH_INTERVAL_MS} ms.
 *
 * The emitter silently drops events when the sidecar is unreachable so that the
 * host application is never affected by observability failures.
 */
export class SocketEmitter {
  private buffer: EventEnvelope[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private socketPath: string;

  constructor(socketPath: string = SOCKET_PATH) {
    this.socketPath = socketPath;
  }

  /** Start periodic flushing. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
    // Allow the Node.js process to exit even if the timer is running.
    this.timer.unref();
  }

  /** Stop periodic flushing and drain the remaining buffer. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.flush();
  }

  /** Queue an event for the next flush cycle. */
  emit(envelope: EventEnvelope): void {
    this.buffer.push(envelope);
  }

  /** Flush the current buffer to the sidecar socket. */
  private flush(): void {
    if (this.buffer.length === 0) return;

    const batch: EventBatch = {
      events: this.buffer.splice(0),
      sentAt: Date.now(),
    };

    const payload = JSON.stringify(batch) + "\n";

    const client = net.createConnection({ path: this.socketPath }, () => {
      client.end(payload);
    });

    client.on("error", (err) => {
      // Silently drop — never crash the host app.
      if (process.env["DEXTER_DEBUG"]) {
        console.error("[dexter] socket emit error:", err.message);
      }
    });

    // Prevent the socket from keeping the event loop alive.
    client.unref();
  }
}

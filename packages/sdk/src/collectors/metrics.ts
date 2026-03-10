import {
  monitorEventLoopDelay,
  type IntervalHistogram,
} from "node:perf_hooks";
import * as os from "node:os";
import { SocketEmitter } from "../emitter";

const COLLECT_INTERVAL_MS = 5_000;

/**
 * Periodically collects system-level metrics (CPU, memory, event-loop lag) and
 * ships them to the sidecar via the shared {@link SocketEmitter}.
 */
export class MetricsCollector {
  private emitter: SocketEmitter;
  private timer: ReturnType<typeof setInterval> | null = null;
  private histogram: IntervalHistogram;

  constructor(emitter: SocketEmitter) {
    this.emitter = emitter;
    this.histogram = monitorEventLoopDelay({ resolution: 20 });
  }

  start(): void {
    if (this.timer) return;
    this.histogram.enable();
    this.timer = setInterval(() => this.collect(), COLLECT_INTERVAL_MS);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.histogram.disable();
  }

  private collect(): void {
    const cpuUsage = os.loadavg()[0] ?? 0; // 1-minute load average
    const memInfo = process.memoryUsage();
    const memoryUsage = memInfo.rss;
    const eventLoopLag = this.histogram.mean / 1e6; // ns → ms
    const activeHandles = (process as NodeJS.Process & { _getActiveHandles?: () => unknown[] })
      ._getActiveHandles?.().length ?? 0;

    this.emitter.emit({
      type: "metric",
      payload: {
        cpuUsage,
        memoryUsage,
        eventLoopLag,
        activeHandles,
        timestamp: Date.now(),
      },
    });

    // Reset histogram for the next window.
    this.histogram.reset();
  }
}

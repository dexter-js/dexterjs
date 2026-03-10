import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SocketEmitter } from "@dexter.js/sdk/emitter";
import { MetricsCollector } from "@dexter.js/sdk/collectors/metrics";

describe("SDK — MetricsCollector", () => {
  let emitter: SocketEmitter;
  let emitSpy: ReturnType<typeof vi.spyOn>;
  let collector: MetricsCollector;

  beforeEach(() => {
    emitter = new SocketEmitter("/tmp/dexter-test-nonexistent.sock");
    emitSpy = vi.spyOn(emitter, "emit");
    collector = new MetricsCollector(emitter);
  });

  afterEach(() => {
    collector.stop();
  });

  it("should be instantiable", () => {
    expect(collector).toBeInstanceOf(MetricsCollector);
  });

  it("should start and stop without errors", () => {
    expect(() => collector.start()).not.toThrow();
    expect(() => collector.stop()).not.toThrow();
  });

  it("calling start() twice is idempotent", () => {
    collector.start();
    expect(() => collector.start()).not.toThrow();
  });

  it("should emit a metric event after the collection interval", async () => {
    // The default interval is 5s — we'll manually trigger collection by
    // accessing the private method through a controlled approach: start it and
    // use a short wait with fake timers.
    vi.useFakeTimers();

    collector.start();

    // Advance past one collection cycle (5000ms).
    vi.advanceTimersByTime(5_000);

    expect(emitSpy).toHaveBeenCalled();
    const call = emitSpy.mock.calls[0]![0] as any;
    expect(call.type).toBe("metric");
    expect(typeof call.payload.cpuUsage).toBe("number");
    expect(typeof call.payload.memoryUsage).toBe("number");
    expect(typeof call.payload.eventLoopLag).toBe("number");
    expect(typeof call.payload.activeHandles).toBe("number");
    expect(typeof call.payload.timestamp).toBe("number");

    vi.useRealTimers();
  });

  it("should not emit metrics before the interval fires", () => {
    vi.useFakeTimers();

    collector.start();
    vi.advanceTimersByTime(1_000); // only 1s, interval is 5s

    expect(emitSpy).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("should stop emitting after stop() is called", () => {
    vi.useFakeTimers();

    collector.start();
    vi.advanceTimersByTime(5_000);
    expect(emitSpy).toHaveBeenCalledTimes(1);

    collector.stop();
    vi.advanceTimersByTime(10_000);
    expect(emitSpy).toHaveBeenCalledTimes(1); // no more calls

    vi.useRealTimers();
  });
});

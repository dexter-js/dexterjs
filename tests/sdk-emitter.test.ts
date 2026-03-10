import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SocketEmitter } from "@dexter.js/monitor/emitter";
import type { EventEnvelope } from "@dexter.js/types";

describe("SDK — SocketEmitter", () => {
  let emitter: SocketEmitter;

  beforeEach(() => {
    // Use a non-existent socket so flushes silently fail (expected behaviour).
    emitter = new SocketEmitter("/tmp/dexter-test-nonexistent.sock");
  });

  afterEach(() => {
    emitter.stop();
  });

  it("should be instantiable", () => {
    expect(emitter).toBeInstanceOf(SocketEmitter);
  });

  it("should accept events via emit() without throwing", () => {
    const envelope: EventEnvelope = {
      type: "trace",
      payload: {
        traceId: "t1",
        method: "GET",
        route: "/test",
        statusCode: 200,
        duration: 5,
        timestamp: Date.now(),
      },
    };

    expect(() => emitter.emit(envelope)).not.toThrow();
  });

  it("should queue multiple events", () => {
    for (let i = 0; i < 10; i++) {
      emitter.emit({
        type: "log",
        payload: {
          traceId: `t-${i}`,
          level: "info",
          message: `msg ${i}`,
          timestamp: Date.now(),
        },
      });
    }

    // Buffer is private so we test indirectly — stop() drains without error.
    expect(() => emitter.stop()).not.toThrow();
  });

  it("should start and stop without errors", () => {
    expect(() => emitter.start()).not.toThrow();
    expect(() => emitter.stop()).not.toThrow();
  });

  it("calling start() twice is idempotent", () => {
    emitter.start();
    expect(() => emitter.start()).not.toThrow();
    emitter.stop();
  });

  it("calling stop() twice is safe", () => {
    emitter.start();
    emitter.stop();
    expect(() => emitter.stop()).not.toThrow();
  });

  it("silently drops events when socket is unreachable", async () => {
    emitter.start();

    emitter.emit({
      type: "metric",
      payload: {
        cpuUsage: 1,
        memoryUsage: 1024,
        eventLoopLag: 0.5,
        activeHandles: 2,
        timestamp: Date.now(),
      },
    });

    // Wait for the flush interval to fire.
    await new Promise((r) => setTimeout(r, 600));

    // No crash = success.
    expect(true).toBe(true);
  });
});

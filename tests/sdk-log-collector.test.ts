import { describe, it, expect, vi, beforeEach } from "vitest";
import { SocketEmitter } from "@dexter.js/sdk/emitter";
import { LogCollector } from "@dexter.js/sdk/collectors/log";
import { traceStore } from "@dexter.js/sdk/context";

describe("SDK — LogCollector", () => {
  let emitter: SocketEmitter;
  let emitSpy: ReturnType<typeof vi.spyOn>;
  let log: LogCollector;

  beforeEach(() => {
    emitter = new SocketEmitter("/tmp/dexter-test-nonexistent.sock");
    emitSpy = vi.spyOn(emitter, "emit");
    log = new LogCollector(emitter);
  });

  it("should emit a log event with the correct level and message", () => {
    log.info("hello world");

    expect(emitSpy).toHaveBeenCalledOnce();
    const call = emitSpy.mock.calls[0]![0] as any;
    expect(call.type).toBe("log");
    expect(call.payload.level).toBe("info");
    expect(call.payload.message).toBe("hello world");
    expect(call.payload.traceId).toBe("unknown"); // no context active
    expect(typeof call.payload.timestamp).toBe("number");
  });

  it("should attach traceId from AsyncLocalStorage", () => {
    traceStore.run({ traceId: "ctx-trace-123" }, () => {
      log.warn("watch out", { key: "val" });
    });

    const call = emitSpy.mock.calls[0]![0] as any;
    expect(call.payload.traceId).toBe("ctx-trace-123");
    expect(call.payload.metadata).toEqual({ key: "val" });
  });

  it("should support all convenience methods", () => {
    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");
    log.fatal("f");

    expect(emitSpy).toHaveBeenCalledTimes(5);

    const levels = emitSpy.mock.calls.map((c: any) => c[0].payload.level);
    expect(levels).toEqual(["debug", "info", "warn", "error", "fatal"]);
  });

  it("should pass metadata through", () => {
    log.error("db failed", { host: "localhost", port: 5432 });

    const call = emitSpy.mock.calls[0]![0] as any;
    expect(call.payload.metadata).toEqual({ host: "localhost", port: 5432 });
  });

  it("should allow metadata to be omitted", () => {
    log.info("no meta");

    const call = emitSpy.mock.calls[0]![0] as any;
    expect(call.payload.metadata).toBeUndefined();
  });
});

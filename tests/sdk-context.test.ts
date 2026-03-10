import { describe, it, expect, vi, beforeEach } from "vitest";
import { traceStore, currentTraceId } from "@dexterjs/sdk/context";

describe("SDK — context (AsyncLocalStorage traceId)", () => {
  it("returns 'unknown' when no async context is active", () => {
    expect(currentTraceId()).toBe("unknown");
  });

  it("returns the traceId set inside traceStore.run()", () => {
    traceStore.run({ traceId: "my-trace-abc" }, () => {
      expect(currentTraceId()).toBe("my-trace-abc");
    });
  });

  it("restores 'unknown' after the store exits", () => {
    traceStore.run({ traceId: "temp" }, () => {
      expect(currentTraceId()).toBe("temp");
    });
    expect(currentTraceId()).toBe("unknown");
  });

  it("supports nested contexts", () => {
    traceStore.run({ traceId: "outer" }, () => {
      expect(currentTraceId()).toBe("outer");

      traceStore.run({ traceId: "inner" }, () => {
        expect(currentTraceId()).toBe("inner");
      });

      expect(currentTraceId()).toBe("outer");
    });
  });

  it("propagates traceId across async boundaries", async () => {
    await traceStore.run({ traceId: "async-trace" }, async () => {
      await new Promise((r) => setTimeout(r, 10));
      expect(currentTraceId()).toBe("async-trace");

      const result = await Promise.resolve(currentTraceId());
      expect(result).toBe("async-trace");
    });
  });
});

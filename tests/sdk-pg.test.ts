import { describe, it, expect, vi, beforeEach } from "vitest";
import { SocketEmitter } from "@dexter.js/sdk/emitter";
import { traceStore } from "@dexter.js/sdk/context";

// Mock init module to expose a controlled emitter for the pg instrumentor.
let mockEmitter: SocketEmitter;
let emitSpy: ReturnType<typeof vi.spyOn>;

vi.mock("@dexter.js/sdk/init", () => ({
  getEmitter: () => mockEmitter,
}));

import { instrumentPg } from "@dexter.js/sdk/instrumentors/pg";

describe("SDK — pg instrumentor", () => {
  beforeEach(() => {
    mockEmitter = new SocketEmitter("/tmp/dexter-test-nonexistent.sock");
    emitSpy = vi.spyOn(mockEmitter, "emit");
  });

  it("should wrap Client.prototype.query", () => {
    class FakeClient {
      async query(text: string) {
        return { rows: [{ id: 1 }] };
      }
    }

    const originalQuery = FakeClient.prototype.query;
    instrumentPg(FakeClient);
    expect(FakeClient.prototype.query).not.toBe(originalQuery);
  });

  it("should emit a db span when a query resolves", async () => {
    class FakeClient {
      async query(text: string) {
        return { rows: [] };
      }
    }

    instrumentPg(FakeClient);
    const client = new FakeClient();

    await traceStore.run({ traceId: "pg-trace-1" }, async () => {
      await client.query("SELECT * FROM users");
    });

    expect(emitSpy).toHaveBeenCalled();
    const call = emitSpy.mock.calls[0]![0] as any;
    expect(call.type).toBe("span");
    expect(call.payload.type).toBe("db");
    expect(call.payload.traceId).toBe("pg-trace-1");
    expect(call.payload.target).toContain("SELECT * FROM users");
    expect(typeof call.payload.duration).toBe("number");
    expect(call.payload.error).toBeUndefined();
  });

  it("should emit a db span with error when query rejects", async () => {
    class FakeClient2 {
      async query(_text: string) {
        throw new Error("relation 'users' does not exist");
      }
    }

    instrumentPg(FakeClient2);
    const client = new FakeClient2();

    await traceStore.run({ traceId: "pg-trace-err" }, async () => {
      try {
        await client.query("SELECT * FROM users");
      } catch {
        // expected
      }
    });

    expect(emitSpy).toHaveBeenCalled();
    const call = emitSpy.mock.calls[0]![0] as any;
    expect(call.payload.error).toBe("relation 'users' does not exist");
    expect(call.payload.traceId).toBe("pg-trace-err");
  });

  it("should warn and skip if Client.prototype.query is missing", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    instrumentPg({});
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("skipping pg instrumentation"),
    );
    warnSpy.mockRestore();
  });

  it("should truncate long query strings to 200 chars", async () => {
    const longQuery = "SELECT " + "x".repeat(300) + " FROM big_table";

    class FakeClient3 {
      async query(_text: string) {
        return { rows: [] };
      }
    }

    instrumentPg(FakeClient3);
    const client = new FakeClient3();
    await client.query(longQuery);

    const call = emitSpy.mock.calls[0]![0] as any;
    expect(call.payload.target.length).toBeLessThanOrEqual(200);
  });
});

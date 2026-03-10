import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import { expressMiddleware } from "@dexterjs/sdk/instrumentors/express";
import { traceStore, currentTraceId } from "@dexterjs/sdk/context";

// We need to mock getEmitter() so the middleware can emit without a real socket.
vi.mock("@dexterjs/sdk/init", () => {
  const emittedEvents: any[] = [];
  return {
    getEmitter: () => ({
      emit: (envelope: any) => emittedEvents.push(envelope),
    }),
    _getEmittedEvents: () => emittedEvents,
    _clearEmittedEvents: () => (emittedEvents.length = 0),
  };
});

// Pull out internal helpers to inspect emitted events.
import {
  _getEmittedEvents,
  _clearEmittedEvents,
} from "@dexterjs/sdk/init";

function createMockReq(overrides: Record<string, any> = {}): any {
  return {
    method: "GET",
    url: "/test",
    originalUrl: "/test",
    route: { path: "/test" },
    ...overrides,
  };
}

function createMockRes(): any {
  const res = new EventEmitter() as any;
  res.statusCode = 200;
  return res;
}

describe("SDK — Express middleware", () => {
  beforeEach(() => {
    (_clearEmittedEvents as any)();
  });

  it("should call next()", () => {
    const middleware = expressMiddleware();
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("should attach traceId to the request object", () => {
    const middleware = expressMiddleware();
    const req = createMockReq();
    const res = createMockRes();

    middleware(req, res, vi.fn());
    expect(req.traceId).toBeDefined();
    expect(typeof req.traceId).toBe("string");
    expect(req.traceId.length).toBeGreaterThan(0);
  });

  it("should set traceId in AsyncLocalStorage during handler execution", () => {
    const middleware = expressMiddleware();
    const req = createMockReq();
    const res = createMockRes();
    let capturedTraceId: string | undefined;

    middleware(req, res, () => {
      capturedTraceId = currentTraceId();
    });

    expect(capturedTraceId).toBeDefined();
    expect(capturedTraceId).toBe(req.traceId);
  });

  it("should emit a trace event when the response finishes", () => {
    const middleware = expressMiddleware();
    const req = createMockReq({ method: "POST", route: { path: "/users" } });
    const res = createMockRes();
    res.statusCode = 201;

    middleware(req, res, vi.fn());

    // Simulate response finishing.
    res.emit("finish");

    const events = (_getEmittedEvents as any)();
    expect(events.length).toBe(1);
    expect(events[0].type).toBe("trace");
    expect(events[0].payload.method).toBe("POST");
    expect(events[0].payload.route).toBe("/users");
    expect(events[0].payload.statusCode).toBe(201);
    expect(typeof events[0].payload.duration).toBe("number");
    expect(events[0].payload.duration).toBeGreaterThanOrEqual(0);
    expect(typeof events[0].payload.traceId).toBe("string");
  });

  it("should generate unique traceIds per request", () => {
    const middleware = expressMiddleware();
    const ids: string[] = [];

    for (let i = 0; i < 5; i++) {
      const req = createMockReq();
      const res = createMockRes();
      middleware(req, res, vi.fn());
      ids.push(req.traceId);
    }

    const unique = new Set(ids);
    expect(unique.size).toBe(5);
  });

  it("should use originalUrl when route.path is not available", () => {
    const middleware = expressMiddleware();
    const req = createMockReq({ route: undefined, originalUrl: "/fallback" });
    const res = createMockRes();

    middleware(req, res, vi.fn());
    res.emit("finish");

    const events = (_getEmittedEvents as any)();
    expect(events[0].payload.route).toBe("/fallback");
  });
});

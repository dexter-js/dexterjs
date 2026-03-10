import { describe, it, expect, expectTypeOf } from "vitest";
import type {
  TraceEvent,
  LogEvent,
  SpanEvent,
  MetricEvent,
  DexterConfig,
  EventEnvelope,
  EventBatch,
} from "@dexter.js/types";

describe("@dexter.js/types", () => {
  describe("TraceEvent", () => {
    it("should accept a valid trace event object", () => {
      const event: TraceEvent = {
        traceId: "abc-123",
        method: "GET",
        route: "/users",
        statusCode: 200,
        duration: 42.5,
        timestamp: Date.now(),
      };

      expect(event.traceId).toBe("abc-123");
      expect(event.method).toBe("GET");
      expect(event.route).toBe("/users");
      expect(event.statusCode).toBe(200);
      expect(typeof event.duration).toBe("number");
      expect(typeof event.timestamp).toBe("number");
    });

    it("should have the correct shape", () => {
      expectTypeOf<TraceEvent>().toHaveProperty("traceId");
      expectTypeOf<TraceEvent>().toHaveProperty("method");
      expectTypeOf<TraceEvent>().toHaveProperty("route");
      expectTypeOf<TraceEvent>().toHaveProperty("statusCode");
      expectTypeOf<TraceEvent>().toHaveProperty("duration");
      expectTypeOf<TraceEvent>().toHaveProperty("timestamp");
    });
  });

  describe("LogEvent", () => {
    it("should accept a valid log event with optional metadata", () => {
      const log: LogEvent = {
        traceId: "trace-1",
        level: "info",
        message: "User created",
        metadata: { userId: 42 },
        timestamp: Date.now(),
      };

      expect(log.level).toBe("info");
      expect(log.metadata).toEqual({ userId: 42 });
    });

    it("should allow metadata to be omitted", () => {
      const log: LogEvent = {
        traceId: "trace-2",
        level: "error",
        message: "Something went wrong",
        timestamp: Date.now(),
      };

      expect(log.metadata).toBeUndefined();
    });

    it("should enforce valid log levels", () => {
      const validLevels = ["debug", "info", "warn", "error", "fatal"] as const;
      for (const level of validLevels) {
        const log: LogEvent = {
          traceId: "t",
          level,
          message: "test",
          timestamp: 0,
        };
        expect(log.level).toBe(level);
      }
    });
  });

  describe("SpanEvent", () => {
    it("should accept db, http, and redis span types", () => {
      const types = ["db", "http", "redis"] as const;
      for (const type of types) {
        const span: SpanEvent = {
          traceId: "s-1",
          type,
          target: "SELECT 1",
          duration: 10,
          timestamp: Date.now(),
        };
        expect(span.type).toBe(type);
      }
    });

    it("should allow optional error field", () => {
      const spanOk: SpanEvent = {
        traceId: "s-2",
        type: "db",
        target: "SELECT 1",
        duration: 5,
        timestamp: Date.now(),
      };
      expect(spanOk.error).toBeUndefined();

      const spanErr: SpanEvent = {
        ...spanOk,
        error: "timeout",
      };
      expect(spanErr.error).toBe("timeout");
    });
  });

  describe("MetricEvent", () => {
    it("should accept a valid metric snapshot", () => {
      const metric: MetricEvent = {
        cpuUsage: 1.5,
        memoryUsage: 104857600,
        eventLoopLag: 2.3,
        activeHandles: 7,
        timestamp: Date.now(),
      };

      expect(metric.cpuUsage).toBe(1.5);
      expect(metric.memoryUsage).toBe(104857600);
      expect(metric.eventLoopLag).toBe(2.3);
      expect(metric.activeHandles).toBe(7);
    });
  });

  describe("DexterConfig", () => {
    it("should allow all fields to be optional", () => {
      const empty: DexterConfig = {};
      expect(empty.port).toBeUndefined();
      expect(empty.autoSpawn).toBeUndefined();
      expect(empty.sidecarPath).toBeUndefined();
    });

    it("should accept partial config", () => {
      const cfg: DexterConfig = { port: 5000 };
      expect(cfg.port).toBe(5000);
    });
  });

  describe("EventEnvelope", () => {
    it("should discriminate on the type field", () => {
      const traceEnvelope: EventEnvelope = {
        type: "trace",
        payload: {
          traceId: "t",
          method: "GET",
          route: "/",
          statusCode: 200,
          duration: 1,
          timestamp: 0,
        },
      };

      const logEnvelope: EventEnvelope = {
        type: "log",
        payload: {
          traceId: "t",
          level: "info",
          message: "hello",
          timestamp: 0,
        },
      };

      expect(traceEnvelope.type).toBe("trace");
      expect(logEnvelope.type).toBe("log");
    });
  });

  describe("EventBatch", () => {
    it("should bundle multiple envelopes with a sentAt timestamp", () => {
      const batch: EventBatch = {
        events: [
          {
            type: "trace",
            payload: {
              traceId: "t",
              method: "POST",
              route: "/users",
              statusCode: 201,
              duration: 10,
              timestamp: 0,
            },
          },
          {
            type: "metric",
            payload: {
              cpuUsage: 0.5,
              memoryUsage: 1024,
              eventLoopLag: 0.1,
              activeHandles: 3,
              timestamp: 0,
            },
          },
        ],
        sentAt: Date.now(),
      };

      expect(batch.events).toHaveLength(2);
      expect(typeof batch.sentAt).toBe("number");
    });
  });
});

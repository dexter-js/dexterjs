export { init, getEmitter } from "./init";
export { SocketEmitter } from "./emitter";
export { traceStore, currentTraceId } from "./context";
export { LogCollector } from "./collectors/log";
export { MetricsCollector } from "./collectors/metrics";

// Instrumentors — import individually to register hooks.
export { expressMiddleware } from "./instrumentors/express";
export { instrumentPg } from "./instrumentors/pg";
export { instrumentMongoose } from "./instrumentors/mongoose";
export { instrumentRedis } from "./instrumentors/redis";
export { instrumentHttp } from "./instrumentors/http";

// Re-export shared types for consumer convenience.
export type {
  TraceEvent,
  LogEvent,
  SpanEvent,
  MetricEvent,
  DexterConfig,
  EventEnvelope,
  EventBatch,
} from "@dexterjs/types";

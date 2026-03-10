// ─── Trace Event ──────────────────────────────────────────────────────────────
/** Represents an HTTP request trace captured by the express instrumentor. */
export interface TraceEvent {
  traceId: string;
  method: string;
  route: string;
  statusCode: number;
  duration: number;
  timestamp: number;
}

// ─── Log Event ────────────────────────────────────────────────────────────────
export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

/** Structured log entry produced by LogCollector. */
export interface LogEvent {
  traceId: string;
  level: LogLevel;
  message: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

// ─── Span Event ───────────────────────────────────────────────────────────────
export type SpanType = "db" | "http" | "redis";

/** Tracks a sub-operation (database query, outbound HTTP call, Redis command). */
export interface SpanEvent {
  traceId: string;
  type: SpanType;
  target: string;
  duration: number;
  timestamp: number;
  error?: string;
}

// ─── Metric Event ─────────────────────────────────────────────────────────────
/** Periodic system-level metrics snapshot. */
export interface MetricEvent {
  cpuUsage: number;
  memoryUsage: number;
  eventLoopLag: number;
  activeHandles: number;
  timestamp: number;
}

// ─── Dexter Config ────────────────────────────────────────────────────────────
/** Configuration for DexterJS SDK initialisation. */
export interface DexterConfig {
  /** Port for the sidecar HTTP dashboard (default: 4000). */
  port?: number;
  /** Whether to automatically spawn the sidecar process (default: true). */
  autoSpawn?: boolean;
  /** Path to the sidecar executable / entry file. */
  sidecarPath?: string;
}

// ─── Internal Protocol ────────────────────────────────────────────────────────
/** Envelope sent over the Unix socket from SDK → sidecar. */
export type EventEnvelope =
  | { type: "trace"; payload: TraceEvent }
  | { type: "log"; payload: LogEvent }
  | { type: "span"; payload: SpanEvent }
  | { type: "metric"; payload: MetricEvent };

/** Batch of envelopes flushed by SocketEmitter. */
export interface EventBatch {
  events: EventEnvelope[];
  sentAt: number;
}

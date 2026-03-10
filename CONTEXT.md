# DexterJS — Codebase Context File

> **Last updated:** 2026-03-10
> Use this file to onboard AI agents or new contributors to the full codebase.

---

## 1. Project Overview

**DexterJS** is a lightweight Node.js observability library for solo developers. It auto-instruments Express apps, database queries (pg, Mongoose, Redis, Prisma, Drizzle), and outbound HTTP calls, then ships everything to a local sidecar process for storage and analysis. Everything runs locally — no external services required.

- **Repo location:** `/home/ervishal/Desktop/dexter/dexterjs`
- **Language:** TypeScript (strict mode, ES2022, CommonJS)
- **Package manager:** pnpm 9.1.0 (monorepo with workspace protocol)
- **Test framework:** Vitest 4.0.18
- **Node.js minimum:** 18.0.0
- **Total TypeScript:** ~4,340 lines across 38 source files + 730-line HTML dashboard
- **Test coverage:** 103 tests across 10 suites (all passing)
- **npm org:** `@dexter.js`

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                Your Express App (:3000)                         │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │   @dexter.js │  │  @dexter.js  │  │    @dexter.js/monitor │ │
│  │   /logger    │  │  /monitor    │  │    instrumentors      │ │
│  │              │  │              │  │                       │ │
│  │ createLogger │  │  monitor()   │  │  Express · pg         │ │
│  │ child()      │  │  emitter     │  │  Mongoose · Redis     │ │
│  │ redaction    │  │  metrics     │  │  HTTP · Prisma        │ │
│  │              │  │              │  │  Drizzle              │ │
│  └──────┬───────┘  └──────┬───────┘  └───────────┬───────────┘ │
│         │                 │                      │             │
│         └─────────────────┼──────────────────────┘             │
│                           ▼                                    │
│                ┌──────────────────┐                             │
│                │  SocketEmitter   │                             │
│                │  (batch 500ms)   │                             │
│                └────────┬─────────┘                             │
└─────────────────────────┼───────────────────────────────────────┘
                          │
                          │ Unix socket (/tmp/dexter.sock)
                          │ Newline-delimited JSON (EventBatch)
                          ▼
┌────────────────────────────────────────────────────┐
│              DexterJS Sidecar (:4000)              │
│                                                     │
│  ┌──────────┐  ┌────────────┐  ┌───────────────┐  │
│  │  SQLite   │  │ Aggregator │  │  HTTP API +   │  │
│  │(WAL mode) │  │  (5s cycle)│  │  Dashboard UI │  │
│  │           │  │            │  │               │  │
│  │ requests  │  │ p50/p95/99 │  │ GET /         │  │
│  │ logs      │  │ N+1 detect │  │ /api/overview │  │
│  │ spans     │  │ slow query │  │ /api/routes   │  │
│  │ metrics   │  │ error rate │  │ /api/logs     │  │
│  └──────────┘  └────────────┘  │ /api/spans    │  │
│                                │ /api/insights │  │
│                                └───────────────┘  │
└────────────────────────────────────────────────────┘
```

### Data Flow
1. **App code** calls logger methods (`log.info(...)`) or instrumented libraries trigger spans
2. **SocketEmitter** buffers events and flushes every 500ms over Unix domain socket (`/tmp/dexter.sock`)
3. **Sidecar** receives newline-delimited JSON `EventBatch`, persists to SQLite via `ingestBatch()`
4. **Aggregator** runs every 5s computing route percentiles and insight rules
5. **Dashboard** (HTML) polls `/api/*` endpoints every 3s and renders visualizations

---

## 3. Monorepo Structure

```
dexterjs/
├── packages/
│   ├── logger/        # @dexter.js/logger (v0.1.0) — standalone structured logger
│   ├── monitor/       # @dexter.js/monitor (v0.1.0) — instrumentation + sidecar spawning
│   ├── sdk/           # @dexter.js/sdk (v0.1.0) — meta package re-exporting logger + monitor
│   └── sidecar/       # @dexter.js/sidecar (v0.1.0) — collector, storage, dashboard
├── shared/
│   └── types/         # @dexter.js/types (v0.1.0, private) — shared TypeScript interfaces
├── examples/
│   └── express-app/   # @dexter.js/example-express (private) — demo app
├── tests/             # 10 vitest test files
├── package.json       # Root workspace config
├── pnpm-workspace.yaml
├── tsconfig.base.json # Shared TS compiler options
├── vitest.config.ts   # Test runner config with path aliases
├── README.md
└── CONTEXT.md         # This file
```

### Package Dependency Graph

```
@dexter.js/sdk (meta)
├── @dexter.js/logger (zero runtime deps)
└── @dexter.js/monitor
    ├── @dexter.js/sidecar
    │   ├── @dexter.js/types
    │   ├── better-sqlite3
    │   └── express
    └── @dexter.js/types
```

### Package Summary Table

| Package | npm Name | Version | Runtime Deps | Purpose |
|---|---|---|---|---|
| `packages/logger` | `@dexter.js/logger` | 0.1.0 | **Zero** | Standalone structured logger |
| `packages/monitor` | `@dexter.js/monitor` | 0.1.0 | `@dexter.js/sidecar`, `@dexter.js/types` | Auto-instrumentation + sidecar spawning |
| `packages/sdk` | `@dexter.js/sdk` | 0.1.0 | `@dexter.js/logger`, `@dexter.js/monitor` | Meta re-export package |
| `packages/sidecar` | `@dexter.js/sidecar` | 0.1.0 | `better-sqlite3`, `express`, `@dexter.js/types` | SQLite storage + HTTP dashboard |
| `shared/types` | `@dexter.js/types` | 0.1.0 | None | Shared TypeScript interfaces (private) |

---

## 4. Package Details

### 4.1 `@dexter.js/logger` — Standalone Logger

**Location:** `packages/logger/` (928 lines across 7 source files)
**Zero runtime dependencies.** Only `@types/node` and `typescript` as devDeps.

#### Files

| File | Lines | Purpose |
|---|---|---|
| `src/types.ts` | 87 | `LogLevel`, `FileOptions`, `LoggerOptions`, `LogEntry`, `Transport` interface |
| `src/logger.ts` | 251 | `Logger` class, `createLogger()` factory, `InternalOptions`, `redactFields()` |
| `src/transports/terminal.ts` | 118 | `TerminalTransport` — ANSI-colored console output (pretty/json/minimal) |
| `src/transports/file.ts` | 245 | `FileTransport` — file logging with size-based rotation, gzip compression, split by level |
| `src/transports/sidecar.ts` | 87 | `SidecarTransport` — sends logs to sidecar via Unix socket, fallback to terminal |
| `src/index.ts` | 20 | Barrel exports + default `logger` singleton |

#### Key APIs

```typescript
// Factory
createLogger(options?: LoggerOptions): Logger

// Logger class
Logger.info(message: string, metadata?: Record<string, unknown>): void
Logger.warn(message: string, metadata?: Record<string, unknown>): void
Logger.error(message: string, metadata?: Record<string, unknown>): void
Logger.debug(message: string, metadata?: Record<string, unknown>): void
Logger.child(context: Record<string, unknown>): Logger  // merged context
Logger.connectToSidecar(socketPath?: string): void       // called by monitor()
Logger.flush(): void
Logger.close(): void
```

#### LoggerOptions

```typescript
{
  level?: "debug" | "info" | "warn" | "error",      // default: "info"
  format?: "json" | "pretty" | "minimal",            // default: env-based
  env?: "development" | "production",                 // default: NODE_ENV
  transport?: "auto" | "terminal" | "file" | "both",  // default: "auto"
  file?: FileOptions,                                  // required if transport includes "file"
  context?: Record<string, unknown>,                   // static fields on every log
  async?: boolean,                                     // default: true
  bufferSize?: number,                                 // default: 100
  redact?: string[],                                   // field names to recursively redact
}
```

#### Key Implementation Details
- **Level filtering:** `LOG_LEVEL_PRIORITY` map — debug(0) < info(1) < warn(2) < error(3)
- **Redaction:** `redactFields()` recursively walks metadata objects/arrays, replaces matching field names (case-insensitive) with `"[REDACTED]"`
- **Transport resolution (auto mode):** development → terminal, production → file (if file config exists) else terminal
- **Child loggers:** Share parent's transport array (no duplicate file handles/sockets), merge context with `{...parent, ...child}`
- **Async writes:** Buffer with configurable size, flush on interval (50ms terminal, 100ms file, 500ms sidecar) or when buffer full
- **File rotation:** Size-based — rename with date suffix, optional gzip via `zlib.gzipSync()`, cleanup files older than `maxFiles` days

---

### 4.2 `@dexter.js/monitor` — Auto-Instrumentation

**Location:** `packages/monitor/` (775 lines across 11 source files)
**Deps:** `@dexter.js/sidecar`, `@dexter.js/types`
**Optional peer deps:** express, pg, mongoose, ioredis, axios, @prisma/client, drizzle-orm

#### Files

| File | Lines | Purpose |
|---|---|---|
| `src/init.ts` | 126 | `monitor()` entry point, `init()` legacy alias, sidecar spawning, `MonitorOptions` |
| `src/context.ts` | 12 | `AsyncLocalStorage`-based `traceStore`, `currentTraceId()` |
| `src/emitter.ts` | 70 | `SocketEmitter` — batches events, flushes over Unix socket every 500ms |
| `src/collectors/log.ts` | 57 | `LogCollector` — structured logging with auto traceId attachment |
| `src/collectors/metrics.ts` | 61 | `MetricsCollector` — CPU, memory, event-loop lag every 5s via `perf_hooks` |
| `src/instrumentors/express.ts` | 59 | Express middleware — UUID traceId, AsyncLocalStorage, trace events on `res.finish` |
| `src/instrumentors/pg.ts` | 84 | Wraps `Client.prototype.query`, emits DB spans (truncates to 200 chars) |
| `src/instrumentors/mongoose.ts` | 77 | Global Mongoose plugin with pre/post hooks on 10 operations |
| `src/instrumentors/redis.ts` | 80 | Wraps `sendCommand` on ioredis instances |
| `src/instrumentors/http.ts` | 126 | Patches `globalThis.fetch` + Axios interceptors |
| `src/instrumentors/prisma.ts` | 80 | Uses `$extends` client extensions API (not deprecated middleware) |
| `src/instrumentors/drizzle.ts` | 55 | `DexterDrizzleLogger` class with `logQuery()` method |
| `src/index.ts` | 25 | Barrel exports |

#### Key APIs

```typescript
// Main entry
monitor(options: MonitorOptions): SocketEmitter
init(config?: DexterConfig): SocketEmitter  // legacy alias

// MonitorOptions
{
  app: any,                    // Express app instance
  logger?: any,                // @dexter.js/logger instance (calls connectToSidecar)
  port?: number,               // sidecar HTTP port (default: 4000)
  autoSpawn?: boolean,         // auto-start sidecar (default: true)
  socketPath?: string,         // Unix socket path (default: /tmp/dexter.sock)
  sidecarPath?: string,        // custom sidecar entry point
}

// Context
traceStore: AsyncLocalStorage<{ traceId: string }>
currentTraceId(): string  // returns "unknown" if no context

// Instrumentors
expressMiddleware(): (req, res, next) => void
instrumentPg(ClientClass: any): void
instrumentMongoose(mongoose: any): void
instrumentRedis(redisInstance: any): void
instrumentHttp(options?: { axios?: any }): void
instrumentPrisma<T>(client: T): T
dexterDrizzleLogger: DexterDrizzleLogger  // pass to Drizzle's logger option

// Collectors
new LogCollector(emitter: SocketEmitter)
new MetricsCollector(emitter: SocketEmitter)
```

#### Key Implementation Details
- **Singleton pattern:** `_emitter`, `_sidecarProcess`, `_metricsCollector` are module-level singletons; `monitor()` is idempotent
- **Sidecar spawning:** `spawn(process.execPath, [sidecarEntry])` with `detached: false`, `stdio: "ignore"`, unref'd
- **Graceful shutdown:** Hooks into `SIGINT`, `SIGTERM`, `beforeExit` — stops metrics, emitter, kills sidecar
- **Express middleware:** Creates UUID via `randomUUID()`, wraps handler in `traceStore.run()`, emits trace on `res.finish`
- **pg instrumentor:** Monkey-patches `prototype.query`, handles Promise and callback patterns, truncates SQL to 200 chars
- **Prisma instrumentor:** Uses `$extends` with `$allModels.$allOperations` to intercept all queries
- **Drizzle instrumentor:** Implements Drizzle's logger interface, emits span in `logQuery()`

---

### 4.3 `@dexter.js/sdk` — Meta Package

**Location:** `packages/sdk/` (5 lines of source)
**Deps:** `@dexter.js/logger`, `@dexter.js/monitor`

Simply re-exports everything:
```typescript
export * from "@dexter.js/logger";
export * from "@dexter.js/monitor";
```

---

### 4.4 `@dexter.js/sidecar` — Storage & Dashboard

**Location:** `packages/sidecar/` (602 lines across 6 source files + 730-line dashboard.html)
**Deps:** `better-sqlite3`, `express`, `@dexter.js/types`

#### Files

| File | Lines | Purpose |
|---|---|---|
| `src/index.ts` | 57 | Express server setup, socket server, aggregator start, graceful shutdown |
| `src/db.ts` | 89 | SQLite singleton via `better-sqlite3`, WAL mode, 4 tables + 7 indexes |
| `src/ingest.ts` | 84 | `ingestBatch()` — transactional insert of `EventBatch` into SQLite |
| `src/socket.ts` | 50 | Unix domain socket server, parses newline-delimited JSON batches |
| `src/aggregator.ts` | 227 | `Aggregator` class — `getRouteStats()`, `getInsights()`, `getOverview()` |
| `src/routes/api.ts` | 95 | Express router: `/api/overview`, `/api/routes`, `/api/logs`, `/api/spans`, `/api/insights` |
| `src/dashboard.html` | 730 | Dark-themed HTML dashboard with 4 tabs, auto-refresh every 3s |

#### Database Schema (SQLite)

```sql
-- requests: HTTP request traces
CREATE TABLE requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  traceId TEXT NOT NULL,
  method TEXT NOT NULL,
  route TEXT NOT NULL,
  statusCode INTEGER NOT NULL,
  duration REAL NOT NULL,
  timestamp INTEGER NOT NULL
);

-- logs: Structured log entries
CREATE TABLE logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  traceId TEXT NOT NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata TEXT,              -- JSON string or NULL
  timestamp INTEGER NOT NULL
);

-- spans: Sub-operation traces (db, http, redis)
CREATE TABLE spans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  traceId TEXT NOT NULL,
  type TEXT NOT NULL,          -- 'db' | 'http' | 'redis'
  target TEXT NOT NULL,
  duration REAL NOT NULL,
  timestamp INTEGER NOT NULL,
  error TEXT                   -- NULL if no error
);

-- metrics: System-level snapshots (every 5s)
CREATE TABLE metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cpuUsage REAL NOT NULL,
  memoryUsage REAL NOT NULL,
  eventLoopLag REAL NOT NULL,
  activeHandles INTEGER NOT NULL,
  timestamp INTEGER NOT NULL
);

-- Indexes
idx_requests_route, idx_requests_timestamp,
idx_logs_traceId, idx_logs_timestamp,
idx_spans_traceId, idx_spans_type,
idx_metrics_timestamp
```

#### REST API

| Endpoint | Method | Description | Query Params |
|---|---|---|---|
| `/` | GET | Dashboard HTML | — |
| `/health` | GET | `{ name, status, port }` | — |
| `/api/overview` | GET | Total requests, error rate, avg response time, CPU, memory, event loop lag | — |
| `/api/routes` | GET | Per-route stats: count, p50/p95/p99, error rate | — |
| `/api/logs` | GET | Recent logs with parsed metadata | `?traceId=`, `?limit=` (max 1000) |
| `/api/spans` | GET | Spans for a specific trace | `?traceId=` (required) |
| `/api/insights` | GET | N+1 detection, slow queries, high error rates, hot routes | — |

#### Insight Rules
- **N+1 detection:** ≥5 DB spans per traceId
- **Slow queries:** DB spans with duration ≥500ms
- **High error rate:** Routes with ≥10% error rate and ≥5 requests
- **Hot routes:** Top 3 routes by request count (minimum 10)

---

### 4.5 `@dexter.js/types` — Shared Interfaces

**Location:** `shared/types/` (70 lines)
**Private package** — not published to npm.

```typescript
// Core event types
TraceEvent    { traceId, method, route, statusCode, duration, timestamp }
LogEvent      { traceId, level, message, metadata?, timestamp }
SpanEvent     { traceId, type, target, duration, timestamp, error? }
MetricEvent   { cpuUsage, memoryUsage, eventLoopLag, activeHandles, timestamp }

// Config
DexterConfig  { port?, autoSpawn?, sidecarPath? }

// Protocol
EventEnvelope = { type: "trace"|"log"|"span"|"metric", payload: ... }
EventBatch    { events: EventEnvelope[], sentAt: number }
```

---

## 5. Configuration Files

### TypeScript (`tsconfig.base.json`)
- Target: ES2022, Module: CommonJS, Strict: true
- Composite + incremental builds for project references
- Declaration + source maps enabled
- Each package extends base and sets `outDir: ./dist`, `rootDir: ./src`

### Vitest (`vitest.config.ts`)
Path aliases for test resolution (maps `@dexter.js/*` → source directories):
```typescript
{
  "@dexter.js/types":   "shared/types/src",
  "@dexter.js/logger":  "packages/logger/src",
  "@dexter.js/monitor": "packages/monitor/src",
  "@dexter.js/sdk":     "packages/sdk/src",
  "@dexter.js/sidecar": "packages/sidecar/src",
}
```
- `testTimeout: 15_000` (integration tests spawn a sidecar process)
- `hookTimeout: 10_000`

### pnpm Workspace (`pnpm-workspace.yaml`)
```yaml
packages:
  - "packages/*"
  - "shared/*"
  - "examples/*"
```

---

## 6. Test Suites

All 103 tests pass. Run with `pnpm test` or `npx vitest run`.

| File | Tests | What It Covers |
|---|---|---|
| `tests/logger.test.ts` | 35 | createLogger(), log methods, level filtering, child loggers, redaction, transport resolution, connectToSidecar, flush/close |
| `tests/types.test.ts` | 17 | Type shape validation for TraceEvent, LogEvent, SpanEvent, MetricEvent, DexterConfig, EventEnvelope, EventBatch |
| `tests/sidecar.test.ts` | 12 | SQLite schema creation, ingestion of all 4 event types, mixed batches, aggregator logic (percentiles, N+1 detection, slow queries, overview) |
| `tests/integration.test.ts` | 11 | End-to-end: spawns real sidecar process, sends events over Unix socket, verifies API responses (/health, /api/overview, /api/routes, /api/logs, /api/insights) |
| `tests/sdk-express.test.ts` | 6 | Express middleware: next() called, traceId attached, AsyncLocalStorage propagation, trace event emitted on finish, unique IDs, originalUrl fallback |
| `tests/sdk-emitter.test.ts` | 7 | SocketEmitter: instantiation, emit without throw, buffering, start/stop idempotency, graceful drop on unreachable socket |
| `tests/sdk-pg.test.ts` | 5 | pg instrumentor: prototype wrapping, span emission on resolve/reject, missing query warning, long query truncation |
| `tests/sdk-log-collector.test.ts` | 5 | LogCollector: level+message, traceId from AsyncLocalStorage, all convenience methods, metadata pass-through |
| `tests/sdk-metrics-collector.test.ts` | 6 | MetricsCollector: instantiation, start/stop, metric emission on timer, no emission before interval, stop prevents future emissions |
| `tests/sdk-context.test.ts` | 5 | AsyncLocalStorage: "unknown" default, traceStore.run(), restoration after exit, nested contexts, async propagation |

### Test Import Patterns
- Tests use **subpath imports** like `@dexter.js/monitor/emitter`, `@dexter.js/monitor/context`
- These resolve via vitest aliases to source directories (e.g., `packages/monitor/src/emitter.ts`)
- `vi.mock("@dexter.js/monitor/init", ...)` is used in express and pg tests to inject controlled emitters

---

## 7. Build & Dev Commands

```bash
# Install dependencies
pnpm install

# Build all packages (order resolved by pnpm via project references)
pnpm run build

# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Clean all build artifacts
pnpm run clean

# Start the example app (requires build first)
cd examples/express-app && pnpm start

# Build order (automatic):
# 1. shared/types → 2. packages/logger → 3. packages/sidecar
# → 4. packages/monitor → 5. packages/sdk → 6. examples/express-app
```

---

## 8. Communication Protocol

### SDK → Sidecar (Unix Socket)

**Socket path:** `/tmp/dexter.sock`
**Format:** Newline-delimited JSON

```json
{
  "events": [
    { "type": "trace", "payload": { "traceId": "uuid", "method": "GET", "route": "/users", "statusCode": 200, "duration": 42.5, "timestamp": 1710000000000 } },
    { "type": "log", "payload": { "traceId": "uuid", "level": "info", "message": "hello", "metadata": { "key": "val" }, "timestamp": 1710000000000 } },
    { "type": "span", "payload": { "traceId": "uuid", "type": "db", "target": "SELECT 1", "duration": 5.2, "timestamp": 1710000000000, "error": null } },
    { "type": "metric", "payload": { "cpuUsage": 0.8, "memoryUsage": 104857600, "eventLoopLag": 1.2, "activeHandles": 5, "timestamp": 1710000000000 } }
  ],
  "sentAt": 1710000000000
}
```

---

## 9. Usage Patterns

### Pattern 1 — Logger Only (zero deps)
```typescript
import { createLogger } from "@dexter.js/logger";
const log = createLogger({ level: "debug", format: "pretty", redact: ["password"] });
log.info("started", { port: 3000 });
const child = log.child({ requestId: "abc" });
child.info("handling request");
```

### Pattern 2 — Monitor Only
```typescript
import { monitor, expressMiddleware, instrumentPg } from "@dexter.js/monitor";
instrumentPg(Pool);
app.use(expressMiddleware());
monitor({ app });
```

### Pattern 3 — Logger + Monitor Together
```typescript
import { createLogger } from "@dexter.js/logger";
import { monitor, expressMiddleware } from "@dexter.js/monitor";
const log = createLogger({ level: "debug" });
app.use(expressMiddleware());
monitor({ app, logger: log }); // logs flow through sidecar automatically
```

### Pattern 4 — Everything via Meta Package
```typescript
import { createLogger, monitor, expressMiddleware, instrumentPg } from "@dexter.js/sdk";
```

---

## 10. Git History

31 commits on `main` branch. Key milestones:

```
3a8955e  chore: update package versions to 0.1.0
88c434b  chore: update example app, vitest config, and lockfile
94316d7  docs: rewrite README for multi-package architecture
79b190f  test(logger): add comprehensive logger test suite — 35 tests
a5fcc93  refactor(tests): migrate imports from sdk to monitor subpaths
f954b7e  refactor(sdk): convert to meta package re-exporting logger + monitor
4e39ef4  refactor: extract sdk into monitor package
9cf759d  feat(logger): add standalone structured logger package
8fbdd4b  chore: initial publish to npm
88c651c  fix: update npm scope to match dexter.js org
6682d1d  feat: rebuild dashboard — dark lab theme, 4 tabs, live refresh
2113c96  add test suites — 68 tests across 9 files
4e08591  init project — pnpm monorepo setup
```

---

## 11. Key Design Decisions

1. **Zero deps for logger:** `@dexter.js/logger` uses only Node.js built-ins (`fs`, `path`, `zlib`, `net`), making it usable anywhere without dependency concerns.

2. **AsyncLocalStorage for traceId:** All instrumentors use `traceStore.run()` to propagate traceId across async boundaries without manual threading.

3. **Unix domain socket (not HTTP):** SDK→sidecar communication uses `/tmp/dexter.sock` for minimal overhead. Events are batched (500ms) and flushed as newline-delimited JSON.

4. **SQLite with WAL mode:** The sidecar uses `better-sqlite3` (synchronous API) with Write-Ahead Logging for concurrent reads during writes; all inserts are wrapped in transactions.

5. **Never crash the host app:** All instrumentation wraps operations in try/catch. Socket errors are silently swallowed. Transport failures are caught and ignored.

6. **Monkey-patch pattern for instrumentors:** pg/mongoose/redis use prototype wrapping or plugin hooks at the module level, called once before creating instances. Prisma uses the modern `$extends` API.

7. **Sidecar as child process:** `monitor()` spawns the sidecar via `child_process.spawn()` with `detached: false` and `unref()` so it doesn't block app shutdown.

8. **Singleton emitter:** The `SocketEmitter` is module-scoped in `init.ts` — `monitor()` and `getEmitter()` share the same instance. Instrumentors call `getEmitter()` lazily.

---

## 12. File-by-File Reference

### Source Files (4,340 lines total)

```
packages/logger/src/types.ts ................  87 lines
packages/logger/src/logger.ts ...............  251 lines
packages/logger/src/transports/terminal.ts ..  118 lines
packages/logger/src/transports/file.ts ......  245 lines
packages/logger/src/transports/sidecar.ts ...  87 lines
packages/logger/src/index.ts ................  20 lines

packages/monitor/src/init.ts ................  126 lines
packages/monitor/src/context.ts .............  12 lines
packages/monitor/src/emitter.ts .............  70 lines
packages/monitor/src/collectors/log.ts ......  57 lines
packages/monitor/src/collectors/metrics.ts ..  61 lines
packages/monitor/src/instrumentors/express.ts  59 lines
packages/monitor/src/instrumentors/pg.ts ....  84 lines
packages/monitor/src/instrumentors/mongoose.ts 77 lines
packages/monitor/src/instrumentors/redis.ts .  80 lines
packages/monitor/src/instrumentors/http.ts ..  126 lines
packages/monitor/src/instrumentors/prisma.ts   80 lines
packages/monitor/src/instrumentors/drizzle.ts  55 lines
packages/monitor/src/index.ts ...............  25 lines

packages/sdk/src/index.ts ..................  5 lines

packages/sidecar/src/index.ts ..............  57 lines
packages/sidecar/src/db.ts .................  89 lines
packages/sidecar/src/ingest.ts .............  84 lines
packages/sidecar/src/socket.ts .............  50 lines
packages/sidecar/src/aggregator.ts ..........  227 lines
packages/sidecar/src/routes/api.ts ..........  95 lines
packages/sidecar/src/dashboard.html .........  730 lines

shared/types/src/index.ts ..................  70 lines

examples/express-app/src/index.ts ...........  116 lines
```

### Test Files (1,877 lines total)

```
tests/logger.test.ts .......................  385 lines  (35 tests)
tests/sidecar.test.ts ......................  420 lines  (12 tests)
tests/integration.test.ts ..................  282 lines  (11 tests)
tests/types.test.ts ........................  207 lines  (17 tests)
tests/sdk-express.test.ts ..................  128 lines  (6 tests)
tests/sdk-pg.test.ts .......................  106 lines  (5 tests)
tests/sdk-emitter.test.ts ..................  91 lines   (7 tests)
tests/sdk-metrics-collector.test.ts ........  81 lines   (6 tests)
tests/sdk-log-collector.test.ts ............  65 lines   (5 tests)
tests/sdk-context.test.ts ..................  43 lines   (5 tests)
```

---

## 13. Important Patterns & Conventions

### Import Style
- All internal imports use workspace protocol: `"@dexter.js/sidecar": "workspace:*"`
- Tests use subpath imports: `@dexter.js/monitor/emitter`, `@dexter.js/monitor/context`
- Vitest resolves these via path aliases in `vitest.config.ts`

### Error Handling
- All instrumentors: wrap in try/catch, never throw
- SocketEmitter: `client.on("error", () => {})` — silently drops
- Logger transports: `try { transport.write(entry) } catch {}` in the log method

### Coding Style
- TypeScript strict mode with `noImplicitAny`
- Section headers using box-drawing comments: `// ─── Section Name ───────...`
- Type-only imports: `import type { ... } from "..."`
- All timers call `.unref()` to avoid keeping the event loop alive

### Testing Patterns
- `vi.mock()` for isolating modules (especially `@dexter.js/monitor/init`)
- `vi.spyOn(emitter, "emit")` to capture emitted events
- `vi.useFakeTimers()` for metrics collector interval tests
- Integration tests spawn a real sidecar process and communicate over socket + HTTP

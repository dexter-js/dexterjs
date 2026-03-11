# 🧪 DexterJS

[![License: LGPL v3](https://img.shields.io/badge/License-LGPL_v3-blue.svg)](https://www.gnu.org/licenses/lgpl-3.0)
[![TypeScript](https://img.shields.io/badge/typescript-strict-3b82f6.svg)](tsconfig.base.json)
[![pnpm](https://img.shields.io/badge/pnpm-monorepo-22c55e.svg)](pnpm-workspace.yaml)

> **Your app's secret lab.**

DexterJS is a lightweight Node.js observability library that auto-instruments your Express app, database queries, and outbound HTTP calls — then ships everything to a local sidecar process for storage and analysis. It gives solo developers instant visibility into request traces, structured logs, system metrics, and performance insights through a beautiful dark-themed dashboard. Zero config, zero external services, just plug it in and see what your app is doing.

---

## Quick Start

```bash
# install everything (meta package)
pnpm add @dexter.js/sdk

# or pick what you need
pnpm add @dexter.js/logger    # standalone logger, zero deps
pnpm add @dexter.js/monitor   # auto-instrumentation + sidecar

# from the monorepo
git clone https://github.com/your-username/dexterjs.git
cd dexterjs
pnpm install && pnpm build
```

### Pattern 1 — Logger only (zero dependencies)

```typescript
import { createLogger } from "@dexter.js/logger";

const log = createLogger({
  level: "debug",
  format: "pretty",           // pretty | json | minimal
  redact: ["password", "token"],
});

log.info("server started", { port: 3000 });
log.error("db connection failed", { host: "localhost" });

// child loggers inherit + extend context
const reqLog = log.child({ requestId: "r-123", userId: "u-42" });
reqLog.info("handling request");  // includes requestId + userId automatically
```

### Pattern 2 — Monitor only (auto-instrumentation)

```typescript
import express from "express";
import { monitor, expressMiddleware, instrumentPg } from "@dexter.js/monitor";
import { Pool } from "pg";

const app = express();

instrumentPg(Pool);                 // hooks into pg query pipeline
app.use(expressMiddleware());       // auto-traces every HTTP request

monitor({ app });                   // spawns sidecar, starts metrics collection
app.listen(3000);
// dashboard at http://localhost:4000
```

### Pattern 3 — Logger + Monitor together

```typescript
import express from "express";
import { createLogger } from "@dexter.js/logger";
import { monitor, expressMiddleware, instrumentPg } from "@dexter.js/monitor";
import { Pool } from "pg";

const log = createLogger({ level: "debug", format: "pretty" });
const app = express();

instrumentPg(Pool);
app.use(expressMiddleware());

// Pass the logger to monitor — logs automatically flow through the sidecar
monitor({ app, logger: log });

const reqLog = log.child({ module: "users" });
app.get("/users", (_req, res) => {
  reqLog.info("fetching users");
  res.json([]);
});

app.listen(3000);
```

Open `http://localhost:4000` to see your dashboard.

---

## Architecture

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
                          ▼
┌────────────────────────────────────────────────────┐
│              DexterJS Sidecar (:4000)              │
│                                                     │
│  ┌──────────┐  ┌────────────┐  ┌───────────────┐  │
│  │  SQLite   │  │ Aggregator │  │  HTTP API +   │  │
│  │  (WAL)    │  │  (5s cycle)│  │  Dashboard UI │  │
│  │           │  │            │  │               │  │
│  │ requests  │  │ p50/p95/99 │  │ /api/overview │  │
│  │ logs      │  │ insights   │  │ /api/routes   │  │
│  │ spans     │  │ N+1 detect │  │ /api/logs     │  │
│  │ metrics   │  │            │  │ /api/insights │  │
│  └──────────┘  └────────────┘  └───────────────┘  │
└────────────────────────────────────────────────────┘
```

---

## Features

### Logger (`@dexter.js/logger`)
- **Zero external dependencies** — only Node.js built-ins
- **Structured JSON logging** — machine-readable in production, pretty-printed in dev
- **Multiple transports** — terminal (ANSI colors), file (with rotation + gzip compression), sidecar (Unix socket)
- **Child loggers** — `log.child({ requestId })` inherits parent context and adds new fields
- **Field redaction** — `redact: ["password", "token"]` recursively scrubs sensitive data
- **Auto transport resolution** — development → terminal, production → file (configurable)
- **Async writes** — non-blocking write queue with configurable buffer size
- **Three formats** — `pretty` (colorized), `json` (structured), `minimal` (compact)

### Monitor (`@dexter.js/monitor`)
- **Auto-instrumented Express middleware** — traces every request with route, method, status, duration
- **Database span tracking** — hooks into `pg`, Mongoose, ioredis, **Prisma** ($extends API), **Drizzle** (custom logger)
- **Outbound HTTP spans** — patches `globalThis.fetch` and Axios interceptors
- **System metrics** — CPU, memory, event-loop lag collected every 5s via `perf_hooks`
- **Local sidecar** — auto-spawned child process with SQLite (WAL mode) + Express dashboard

### Sidecar & Dashboard
- **Insights engine** — N+1 query detection, slow query alerts, high error rate warnings
- **Per-route percentiles** — p50/p95/p99 latency breakdowns
- **Dark-themed dashboard** — 4 tabs: Overview, Routes, Logs (with span drill-down), Insights

---

## Monorepo Structure

```
dexterjs/
├── packages/
│   ├── logger/       # @dexter.js/logger — standalone structured logger
│   ├── monitor/      # @dexter.js/monitor — instrumentation + sidecar spawning
│   ├── sdk/          # @dexter.js/sdk — meta package re-exporting logger + monitor
│   └── sidecar/      # @dexter.js/sidecar — collector, storage, dashboard
├── shared/
│   └── types/        # @dexter.js/types — shared TypeScript interfaces
├── examples/
│   └── express-app/  # demo app showing all 3 usage patterns
├── tests/            # vitest — 103 tests across 10 suites
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

| Package | npm Scope | Dependencies |
|---|---|---|
| `@dexter.js/logger` | Standalone | **Zero** runtime deps |
| `@dexter.js/monitor` | Standalone | `@dexter.js/sidecar`, `@dexter.js/types` |
| `@dexter.js/sdk` | Meta | Re-exports `logger` + `monitor` |
| `@dexter.js/sidecar` | Internal | `better-sqlite3`, `express` |
| `@dexter.js/types` | Internal | None |

---

## Built for Solo Developers

DexterJS exists because most observability tools are built for platform teams at large companies. If you're a solo developer or working on a small team, you don't need Datadog. You don't need a Kubernetes sidecar. You don't need to configure OpenTelemetry exporters.

You need to know:
- Which routes are slow?
- Am I doing N+1 queries?
- What's my error rate?
- Is my event loop healthy?

DexterJS answers all of these with **one line of code** and **zero external dependencies**. Everything runs locally. Your data never leaves your machine.

---

## Logger API

```typescript
import { createLogger } from "@dexter.js/logger";

const log = createLogger({
  level: "debug",               // debug | info | warn | error
  format: "pretty",             // pretty | json | minimal
  env: "development",           // development | production (auto-detected from NODE_ENV)
  transport: "auto",            // auto | terminal | file | both
  redact: ["password", "ssn"],  // field names to redact recursively
  context: { service: "api" },  // default context attached to every log
  async: true,                  // non-blocking writes (default: true)
  bufferSize: 100,              // async write buffer size

  // file transport options (only used when transport includes "file")
  file: {
    path: "./logs",
    split: true,                // separate files per level
    filenames: { error: "error.log", combined: "app.log" },
    rotation: {
      maxSize: "50mb",
      maxFiles: 7,              // days to keep
      compress: true,           // gzip old files
    },
  },
});

// standard methods
log.info("server started", { port: 3000 });
log.warn("deprecated endpoint hit", { route: "/v1/old" });
log.error("request failed", { statusCode: 500, duration: 1234 });
log.debug("cache miss", { key: "user:42" });

// child loggers
const reqLog = log.child({ requestId: "abc-123" });
reqLog.info("handling request"); // context: { service: "api", requestId: "abc-123" }

// connect to dexter sidecar (called automatically by monitor())
log.connectToSidecar("/tmp/dexter.sock");

// lifecycle
log.flush();
log.close();
```

---

## Monitor API

```typescript
import {
  monitor,
  expressMiddleware,
  instrumentPg,
  instrumentMongoose,
  instrumentRedis,
  instrumentHttp,
  instrumentPrisma,
  dexterDrizzleLogger,
} from "@dexter.js/monitor";

// instrument before creating clients
instrumentPg(Pool);
instrumentMongoose(mongoose);
instrumentRedis(Redis);
instrumentHttp();

// Prisma — uses $extends (not deprecated middleware)
const prisma = instrumentPrisma(new PrismaClient());

// Drizzle — pass as logger option
const db = drizzle(pool, { logger: dexterDrizzleLogger });

// start monitoring
monitor({
  app,                    // Express app instance
  logger: log,            // optional @dexter.js/logger instance
  port: 4000,             // sidecar HTTP port
  autoSpawn: true,        // auto-start sidecar
  socketPath: "/tmp/dexter.sock",
});
```

---

## Dashboard

The sidecar serves a dark-themed dashboard at `http://localhost:4000`:

| Tab | What it shows |
|---|---|
| **Overview** | Health indicator, total requests, error rate, avg response time, CPU, memory, event loop lag |
| **Routes** | Per-route table with p50/p95/p99, request count, error rate, HOT badges |
| **Logs** | Live log stream with level filters, clickable traceId to expand spans |
| **Insights** | N+1 detection, slow queries, high error rates, hot routes |

---

## REST API

| Endpoint | Description |
|---|---|
| `GET /api/overview` | Health + aggregate stats |
| `GET /api/routes` | Per-route latency percentiles |
| `GET /api/logs` | Recent logs (optional `?traceId=` filter) |
| `GET /api/spans?traceId=` | Spans for a specific trace |
| `GET /api/insights` | Rule-based performance insights |

---

## Roadmap

- [ ] **AI-powered analysis** — use LLMs to explain performance anomalies in plain english
- [ ] **Trace waterfall view** — visual timeline of spans within a request
- [ ] **Alerting** — desktop notifications for error rate spikes
- [ ] **Historical trends** — track p95 over time, spot regressions
- [ ] **OpenTelemetry export** — optional bridge to external APM tools
- [ ] **WebSocket dashboard** — real-time streaming instead of polling
- [ ] **Custom instrumentors** — plugin API for user-defined span hooks

---

## Contributing

Contributions are welcome! This is a solo-dev-first tool, so keep that in mind:

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Make your changes
4. Run tests (`pnpm test`)
5. Open a PR

Please keep PRs focused and small. If you're adding a new instrumentor, look at the existing ones in `packages/monitor/src/instrumentors/` for the pattern.

---

## License

LGPL-3.0-or-later — see `LICENSE` for the full text and `LICENSE_FAQ.md` for a plain English summary.

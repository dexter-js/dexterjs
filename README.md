# 🧪 DexterJS

[![MIT License](https://img.shields.io/badge/license-MIT-a855f7.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/typescript-strict-3b82f6.svg)](tsconfig.base.json)
[![pnpm](https://img.shields.io/badge/pnpm-monorepo-22c55e.svg)](pnpm-workspace.yaml)

> **Your app's secret lab.**

DexterJS is a lightweight Node.js observability library that auto-instruments your Express app, database queries, and outbound HTTP calls — then ships everything to a local sidecar process for storage and analysis. It gives solo developers instant visibility into request traces, structured logs, system metrics, and performance insights through a beautiful dark-themed dashboard. Zero config, zero external services, just plug it in and see what your app is doing.

---

## Quick Start

```bash
# install
pnpm add @dexter.js/sdk

# or from the monorepo
git clone https://github.com/your-username/dexterjs.git
cd dexterjs
pnpm install && pnpm build
```

```typescript
import express from "express";
import { init, expressMiddleware, instrumentPg, LogCollector } from "@dexter.js/sdk";
import { Pool } from "pg";

// 1. init dexter — auto-spawns the sidecar process
const emitter = init();

// 2. instrument your database
instrumentPg(Pool);

// 3. create your app
const app = express();
app.use(expressMiddleware()); // auto-traces every request

// 4. optional: structured logging with auto traceId
const log = new LogCollector(emitter);

app.get("/", (_req, res) => {
  log.info("hello from dexter");
  res.json({ status: "ok" });
});

app.listen(3000);
// dashboard at http://localhost:4000
```

That's it. Open `http://localhost:4000` to see your dashboard.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│              Your Express App (:3000)            │
│                                                  │
│  ┌───────────┐ ┌────────┐ ┌──────────────────┐  │
│  │  Express   │ │   pg   │ │  LogCollector    │  │
│  │ Middleware │ │ hooks  │ │  (auto traceId)  │  │
│  └─────┬─────┘ └───┬────┘ └────────┬─────────┘  │
│        │            │               │            │
│        └────────────┼───────────────┘            │
│                     ▼                            │
│           ┌──────────────────┐                   │
│           │  SocketEmitter   │                   │
│           │  (batch 500ms)   │                   │
│           └────────┬─────────┘                   │
└────────────────────┼─────────────────────────────┘
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

- **Auto-instrumented Express middleware** — traces every request with route, method, status, duration
- **Database span tracking** — hooks into `pg`, Mongoose, and ioredis
- **Outbound HTTP spans** — patches `globalThis.fetch` and Axios interceptors
- **Structured logging** — `LogCollector` with automatic `traceId` propagation via `AsyncLocalStorage`
- **System metrics** — CPU, memory, event-loop lag collected every 5s via `perf_hooks`
- **Local sidecar** — auto-spawned child process with SQLite (WAL mode) + Express dashboard
- **Insights engine** — N+1 query detection, slow query alerts, high error rate warnings
- **Per-route percentiles** — p50/p95/p99 latency breakdowns
- **Dark-themed dashboard** — 4 tabs: Overview, Routes, Logs (with span drill-down), Insights

---

## Monorepo Structure

```
dexterjs/
├── packages/
│   ├── sdk/          # @dexter.js/sdk — instrumentation library
│   └── sidecar/      # @dexter.js/sidecar — collector, storage, dashboard
├── shared/
│   └── types/        # @dexter.js/types — shared TypeScript interfaces
├── examples/
│   └── express-app/  # demo app with pg
├── tests/            # vitest test suites
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

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

## Dashboard

The sidecar serves a dark-themed dashboard at `http://localhost:4000`:

| Tab | What it shows |
|---|---|
| **Overview** | Health indicator, total requests, error rate, avg response time, CPU, memory, event loop lag |
| **Routes** | Per-route table with p50/p95/p99, request count, error rate, HOT badges |
| **Logs** | Live log stream with level filters, clickable traceId to expand spans |
| **Insights** | N+1 detection, slow queries, high error rates, hot routes |

---

## API Reference

| Endpoint | Description |
|---|---|
| `GET /api/overview` | Health + aggregate stats |
| `GET /api/routes` | Per-route latency percentiles |
| `GET /api/logs` | Recent logs (optional `?traceId=` filter) |
| `GET /api/spans?traceId=` | Spans for a specific trace |
| `GET /api/insights` | Rule-based performance insights |

---

## Configuration

```typescript
init({
  port: 4000,        // sidecar HTTP port (default: 4000)
  autoSpawn: true,   // auto-start sidecar child process (default: true)
  sidecarPath: "…",  // custom path to sidecar entry (auto-resolved by default)
});
```

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

Please keep PRs focused and small. If you're adding a new instrumentor, look at the existing ones in `packages/sdk/src/instrumentors/` for the pattern.

---

## License

MIT — do whatever you want with it.

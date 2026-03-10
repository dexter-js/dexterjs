# DexterJS — Express Example App

A minimal Express application instrumented with **DexterJS** to demonstrate
auto-instrumented tracing, logging, database spans, and system metrics.

## Prerequisites

- **Node.js** ≥ 18
- **pnpm** ≥ 8
- *(Optional)* PostgreSQL — the app falls back to mock data if PG is unavailable.

## Setup

From the **monorepo root** (`dexterjs/`):

```bash
# Install all dependencies
pnpm install

# Build every package (types → SDK → sidecar → example)
pnpm build
```

## Running

```bash
# Start the example app (auto-spawns the sidecar)
cd examples/express-app
pnpm start
```

The Express server starts on **http://localhost:3000** and the DexterJS sidecar
dashboard is available at **http://localhost:4000**.

### Available routes

| Method | Path          | Description          |
| ------ | ------------- | -------------------- |
| GET    | `/users`      | List all users       |
| GET    | `/users/:id`  | Get a user by ID     |
| POST   | `/users`      | Create a new user    |

### DexterJS dashboard endpoints

| Method | Path             | Description                              |
| ------ | ---------------- | ---------------------------------------- |
| GET    | `/api/overview`  | Health, total requests, error rate, etc. |
| GET    | `/api/routes`    | Per-route p50/p95/p99 latency stats      |
| GET    | `/api/logs`      | Recent structured logs                   |
| GET    | `/api/insights`  | N+1, slow queries, error rate warnings   |

## Running with PostgreSQL

Set the `DATABASE_URL` environment variable:

```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/mydb pnpm start
```

Create the `users` table:

```sql
CREATE TABLE IF NOT EXISTS users (
  id    SERIAL PRIMARY KEY,
  name  TEXT NOT NULL,
  email TEXT NOT NULL
);
```

## How it works

1. `init()` is called at the very top of the entry file.
2. The DexterJS SDK auto-spawns the sidecar as a child process.
3. The `expressMiddleware()` captures every HTTP request as a **trace**.
4. `instrumentPg(Pool)` hooks into `pg.Pool.query` to emit **DB spans**.
5. The `LogCollector` attaches the current `traceId` (from `AsyncLocalStorage`)
   to every log entry.
6. The `MetricsCollector` ships CPU, memory, and event-loop-lag snapshots every
   5 seconds.
7. All events are batched and sent to the sidecar over a Unix socket at
   `/tmp/dexter.sock`.

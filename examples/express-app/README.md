# DexterJS — Express Test App

A full Express application instrumented with **every DexterJS instrumentor** — Prisma, Drizzle, raw pg, Mongoose, Redis, and outbound HTTP. Uses Docker for real database services.

## Prerequisites

- **Node.js** ≥ 18
- **pnpm** ≥ 8
- **Docker** & **Docker Compose**

## Quick Start

### 1. Start database services

```bash
# From the monorepo root
docker compose up -d
```

This starts PostgreSQL 16, MongoDB 7, and Redis 7.

### 2. Configure environment

```bash
cd examples/express-app
cp .env.example .env
```

### 3. Install & build

```bash
# From monorepo root
pnpm install
pnpm build
```

### 4. Run Prisma migrations

```bash
cd examples/express-app
npx prisma migrate dev --name init
```

### 5. Start the app

```bash
pnpm dev
# or: pnpm start (after build)
```

- **App:** http://localhost:3000
- **DexterJS Dashboard:** http://localhost:4000

---

## Available Routes

### Prisma (PostgreSQL ORM)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/prisma/users` | Fetch all users |
| POST | `/prisma/users` | Create user `{ name, email }` |
| GET | `/prisma/users/:id` | Fetch single user by ID |
| GET | `/prisma/slow` | N+1 query pattern (fetches users then loops posts) |

### Drizzle (PostgreSQL ORM)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/drizzle/users` | Fetch all users |
| POST | `/drizzle/users` | Create user `{ name, email }` |

### Raw pg (SQL)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/pg/users` | Raw SQL select |
| POST | `/pg/users` | Raw SQL insert `{ name, email }` |

### Mongoose (MongoDB)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/mongo/items` | Fetch all items |
| POST | `/mongo/items` | Create item `{ name, value }` |

### Redis

| Method | Path | Description |
|--------|------|-------------|
| GET | `/redis/get/:key` | Get value by key |
| POST | `/redis/set` | Set `{ key, value }` |
| GET | `/redis/cached-users` | Fetch users with Redis caching (60s TTL) |

### Outbound HTTP

| Method | Path | Description |
|--------|------|-------------|
| GET | `/http/external` | Calls jsonplaceholder via axios + fetch |

### Error Routes (for dashboard alerts)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/error/random` | 50% chance of throwing 500 |
| GET | `/error/slow` | Sleeps 3 seconds then responds |

---

## Test Every Route with curl

```bash
# ── Prisma ────────────────────────────────────────
curl -X POST http://localhost:3000/prisma/users \
  -H "Content-Type: application/json" \
  -d '{"name": "Alice", "email": "alice@example.com"}'

curl http://localhost:3000/prisma/users
curl http://localhost:3000/prisma/users/1
curl http://localhost:3000/prisma/slow

# ── Drizzle ───────────────────────────────────────
curl -X POST http://localhost:3000/drizzle/users \
  -H "Content-Type: application/json" \
  -d '{"name": "Bob", "email": "bob@example.com"}'

curl http://localhost:3000/drizzle/users

# ── Raw pg ────────────────────────────────────────
curl -X POST http://localhost:3000/pg/users \
  -H "Content-Type: application/json" \
  -d '{"name": "Charlie", "email": "charlie@example.com"}'

curl http://localhost:3000/pg/users

# ── Mongoose ──────────────────────────────────────
curl -X POST http://localhost:3000/mongo/items \
  -H "Content-Type: application/json" \
  -d '{"name": "widget", "value": 42}'

curl http://localhost:3000/mongo/items

# ── Redis ─────────────────────────────────────────
curl -X POST http://localhost:3000/redis/set \
  -H "Content-Type: application/json" \
  -d '{"key": "greeting", "value": "hello"}'

curl http://localhost:3000/redis/get/greeting
curl http://localhost:3000/redis/cached-users

# ── Outbound HTTP ─────────────────────────────────
curl http://localhost:3000/http/external

# ── Error routes (hit several times for insights) ─
curl http://localhost:3000/error/random
curl http://localhost:3000/error/random
curl http://localhost:3000/error/random
curl http://localhost:3000/error/random
curl http://localhost:3000/error/random
curl http://localhost:3000/error/slow
```

After hitting these routes, open the **DexterJS Dashboard** at http://localhost:4000 to see:

- **Overview:** Total requests, error rate, avg response time, CPU/memory
- **Routes:** Per-route p50/p95/p99 latency stats
- **Logs:** Structured logs with trace correlation
- **Insights:** N+1 detection (from `/prisma/slow`), slow queries, high error rates

---

## How It Works

1. `createLogger()` creates a structured logger with redaction
2. `monitor({ app, logger })` spawns the sidecar and connects the logger
3. `expressMiddleware()` traces every HTTP request with UUID traceIds via AsyncLocalStorage
4. `instrumentPg(Pool)` patches pg queries to emit DB spans
5. `instrumentPrisma(client)` uses `$extends` to intercept all Prisma operations
6. `dexterDrizzleLogger` logs Drizzle queries as DB spans
7. `instrumentMongoose(mongoose)` registers global pre/post hooks
8. `instrumentRedis(redis)` wraps `sendCommand` for Redis span emission
9. `instrumentHttp({ axios })` patches `globalThis.fetch` and adds Axios interceptors
10. All events batch over Unix socket → sidecar → SQLite → dashboard

## Cleanup

```bash
docker compose down        # Stop containers
docker compose down -v     # Stop + delete data volumes
```

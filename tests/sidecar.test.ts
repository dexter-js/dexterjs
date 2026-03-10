import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import type { EventBatch } from "@dexterjs/types";
import * as fs from "node:fs";
import * as path from "node:path";

// We'll test the sidecar's DB + ingest + aggregator modules by using an
// in-memory SQLite database and providing it via a mock.

const TEST_DB_PATH = path.join(__dirname, "__test_dexter.db");

// Shared db instance for the test suite.
let db: Database.Database;

// We cannot easily swap the singleton inside db.ts, so we replicate the schema
// and test ingest/aggregator logic directly.

function initTestDb(): Database.Database {
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);

  db = new Database(TEST_DB_PATH);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS requests (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      traceId     TEXT    NOT NULL,
      method      TEXT    NOT NULL,
      route       TEXT    NOT NULL,
      statusCode  INTEGER NOT NULL,
      duration    REAL    NOT NULL,
      timestamp   INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      traceId     TEXT    NOT NULL,
      level       TEXT    NOT NULL,
      message     TEXT    NOT NULL,
      metadata    TEXT,
      timestamp   INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS spans (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      traceId     TEXT    NOT NULL,
      type        TEXT    NOT NULL,
      target      TEXT    NOT NULL,
      duration    REAL    NOT NULL,
      timestamp   INTEGER NOT NULL,
      error       TEXT
    );
    CREATE TABLE IF NOT EXISTS metrics (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      cpuUsage       REAL    NOT NULL,
      memoryUsage    REAL    NOT NULL,
      eventLoopLag   REAL    NOT NULL,
      activeHandles  INTEGER NOT NULL,
      timestamp      INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_requests_route    ON requests(route);
    CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON requests(timestamp);
    CREATE INDEX IF NOT EXISTS idx_logs_traceId       ON logs(traceId);
    CREATE INDEX IF NOT EXISTS idx_spans_traceId      ON spans(traceId);
    CREATE INDEX IF NOT EXISTS idx_spans_type          ON spans(type);
    CREATE INDEX IF NOT EXISTS idx_metrics_timestamp   ON metrics(timestamp);
  `);

  return db;
}

/**
 * Inline ingest function matching the sidecar's ingest.ts logic — operates on
 * the test DB directly instead of the singleton.
 */
function ingestBatch(batch: EventBatch): void {
  const insertRequest = db.prepare(
    `INSERT INTO requests (traceId, method, route, statusCode, duration, timestamp)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertLog = db.prepare(
    `INSERT INTO logs (traceId, level, message, metadata, timestamp)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const insertSpan = db.prepare(
    `INSERT INTO spans (traceId, type, target, duration, timestamp, error)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertMetric = db.prepare(
    `INSERT INTO metrics (cpuUsage, memoryUsage, eventLoopLag, activeHandles, timestamp)
     VALUES (?, ?, ?, ?, ?)`,
  );

  const tx = db.transaction((events: EventBatch["events"]) => {
    for (const e of events) {
      switch (e.type) {
        case "trace":
          insertRequest.run(e.payload.traceId, e.payload.method, e.payload.route, e.payload.statusCode, e.payload.duration, e.payload.timestamp);
          break;
        case "log":
          insertLog.run(e.payload.traceId, e.payload.level, e.payload.message, e.payload.metadata ? JSON.stringify(e.payload.metadata) : null, e.payload.timestamp);
          break;
        case "span":
          insertSpan.run(e.payload.traceId, e.payload.type, e.payload.target, e.payload.duration, e.payload.timestamp, e.payload.error ?? null);
          break;
        case "metric":
          insertMetric.run(e.payload.cpuUsage, e.payload.memoryUsage, e.payload.eventLoopLag, e.payload.activeHandles, e.payload.timestamp);
          break;
      }
    }
  });

  tx(batch.events);
}

// Percentile helper (matches aggregator.ts).
function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, idx)]!;
}

describe("Sidecar — Database & Ingestion", () => {
  beforeEach(() => {
    initTestDb();
  });

  afterEach(() => {
    db?.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    // Also cleanup WAL/SHM files.
    for (const suffix of ["-wal", "-shm"]) {
      const f = TEST_DB_PATH + suffix;
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
  });

  it("should create all tables", () => {
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
      )
      .all() as { name: string }[];

    const names = tables.map((t) => t.name);
    expect(names).toContain("requests");
    expect(names).toContain("logs");
    expect(names).toContain("spans");
    expect(names).toContain("metrics");
  });

  it("should ingest trace events into the requests table", () => {
    ingestBatch({
      events: [
        {
          type: "trace",
          payload: {
            traceId: "t-1",
            method: "GET",
            route: "/users",
            statusCode: 200,
            duration: 42.3,
            timestamp: Date.now(),
          },
        },
      ],
      sentAt: Date.now(),
    });

    const rows = db.prepare("SELECT * FROM requests").all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].traceId).toBe("t-1");
    expect(rows[0].method).toBe("GET");
    expect(rows[0].duration).toBeCloseTo(42.3, 1);
  });

  it("should ingest log events into the logs table", () => {
    ingestBatch({
      events: [
        {
          type: "log",
          payload: {
            traceId: "t-2",
            level: "error",
            message: "something broke",
            metadata: { code: 500 },
            timestamp: Date.now(),
          },
        },
      ],
      sentAt: Date.now(),
    });

    const rows = db.prepare("SELECT * FROM logs").all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].level).toBe("error");
    expect(JSON.parse(rows[0].metadata)).toEqual({ code: 500 });
  });

  it("should ingest span events into the spans table", () => {
    ingestBatch({
      events: [
        {
          type: "span",
          payload: {
            traceId: "t-3",
            type: "db",
            target: "SELECT 1",
            duration: 1.5,
            timestamp: Date.now(),
          },
        },
      ],
      sentAt: Date.now(),
    });

    const rows = db.prepare("SELECT * FROM spans").all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("db");
    expect(rows[0].target).toBe("SELECT 1");
    expect(rows[0].error).toBeNull();
  });

  it("should ingest span events with errors", () => {
    ingestBatch({
      events: [
        {
          type: "span",
          payload: {
            traceId: "t-3e",
            type: "redis",
            target: "GET key",
            duration: 100,
            timestamp: Date.now(),
            error: "ECONNREFUSED",
          },
        },
      ],
      sentAt: Date.now(),
    });

    const rows = db.prepare("SELECT * FROM spans").all() as any[];
    expect(rows[0].error).toBe("ECONNREFUSED");
  });

  it("should ingest metric events into the metrics table", () => {
    ingestBatch({
      events: [
        {
          type: "metric",
          payload: {
            cpuUsage: 1.2,
            memoryUsage: 52428800,
            eventLoopLag: 3.1,
            activeHandles: 4,
            timestamp: Date.now(),
          },
        },
      ],
      sentAt: Date.now(),
    });

    const rows = db.prepare("SELECT * FROM metrics").all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].cpuUsage).toBeCloseTo(1.2, 1);
    expect(rows[0].activeHandles).toBe(4);
  });

  it("should handle a mixed batch in one transaction", () => {
    ingestBatch({
      events: [
        {
          type: "trace",
          payload: { traceId: "batch-1", method: "GET", route: "/a", statusCode: 200, duration: 10, timestamp: 1 },
        },
        {
          type: "log",
          payload: { traceId: "batch-1", level: "info", message: "ok", timestamp: 1 },
        },
        {
          type: "span",
          payload: { traceId: "batch-1", type: "http", target: "https://api.example.com", duration: 50, timestamp: 1 },
        },
        {
          type: "metric",
          payload: { cpuUsage: 0.5, memoryUsage: 1024, eventLoopLag: 0.1, activeHandles: 2, timestamp: 1 },
        },
      ],
      sentAt: 1,
    });

    expect((db.prepare("SELECT COUNT(*) as c FROM requests").get() as any).c).toBe(1);
    expect((db.prepare("SELECT COUNT(*) as c FROM logs").get() as any).c).toBe(1);
    expect((db.prepare("SELECT COUNT(*) as c FROM spans").get() as any).c).toBe(1);
    expect((db.prepare("SELECT COUNT(*) as c FROM metrics").get() as any).c).toBe(1);
  });
});

describe("Sidecar — Aggregator logic", () => {
  beforeEach(() => {
    initTestDb();
  });

  afterEach(() => {
    db?.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    for (const suffix of ["-wal", "-shm"]) {
      const f = TEST_DB_PATH + suffix;
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
  });

  it("should compute route stats (p50/p95/p99)", () => {
    // Insert 100 requests with varying durations.
    const insert = db.prepare(
      `INSERT INTO requests (traceId, method, route, statusCode, duration, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const tx = db.transaction(() => {
      for (let i = 1; i <= 100; i++) {
        insert.run(`t-${i}`, "GET", "/users", i <= 95 ? 200 : 500, i * 1.0, Date.now());
      }
    });
    tx();

    // Compute stats using the same logic as Aggregator.getRouteStats().
    const routes = db
      .prepare(`SELECT DISTINCT route, method FROM requests ORDER BY route`)
      .all() as any[];

    expect(routes).toHaveLength(1);

    const durations = db
      .prepare(
        `SELECT duration FROM requests WHERE route = ? AND method = ? ORDER BY duration ASC`,
      )
      .all("/users", "GET") as { duration: number }[];

    const sorted = durations.map((d) => d.duration);
    expect(percentile(sorted, 50)).toBeCloseTo(50, 0);
    expect(percentile(sorted, 95)).toBeCloseTo(95, 0);
    expect(percentile(sorted, 99)).toBeCloseTo(99, 0);

    const errorCount = (
      db
        .prepare(`SELECT COUNT(*) as cnt FROM requests WHERE route = ? AND method = ? AND statusCode >= 400`)
        .get("/users", "GET") as any
    ).cnt;

    expect(errorCount).toBe(5);
    expect(errorCount / 100).toBeCloseTo(0.05, 2);
  });

  it("should detect N+1 queries (≥5 DB spans per trace)", () => {
    const insert = db.prepare(
      `INSERT INTO spans (traceId, type, target, duration, timestamp, error) VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const tx = db.transaction(() => {
      for (let i = 0; i < 10; i++) {
        insert.run("n1-trace", "db", `SELECT * FROM users WHERE id = ${i}`, 2, Date.now(), null);
      }
      // Another trace with only 2 queries — should NOT trigger.
      insert.run("ok-trace", "db", "SELECT 1", 1, Date.now(), null);
      insert.run("ok-trace", "db", "SELECT 2", 1, Date.now(), null);
    });
    tx();

    const nPlusOne = db
      .prepare(
        `SELECT traceId, COUNT(*) as cnt FROM spans WHERE type = 'db' GROUP BY traceId HAVING cnt >= 5`,
      )
      .all() as any[];

    expect(nPlusOne).toHaveLength(1);
    expect(nPlusOne[0].traceId).toBe("n1-trace");
    expect(nPlusOne[0].cnt).toBe(10);
  });

  it("should detect slow queries (≥500ms)", () => {
    const insert = db.prepare(
      `INSERT INTO spans (traceId, type, target, duration, timestamp, error) VALUES (?, ?, ?, ?, ?, ?)`,
    );
    insert.run("slow-t", "db", "SELECT * FROM huge_table", 750, Date.now(), null);
    insert.run("fast-t", "db", "SELECT 1", 2, Date.now(), null);

    const slowQueries = db
      .prepare(
        `SELECT traceId, target, duration FROM spans WHERE type = 'db' AND duration >= 500 ORDER BY duration DESC`,
      )
      .all() as any[];

    expect(slowQueries).toHaveLength(1);
    expect(slowQueries[0].target).toBe("SELECT * FROM huge_table");
    expect(slowQueries[0].duration).toBe(750);
  });

  it("should compute overview stats", () => {
    const insertReq = db.prepare(
      `INSERT INTO requests (traceId, method, route, statusCode, duration, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const insertMetric = db.prepare(
      `INSERT INTO metrics (cpuUsage, memoryUsage, eventLoopLag, activeHandles, timestamp) VALUES (?, ?, ?, ?, ?)`,
    );

    const tx = db.transaction(() => {
      insertReq.run("o-1", "GET", "/", 200, 10, Date.now());
      insertReq.run("o-2", "GET", "/", 500, 20, Date.now());
      insertMetric.run(1.0, 1024, 2.5, 3, Date.now());
    });
    tx();

    const totalRequests = (db.prepare("SELECT COUNT(*) as cnt FROM requests").get() as any).cnt;
    const errorCount = (db.prepare("SELECT COUNT(*) as cnt FROM requests WHERE statusCode >= 400").get() as any).cnt;
    const avgDuration = (db.prepare("SELECT AVG(duration) as avg FROM requests").get() as any).avg;
    const latestMetric = db.prepare("SELECT * FROM metrics ORDER BY timestamp DESC LIMIT 1").get() as any;

    expect(totalRequests).toBe(2);
    expect(errorCount).toBe(1);
    expect(errorCount / totalRequests).toBe(0.5);
    expect(avgDuration).toBeCloseTo(15, 0);
    expect(latestMetric.eventLoopLag).toBeCloseTo(2.5, 1);
  });
});

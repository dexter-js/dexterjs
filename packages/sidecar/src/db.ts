import Database from "better-sqlite3";
import * as path from "node:path";
import * as fs from "node:fs";

const DB_DIR = path.resolve(__dirname, "..");
const DB_PATH = path.join(DB_DIR, "dexter.db");

let _db: Database.Database | null = null;

/**
 * Returns a singleton better-sqlite3 database instance.
 *
 * The database file is stored alongside the sidecar package so it persists
 * across restarts during development.
 */
export function getDb(): Database.Database {
  if (_db) return _db;

  // Ensure the directory exists.
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  _db = new Database(DB_PATH);

  // Enable WAL mode for better concurrent read/write performance.
  _db.pragma("journal_mode = WAL");
  _db.pragma("synchronous = NORMAL");

  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database): void {
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

    -- Indexes for common query patterns
    CREATE INDEX IF NOT EXISTS idx_requests_route      ON requests(route);
    CREATE INDEX IF NOT EXISTS idx_requests_timestamp   ON requests(timestamp);
    CREATE INDEX IF NOT EXISTS idx_logs_traceId         ON logs(traceId);
    CREATE INDEX IF NOT EXISTS idx_logs_timestamp        ON logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_spans_traceId         ON spans(traceId);
    CREATE INDEX IF NOT EXISTS idx_spans_type             ON spans(type);
    CREATE INDEX IF NOT EXISTS idx_metrics_timestamp      ON metrics(timestamp);
  `);
}

/** Close the database (for graceful shutdown). */
export function closeDb(): void {
  _db?.close();
  _db = null;
}

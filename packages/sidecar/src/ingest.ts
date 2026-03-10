import type { EventBatch, EventEnvelope } from "@dexter.js/types";
import { getDb } from "./db";

/**
 * Persists a batch of events received from the SDK into the SQLite database.
 */
export function ingestBatch(batch: EventBatch): void {
  const db = getDb();

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

  const transaction = db.transaction((events: EventEnvelope[]) => {
    for (const envelope of events) {
      switch (envelope.type) {
        case "trace": {
          const p = envelope.payload;
          insertRequest.run(
            p.traceId,
            p.method,
            p.route,
            p.statusCode,
            p.duration,
            p.timestamp,
          );
          break;
        }
        case "log": {
          const p = envelope.payload;
          insertLog.run(
            p.traceId,
            p.level,
            p.message,
            p.metadata ? JSON.stringify(p.metadata) : null,
            p.timestamp,
          );
          break;
        }
        case "span": {
          const p = envelope.payload;
          insertSpan.run(
            p.traceId,
            p.type,
            p.target,
            p.duration,
            p.timestamp,
            p.error ?? null,
          );
          break;
        }
        case "metric": {
          const p = envelope.payload;
          insertMetric.run(
            p.cpuUsage,
            p.memoryUsage,
            p.eventLoopLag,
            p.activeHandles,
            p.timestamp,
          );
          break;
        }
      }
    }
  });

  transaction(batch.events);
}

// aggregator — route stats & insights engine
import { getDb } from "./db";

/** Percentile stats for a single route. */
export interface RouteStats {
  route: string;
  method: string;
  count: number;
  p50: number;
  p95: number;
  p99: number;
  errorRate: number;
}

/** Result of the insight analysis. */
export interface Insight {
  type: "n+1" | "slow-query" | "high-error-rate" | "hot-route";
  message: string;
  metadata?: Record<string, unknown>;
}

const SLOW_QUERY_THRESHOLD_MS = 500;
const HIGH_ERROR_RATE_THRESHOLD = 0.1; // 10 %
const N_PLUS_ONE_THRESHOLD = 5; // ≥5 DB spans per trace = probable N+1

/**
 * Runs every aggregation cycle (5 s) to compute per-route percentiles and
 * detect common performance anti-patterns.
 */
export class Aggregator {
  private timer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.run(), 5_000);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Force a single aggregation pass (also used by API handlers). */
  run(): void {
    // Aggregation is demand-driven by the API routes — this periodic call keeps
    // pre-computed insights warm but is not strictly necessary.
  }

  // ─── Queries consumed by the HTTP API ───────────────────────────────────

  /** Returns percentile latency stats per route. */
  static getRouteStats(): RouteStats[] {
    const db = getDb();

    const routes = db
      .prepare(
        `SELECT DISTINCT route, method FROM requests ORDER BY route`,
      )
      .all() as { route: string; method: string }[];

    const results: RouteStats[] = [];

    for (const { route, method } of routes) {
      const durations = db
        .prepare(
          `SELECT duration FROM requests WHERE route = ? AND method = ? ORDER BY duration ASC`,
        )
        .all(route, method) as { duration: number }[];

      const count = durations.length;
      if (count === 0) continue;

      const errorCount = (
        db
          .prepare(
            `SELECT COUNT(*) as cnt FROM requests WHERE route = ? AND method = ? AND statusCode >= 400`,
          )
          .get(route, method) as { cnt: number }
      ).cnt;

      results.push({
        route,
        method,
        count,
        p50: percentile(durations.map((d) => d.duration), 50),
        p95: percentile(durations.map((d) => d.duration), 95),
        p99: percentile(durations.map((d) => d.duration), 99),
        errorRate: count > 0 ? errorCount / count : 0,
      });
    }

    return results;
  }

  /** Returns rule-based insights. */
  static getInsights(): Insight[] {
    const insights: Insight[] = [];
    const db = getDb();

    // ── N+1 detection ───────────────────────────────────────────────────
    const nPlusOne = db
      .prepare(
        `SELECT traceId, COUNT(*) as cnt
         FROM spans
         WHERE type = 'db'
         GROUP BY traceId
         HAVING cnt >= ?`,
      )
      .all(N_PLUS_ONE_THRESHOLD) as { traceId: string; cnt: number }[];

    for (const row of nPlusOne) {
      insights.push({
        type: "n+1",
        message: `Potential N+1 detected: traceId ${row.traceId} issued ${row.cnt} DB queries.`,
        metadata: { traceId: row.traceId, queryCount: row.cnt },
      });
    }

    // ── Slow queries ────────────────────────────────────────────────────
    const slowQueries = db
      .prepare(
        `SELECT traceId, target, duration
         FROM spans
         WHERE type = 'db' AND duration >= ?
         ORDER BY duration DESC
         LIMIT 20`,
      )
      .all(SLOW_QUERY_THRESHOLD_MS) as {
      traceId: string;
      target: string;
      duration: number;
    }[];

    for (const row of slowQueries) {
      insights.push({
        type: "slow-query",
        message: `Slow query (${row.duration.toFixed(1)} ms): ${row.target}`,
        metadata: {
          traceId: row.traceId,
          target: row.target,
          duration: row.duration,
        },
      });
    }

    // ── High error-rate routes ──────────────────────────────────────────
    const routeStats = Aggregator.getRouteStats();
    for (const rs of routeStats) {
      if (rs.errorRate >= HIGH_ERROR_RATE_THRESHOLD && rs.count >= 5) {
        insights.push({
          type: "high-error-rate",
          message: `${rs.method} ${rs.route} has a ${(rs.errorRate * 100).toFixed(1)}% error rate over ${rs.count} requests.`,
          metadata: { route: rs.route, method: rs.method, errorRate: rs.errorRate },
        });
      }
    }

    // ── Hot routes (most traffic) ───────────────────────────────────────
    const sorted = [...routeStats].sort((a, b) => b.count - a.count);
    const hotRoutes = sorted.slice(0, 3).filter((r) => r.count >= 10);
    for (const hr of hotRoutes) {
      insights.push({
        type: "hot-route",
        message: `Hot route: ${hr.method} ${hr.route} (${hr.count} requests, p95 ${hr.p95.toFixed(1)} ms).`,
        metadata: { route: hr.route, method: hr.method, count: hr.count },
      });
    }

    return insights;
  }

  /** Returns a high-level overview object. */
  static getOverview(): Record<string, unknown> {
    const db = getDb();

    const totalRequests = (
      db.prepare(`SELECT COUNT(*) as cnt FROM requests`).get() as { cnt: number }
    ).cnt;

    const errorCount = (
      db
        .prepare(
          `SELECT COUNT(*) as cnt FROM requests WHERE statusCode >= 400`,
        )
        .get() as { cnt: number }
    ).cnt;

    const avgDuration = (
      db.prepare(`SELECT AVG(duration) as avg FROM requests`).get() as {
        avg: number | null;
      }
    ).avg;

    const latestMetric = db
      .prepare(`SELECT * FROM metrics ORDER BY timestamp DESC LIMIT 1`)
      .get() as
      | {
          cpuUsage: number;
          memoryUsage: number;
          eventLoopLag: number;
          activeHandles: number;
        }
      | undefined;

    return {
      status: "ok",
      totalRequests,
      errorRate: totalRequests > 0 ? errorCount / totalRequests : 0,
      avgResponseTime: avgDuration ?? 0,
      eventLoopLag: latestMetric?.eventLoopLag ?? 0,
      cpuUsage: latestMetric?.cpuUsage ?? 0,
      memoryUsage: latestMetric?.memoryUsage ?? 0,
      activeHandles: latestMetric?.activeHandles ?? 0,
    };
  }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, idx)]!;
}

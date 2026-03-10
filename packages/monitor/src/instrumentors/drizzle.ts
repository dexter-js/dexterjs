import { currentTraceId } from "@dexter.js/types";
import { getEmitter } from "../init";

/**
 * Instruments a pg Pool for Drizzle by wrapping pool.query() directly.
 * This gives accurate timing unlike Drizzle's logQuery which fires after execution.
 *
 * @example
 * ```ts
 * import { Pool } from "pg";
 * import { drizzle } from "drizzle-orm/node-postgres";
 * import { instrumentDrizzle } from "@dexter.js/monitor";
 *
 * const pool = new Pool({ connectionString: DATABASE_URL });
 * const db = drizzle(instrumentDrizzle(pool));
 * ```
 */
export function instrumentDrizzle(pool: any): any {
  const originalQuery = pool.query.bind(pool);

  pool.query = async function (...args: any[]) {
    const traceId = currentTraceId();
    const start = performance.now();
    const query = typeof args[0] === 'string' ? args[0] : args[0]?.text ?? 'unknown'

    try {
      const result = await originalQuery(...args);
      const duration = performance.now() - start;

      const emitter = getEmitter();
      if (emitter) {
        emitter.emit({
          type: "span",
          payload: {
            traceId,
            type: "db",
            target: `drizzle: ${query.slice(0, 200)}`,
            duration,
            timestamp: Date.now(),
            error: undefined,
          },
        });
      }

      return result;
    } catch (err: any) {
      const duration = performance.now() - start;
      const emitter = getEmitter();
      if (emitter) {
        emitter.emit({
          type: "span",
          payload: {
            traceId,
            type: "db",
            target: `drizzle: ${query.slice(0, 200)}`,
            duration,
            timestamp: Date.now(),
            error: err.message || "unknown error",
          },
        });
      }
      throw err;
    }
  };

  return pool;
}

// Keep DexterDrizzleLogger as a no-op for backward compat
export class DexterDrizzleLogger {
  logQuery(_query: string, _params: unknown[]): void {}
}
export const dexterDrizzleLogger = new DexterDrizzleLogger();
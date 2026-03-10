import { currentTraceId } from "../context";
import { getEmitter } from "../init";

/**
 * Custom Drizzle logger that emits span events for every query.
 * Uses Drizzle's `logger` option which accepts an object with a `logQuery` method.
 *
 * @example
 * ```ts
 * import { drizzle } from "drizzle-orm/node-postgres";
 * import { dexterDrizzleLogger } from "@dexter.js/monitor";
 *
 * const db = drizzle(pool, { logger: dexterDrizzleLogger });
 * ```
 */
export class DexterDrizzleLogger {
  /**
   * Called by Drizzle for every query execution.
   * Captures query text, parameters (redacted), and timing.
   */
  logQuery(query: string, params: unknown[]): void {
    const traceId = currentTraceId();
    const start = performance.now();

    // Redact parameter values to avoid leaking sensitive data.
    const redactedParams = params.map((_p, i) => `$${i + 1}`);
    const target = `drizzle: ${query.slice(0, 200)}`;

    // Emit span immediately — Drizzle calls logQuery after execution.
    const emitter = getEmitter();
    if (!emitter) return;

    emitter.emit({
      type: "span",
      payload: {
        traceId,
        type: "db",
        target,
        duration: performance.now() - start,
        timestamp: Date.now(),
        error: undefined,
      },
    });

    // Log query details for debugging.
    if (process.env["DEXTER_DEBUG"]) {
      console.debug(
        `[dexter-drizzle] ${query.slice(0, 100)} params=[${redactedParams.join(", ")}]`,
      );
    }
  }
}

/** Pre-built instance ready to pass into Drizzle config. */
export const dexterDrizzleLogger = new DexterDrizzleLogger();

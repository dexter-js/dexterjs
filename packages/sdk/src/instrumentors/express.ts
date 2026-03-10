import { randomUUID } from "node:crypto";
import { traceStore } from "../context";
import { getEmitter } from "../init";

/**
 * Express middleware that:
 * 1. Creates a unique traceId and stores it in {@link AsyncLocalStorage}.
 * 2. Measures request duration.
 * 3. Emits a {@link TraceEvent} to the sidecar once the response finishes.
 *
 * Usage:
 * ```ts
 * import express from "express";
 * import { expressMiddleware } from "@dexter.js/sdk";
 * const app = express();
 * app.use(expressMiddleware());
 * ```
 */
export function expressMiddleware() {
  // Using a generic signature so the SDK does not require express as a
  // compile-time dependency.  At runtime `req`, `res`, `next` come from the
  // Express framework.
  return (req: any, res: any, next: any): void => {
    const traceId = randomUUID();
    const start = performance.now();

    // Attach traceId so downstream code can read it from the request.
    req.traceId = traceId;

    // Run the rest of the middleware / route handler inside the async store.
    traceStore.run({ traceId }, () => {
      // Hook into the response "finish" event to capture timing & status.
      res.on("finish", () => {
        const duration = performance.now() - start;
        const route: string =
          req.route?.path ?? req.originalUrl ?? req.url ?? "unknown";
        const method: string = req.method ?? "UNKNOWN";
        const statusCode: number = res.statusCode ?? 0;

        const emitter = getEmitter();
        if (emitter) {
          emitter.emit({
            type: "trace",
            payload: {
              traceId,
              method,
              route,
              statusCode,
              duration,
              timestamp: Date.now(),
            },
          });
        }
      });

      next();
    });
  };
}

import { currentTraceId } from "@dexter.js/types";
import { getEmitter } from "../init";

/**
 * Instruments the `pg` (node-postgres) {@link Client} to emit span events for
 * every query.
 *
 * This instrumentor uses **hook-based** wrapping — it overrides `query` on the
 * prototype once rather than monkey-patching individual instances.
 *
 * @example
 * ```ts
 * import { Client } from "pg";
 * import { instrumentPg } from "@dexter.js/sdk";
 * instrumentPg(Client);
 * ```
 *
 * TODO: Support connection-pool level instrumentation (`pg.Pool`).
 * TODO: Capture parameterised query text while redacting sensitive values.
 * TODO: Detect N+1 patterns by tracking query frequency per traceId.
 */
export function instrumentPg(ClientClass: any): void {
  if (!ClientClass?.prototype?.query) {
    console.warn("[dexter] pg.Client.prototype.query not found — skipping pg instrumentation.");
    return;
  }

  const originalQuery = ClientClass.prototype.query;

  ClientClass.prototype.query = function patchedQuery(
    this: any,
    ...args: any[]
  ) {
    const traceId = currentTraceId();
    const start = performance.now();

    // Determine the SQL text for the span target.
    const queryText: string =
      typeof args[0] === "string"
        ? args[0].slice(0, 200)
        : args[0]?.text?.slice(0, 200) ?? "unknown";

    const result: any = originalQuery.apply(this, args);

    // pg returns a Promise (or accepts a callback). Handle the Promise path.
    if (result && typeof result.then === "function") {
      return result
        .then((res: any) => {
          emitSpan(traceId, queryText, start);
          return res;
        })
        .catch((err: Error) => {
          emitSpan(traceId, queryText, start, err.message);
          throw err;
        });
    }

    // Callback-based usage — we cannot easily hook into this, emit best-effort.
    emitSpan(traceId, queryText, start);
    return result;
  };
}

function emitSpan(
  traceId: string,
  target: string,
  start: number,
  error?: string,
): void {
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
      error,
    },
  });
}

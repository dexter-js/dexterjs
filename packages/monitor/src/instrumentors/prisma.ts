import { currentTraceId } from "@dexter.js/types";
import { getEmitter } from "../init";

/**
 * Instruments a Prisma client using `$extends` (client extensions API).
 * This is the modern approach — Prisma middleware is deprecated.
 *
 * Returns an extended client that emits span events for every query.
 *
 * @example
 * ```ts
 * import { PrismaClient } from "@prisma/client";
 * import { instrumentPrisma } from "@dexter.js/monitor";
 * const prisma = instrumentPrisma(new PrismaClient());
 * ```
 */
export function instrumentPrisma<
  T extends { $extends: (...args: any[]) => any },
>(client: T): T {
  if (!client || typeof client.$extends !== "function") {
    console.warn(
      "[dexter] PrismaClient.$extends not found — skipping Prisma instrumentation. " +
        "Ensure you are using Prisma 4.16+ with client extensions support.",
    );
    return client;
  }

  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({
          model,
          operation,
          args,
          query,
        }: {
          model: string;
          operation: string;
          args: any;
          query: (args: any) => Promise<any>;
        }) {
          const traceId = currentTraceId();
          console.log("[prisma] traceId at query start:", traceId, operation);
          const start = performance.now();
          const target = `prisma.${model}.${operation}`;

          try {
            const result = await query(args);
            emitPrismaSpan(traceId, target, start);
            return result;
          } catch (err: any) {
            emitPrismaSpan(traceId, target, start, err?.message);
            throw err;
          }
        },
      },
    },
  }) as T;
}

function emitPrismaSpan(
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

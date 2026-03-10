import { currentTraceId } from "../context";
import { getEmitter } from "../init";

/**
 * Instruments an `ioredis` instance by wrapping the `sendCommand` method so
 * that every Redis command emits a span event.
 *
 * This is **hook-based** — it wraps the internal command dispatch rather than
 * monkey-patching individual command methods.
 *
 * @example
 * ```ts
 * import Redis from "ioredis";
 * import { instrumentRedis } from "@dexter.js/sdk";
 * const redis = new Redis();
 * instrumentRedis(redis);
 * ```
 *
 * TODO: Redact potentially sensitive keys / values in the span target.
 * TODO: Support instrumenting Redis Cluster and Sentinel instances.
 * TODO: Capture pipeline and multi/exec batches as a single logical span.
 */
export function instrumentRedis(redisInstance: any): void {
  if (!redisInstance?.sendCommand) {
    console.warn(
      "[dexter] redis.sendCommand not found — skipping Redis instrumentation.",
    );
    return;
  }

  const originalSendCommand = redisInstance.sendCommand.bind(redisInstance);

  redisInstance.sendCommand = function wrappedSendCommand(
    command: any,
    ...rest: any[]
  ) {
    const traceId = currentTraceId();
    const start = performance.now();
    const commandName: string = command?.name ?? "UNKNOWN";

    const result = originalSendCommand(command, ...rest);

    if (result && typeof result.then === "function") {
      return result
        .then((res: any) => {
          emitRedisSpan(traceId, commandName, start);
          return res;
        })
        .catch((err: Error) => {
          emitRedisSpan(traceId, commandName, start, err.message);
          throw err;
        });
    }

    emitRedisSpan(traceId, commandName, start);
    return result;
  };
}

function emitRedisSpan(
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
      type: "redis",
      target,
      duration: performance.now() - start,
      timestamp: Date.now(),
      error,
    },
  });
}

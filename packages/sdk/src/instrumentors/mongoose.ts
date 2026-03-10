import { currentTraceId } from "../context";
import { getEmitter } from "../init";

/**
 * Instruments Mongoose by registering global `pre` and `post` middleware hooks
 * on common operations so that every DB call emits a span event.
 *
 * This is **hook-based** — it does not monkey-patch internal Mongoose methods.
 *
 * @example
 * ```ts
 * import mongoose from "mongoose";
 * import { instrumentMongoose } from "@dexterjs/sdk";
 * instrumentMongoose(mongoose);
 * ```
 *
 * TODO: Capture collection name and filter/projection for richer span targets.
 * TODO: Add support for aggregate pipeline hooks.
 * TODO: Track cursor-based queries (find().cursor()) which bypass middleware.
 */
export function instrumentMongoose(mongoose: any): void {
  if (!mongoose?.plugin) {
    console.warn(
      "[dexter] mongoose.plugin not found — skipping mongoose instrumentation.",
    );
    return;
  }

  const operations = [
    "find",
    "findOne",
    "findOneAndUpdate",
    "findOneAndDelete",
    "updateOne",
    "updateMany",
    "deleteOne",
    "deleteMany",
    "insertMany",
    "save",
  ] as const;

  mongoose.plugin(function dexterPlugin(schema: any) {
    for (const op of operations) {
      // Use a Map attached to the query/doc to carry timing data.
      const preHookName = `__dexter_start_${op}`;

      schema.pre(op, function (this: any, next: any) {
        this[preHookName] = performance.now();
        this.__dexterTraceId = currentTraceId();
        next();
      });

      schema.post(op, function (this: any, _result: any, next: any) {
        const start: number | undefined = this[preHookName];
        const traceId: string = this.__dexterTraceId ?? currentTraceId();

        if (start !== undefined) {
          const emitter = getEmitter();
          if (emitter) {
            emitter.emit({
              type: "span",
              payload: {
                traceId,
                type: "db",
                target: `mongoose.${op}`,
                duration: performance.now() - start,
                timestamp: Date.now(),
              },
            });
          }
        }

        next();
      });
    }
  });
}

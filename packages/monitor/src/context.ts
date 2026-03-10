import { AsyncLocalStorage } from "node:async_hooks";

/** Global async-local store carrying the current traceId. */
export const traceStore = new AsyncLocalStorage<{ traceId: string }>();

/**
 * Returns the traceId from the current async context, or `"unknown"` if none is
 * active (e.g. background timers outside of a request).
 */
export function currentTraceId(): string {
  return traceStore.getStore()?.traceId ?? "unknown";
}

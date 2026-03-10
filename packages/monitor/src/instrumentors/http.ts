import { currentTraceId } from "../context";
import { getEmitter } from "../init";

/**
 * Instruments outbound HTTP calls by:
 * 1. Patching `globalThis.fetch` (Node 18+).
 * 2. Installing an Axios request/response interceptor (if an Axios instance is
 *    provided).
 *
 * This is **hook-based** — no low-level module patching is performed.
 *
 * @example
 * ```ts
 * import axios from "axios";
 * import { instrumentHttp } from "@dexter.js/sdk";
 * instrumentHttp({ axios });
 * ```
 *
 * TODO: Propagate traceId as an `x-dexter-trace` header for distributed tracing.
 * TODO: Capture request/response body sizes for bandwidth insights.
 * TODO: Instrument `node:http` / `node:https` request for libraries that use
 *       the low-level API directly.
 */
export function instrumentHttp(options?: { axios?: any }): void {
  patchGlobalFetch();
  if (options?.axios) {
    patchAxios(options.axios);
  }
}

// ─── Global fetch ─────────────────────────────────────────────────────────────

function patchGlobalFetch(): void {
  if (typeof globalThis.fetch !== "function") {
    // Node < 18 or fetch not available.
    return;
  }

  const originalFetch = globalThis.fetch;

  (globalThis as any).fetch = async function dexterFetch(
    input: any,
    init?: any,
  ): Promise<any> {
    const traceId = currentTraceId();
    const start = performance.now();
    const url = typeof input === "string" ? input : input?.url ?? String(input);

    try {
      const response = await originalFetch(input, init);
      emitHttpSpan(traceId, url, start);
      return response;
    } catch (err: any) {
      emitHttpSpan(traceId, url, start, err?.message);
      throw err;
    }
  };
}

// ─── Axios ────────────────────────────────────────────────────────────────────

function patchAxios(axiosInstance: any): void {
  if (!axiosInstance?.interceptors) {
    console.warn(
      "[dexter] axios.interceptors not found — skipping Axios instrumentation.",
    );
    return;
  }

  // Attach timing metadata to the config object.
  axiosInstance.interceptors.request.use((config: any) => {
    config.__dexterStart = performance.now();
    config.__dexterTraceId = currentTraceId();
    return config;
  });

  axiosInstance.interceptors.response.use(
    (response: any) => {
      const cfg = response?.config;
      if (cfg?.__dexterStart) {
        emitHttpSpan(
          cfg.__dexterTraceId ?? "unknown",
          cfg.url ?? "unknown",
          cfg.__dexterStart,
        );
      }
      return response;
    },
    (error: any) => {
      const cfg = error?.config;
      if (cfg?.__dexterStart) {
        emitHttpSpan(
          cfg.__dexterTraceId ?? "unknown",
          cfg.url ?? "unknown",
          cfg.__dexterStart,
          error?.message,
        );
      }
      return Promise.reject(error);
    },
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emitHttpSpan(
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
      type: "http",
      target,
      duration: performance.now() - start,
      timestamp: Date.now(),
      error,
    },
  });
}

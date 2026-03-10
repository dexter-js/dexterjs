// ─── API Types ───────────────────────────────────────────────────────────────

export interface OverviewData {
  status: string;
  totalRequests: number;
  errorRate: number;
  avgResponseTime: number;
  eventLoopLag: number;
  cpuUsage: number;
  memoryUsage: number;
  activeHandles: number;
}

export interface RouteData {
  route: string;
  method: string;
  p50: number;
  p95: number;
  p99: number;
  count: number;
  errorRate: number;
}

export interface LogEntry {
  id: number;
  traceId: string;
  level: "debug" | "info" | "warn" | "error";
  message: string;
  metadata: Record<string, unknown> | null;
  timestamp: number;
}

export interface SpanEntry {
  id: number;
  traceId: string;
  type: "db" | "http" | "cache" | "redis";
  target: string;
  duration: number;
  timestamp: number;
  error: string | null;
}

export interface InsightEntry {
  type: string;
  message: string;
  metadata: Record<string, unknown>;
}

// ─── Fetch helpers ───────────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export function fetchOverview(): Promise<OverviewData> {
  return fetchJson<OverviewData>("/api/overview");
}

export function fetchRoutes(): Promise<RouteData[]> {
  return fetchJson<RouteData[]>("/api/routes");
}

export function fetchLogs(limit = 100, level?: string): Promise<LogEntry[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (level && level !== "all") params.set("level", level);
  return fetchJson<LogEntry[]>(`/api/logs?${params}`);
}

export function fetchSpans(traceId: string): Promise<SpanEntry[]> {
  return fetchJson<SpanEntry[]>(`/api/spans?traceId=${encodeURIComponent(traceId)}`);
}

export function fetchInsights(): Promise<InsightEntry[]> {
  return fetchJson<InsightEntry[]>("/api/insights");
}

// ─── Metadata parsing helper ─────────────────────────────────────────────────

export function parseMetadata(
  metadata: unknown,
): Record<string, unknown> | null {
  if (metadata === null || metadata === undefined) return null;
  if (typeof metadata === "object") return metadata as Record<string, unknown>;
  if (typeof metadata === "string") {
    try {
      return JSON.parse(metadata) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

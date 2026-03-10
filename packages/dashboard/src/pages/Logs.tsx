import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchLogs,
  fetchSpans,
  parseMetadata,
  type LogEntry,
  type SpanEntry,
} from "@/api/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  Search,
  ChevronRight,
  XCircle,
  Inbox,
} from "lucide-react";

const levelColors: Record<string, string> = {
  error: "bg-red-500/15 text-red-400 border-red-500/20",
  warn: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  info: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  debug: "bg-white/[0.06] text-white/40 border-white/[0.08]",
};

function TraceChip({ traceId }: { traceId: string }) {
  const [expanded, setExpanded] = useState(false);

  const { data: spans } = useQuery({
    queryKey: ["spans", traceId],
    queryFn: () => fetchSpans(traceId),
    enabled: expanded,
  });

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <CollapsibleTrigger asChild>
        <button className="inline-flex items-center gap-1 rounded-md bg-purple-500/10 px-2 py-0.5 text-[10px] font-mono text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 transition-colors">
          <ChevronRight
            className={cn(
              "h-3 w-3 transition-transform",
              expanded && "rotate-90",
            )}
          />
          {traceId.slice(0, 8)}…
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {spans && spans.length > 0 ? (
          <div className="mt-2 ml-2 space-y-1 border-l border-purple-500/20 pl-3">
            {spans.map((span: SpanEntry) => (
              <div
                key={span.id}
                className="flex items-center gap-3 text-xs text-white/50"
              >
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-medium border",
                    span.type === "db"
                      ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                      : span.type === "http"
                        ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                        : "bg-amber-500/10 text-amber-400 border-amber-500/20",
                  )}
                >
                  {span.type}
                </span>
                <span className="font-mono truncate max-w-xs">
                  {span.target}
                </span>
                <span className="ml-auto font-mono text-white/30">
                  {span.duration.toFixed(1)}ms
                </span>
                {span.error && (
                  <span className="text-red-400 text-[10px]">⚠ {span.error}</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 ml-2 text-xs text-white/30">No spans found</p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function LogRow({ log }: { log: LogEntry }) {
  const [metaOpen, setMetaOpen] = useState(false);
  const meta = parseMetadata(log.metadata);
  const hasTrace = log.traceId && log.traceId !== "unknown";

  return (
    <div className="border-b border-white/[0.04] px-4 py-3">
      <div className="flex items-start gap-3">
        {/* Timestamp */}
        <span className="shrink-0 text-xs font-mono text-white/25 pt-0.5">
          {new Date(log.timestamp).toLocaleTimeString()}
        </span>

        {/* Level badge */}
        <span
          className={cn(
            "shrink-0 rounded border px-2 py-0.5 text-[10px] font-bold uppercase",
            levelColors[log.level] ?? levelColors.debug,
          )}
        >
          {log.level}
        </span>

        {/* Message + metadata */}
        <div className="min-w-0 flex-1">
          <p className="text-sm text-white/80 break-words">{log.message}</p>

          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
            {hasTrace && <TraceChip traceId={log.traceId} />}

            {meta && (
              <Collapsible open={metaOpen} onOpenChange={setMetaOpen}>
                <CollapsibleTrigger asChild>
                  <button className="inline-flex items-center gap-1 rounded-md bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/30 border border-white/[0.06] hover:bg-white/[0.08] transition-colors">
                    <ChevronRight
                      className={cn(
                        "h-3 w-3 transition-transform",
                        metaOpen && "rotate-90",
                      )}
                    />
                    metadata
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <pre className="mt-2 rounded-lg bg-black/30 p-3 text-xs text-white/50 overflow-auto max-h-48 font-mono border border-white/[0.04]">
                    {JSON.stringify(meta, null, 2)}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Logs() {
  const [level, setLevel] = useState("all");
  const [search, setSearch] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["logs", level],
    queryFn: () => fetchLogs(200, level),
    refetchInterval: 2000,
  });

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-white/40">
        <XCircle className="h-10 w-10 text-red-400" />
        <p className="text-sm">Cannot reach sidecar API</p>
      </div>
    );
  }

  const filtered = (data ?? []).filter(
    (log) =>
      !search || log.message.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Filter Bar */}
      <div className="flex items-center gap-4 flex-wrap">
        <Tabs value={level} onValueChange={setLevel}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="error">Error</TabsTrigger>
            <TabsTrigger value="warn">Warn</TabsTrigger>
            <TabsTrigger value="info">Info</TabsTrigger>
            <TabsTrigger value="debug">Debug</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            placeholder="Search logs…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] py-2 pl-9 pr-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-purple-500/40 transition-colors"
          />
        </div>

        <span className="ml-auto text-xs text-white/25">
          {filtered.length} logs
        </span>
      </div>

      {/* Log List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-white/40">
          <Inbox className="h-10 w-10" />
          <p className="text-sm">
            {search ? "No logs match your search" : "No logs yet"}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
          {filtered.map((log) => (
            <LogRow key={log.id} log={log} />
          ))}
        </div>
      )}
    </div>
  );
}

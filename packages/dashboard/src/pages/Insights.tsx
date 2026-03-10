import { useQuery } from "@tanstack/react-query";
import { fetchInsights, type InsightEntry } from "@/api/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { XCircle, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

const severityConfig: Record<string, { badge: string; icon: string; color: string }> = {
  critical: {
    badge: "bg-red-500/15 text-red-400 border-red-500/20",
    icon: "🔴",
    color: "border-l-red-500",
  },
  warning: {
    badge: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
    icon: "🟡",
    color: "border-l-yellow-500",
  },
  info: {
    badge: "bg-blue-500/15 text-blue-400 border-blue-500/20",
    icon: "🔵",
    color: "border-l-blue-500",
  },
};

function guessSeverity(insight: InsightEntry): string {
  const t = insight.type.toLowerCase();
  if (t.includes("n+1") || t.includes("error") || t.includes("critical"))
    return "critical";
  if (t.includes("slow") || t.includes("warn")) return "warning";
  return "info";
}

export default function Insights() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["insights"],
    queryFn: fetchInsights,
    refetchInterval: 5000,
  });

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-white/40">
        <XCircle className="h-10 w-10 text-red-400" />
        <p className="text-sm">Cannot reach sidecar API</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="grid gap-4 p-6 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-36" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-white/40">
        <FlaskConical className="h-10 w-10 text-purple-400" />
        <p className="text-sm">All systems nominal. Dexter approves 🧪</p>
        <p className="text-xs">No performance issues detected</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 p-6 lg:grid-cols-2">
      {data.map((insight, i) => {
        const severity = guessSeverity(insight);
        const config = severityConfig[severity] ?? severityConfig.info!;

        return (
          <Card
            key={i}
            className={cn("border-l-4", config.color)}
          >
            <CardHeader>
              <div className="flex items-center gap-2">
                <span>{config.icon}</span>
                <span
                  className={cn(
                    "rounded border px-2 py-0.5 text-[10px] font-bold uppercase",
                    config.badge,
                  )}
                >
                  {severity}
                </span>
                <CardTitle className="text-sm font-semibold text-white/80">
                  {insight.type}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-white/60">{insight.message}</p>
              {insight.metadata && Object.keys(insight.metadata).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {Object.entries(insight.metadata).map(([key, val]) => (
                    <span
                      key={key}
                      className="rounded-md bg-white/[0.04] px-2 py-1 text-[11px] font-mono text-white/40 border border-white/[0.06]"
                    >
                      {key}: {typeof val === "object" ? JSON.stringify(val) : String(val)}
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

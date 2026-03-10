import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchRoutes, type RouteData } from "@/api/client";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ArrowUpDown, XCircle, Inbox } from "lucide-react";

type SortKey = keyof RouteData;

const methodColor: Record<string, string> = {
  GET: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  POST: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  PUT: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  DELETE: "bg-red-500/15 text-red-400 border-red-500/20",
  PATCH: "bg-purple-500/15 text-purple-400 border-purple-500/20",
};

function p99Color(ms: number): string {
  if (ms < 200) return "text-emerald-400";
  if (ms < 500) return "text-yellow-400";
  return "text-red-400";
}

export default function Routes() {
  const [sortKey, setSortKey] = useState<SortKey>("count");
  const [sortAsc, setSortAsc] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["routes"],
    queryFn: fetchRoutes,
    refetchInterval: 5000,
  });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

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
      <div className="space-y-3 p-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-white/40">
        <Inbox className="h-10 w-10" />
        <p className="text-sm">No route data yet</p>
        <p className="text-xs">Send some requests to your app</p>
      </div>
    );
  }

  const sorted = [...data].sort((a, b) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    if (typeof aVal === "number" && typeof bVal === "number") {
      return sortAsc ? aVal - bVal : bVal - aVal;
    }
    return sortAsc
      ? String(aVal).localeCompare(String(bVal))
      : String(bVal).localeCompare(String(aVal));
  });

  // Top 3 routes by count for HOT badge
  const hotRoutes = new Set(
    [...data]
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map((r) => `${r.method} ${r.route}`),
  );

  const sortableHead = (label: string, key: SortKey) => (
    <TableHead>
      <button
        onClick={() => handleSort(key)}
        className="flex items-center gap-1 hover:text-white/70"
      >
        {label}
        <ArrowUpDown className="h-3 w-3" />
      </button>
    </TableHead>
  );

  return (
    <div className="p-6">
      <Table>
        <TableHeader>
          <TableRow>
            {sortableHead("Route", "route")}
            <TableHead>Method</TableHead>
            {sortableHead("p50", "p50")}
            {sortableHead("p95", "p95")}
            {sortableHead("p99", "p99")}
            {sortableHead("Requests", "count")}
            {sortableHead("Error Rate", "errorRate")}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row) => {
            const routeKey = `${row.method} ${row.route}`;
            const isHot = hotRoutes.has(routeKey);
            return (
              <TableRow key={routeKey}>
                <TableCell className="font-mono text-sm text-white/80">
                  {row.route}
                  {isHot && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-medium text-orange-400 border border-orange-500/20">
                      🔥 HOT
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold",
                      methodColor[row.method] ?? "bg-white/10 text-white/60",
                    )}
                  >
                    {row.method}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-sm text-white/60">
                  {row.p50.toFixed(1)}ms
                </TableCell>
                <TableCell className="font-mono text-sm text-white/60">
                  {row.p95.toFixed(1)}ms
                </TableCell>
                <TableCell
                  className={cn("font-mono text-sm", p99Color(row.p99))}
                >
                  {row.p99.toFixed(1)}ms
                </TableCell>
                <TableCell className="font-mono text-sm text-white/80">
                  {row.count.toLocaleString()}
                </TableCell>
                <TableCell
                  className={cn(
                    "font-mono text-sm",
                    row.errorRate > 10
                      ? "text-red-400"
                      : row.errorRate > 0
                        ? "text-yellow-400"
                        : "text-white/40",
                  )}
                >
                  {row.errorRate.toFixed(1)}%
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

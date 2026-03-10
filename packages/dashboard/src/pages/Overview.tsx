import { useQuery } from "@tanstack/react-query";
import { useRef, useCallback } from "react";
import { fetchOverview, type OverviewData } from "@/api/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  Clock,
  Cpu,
  HardDrive,
  Gauge,
  CheckCircle,
  XCircle,
} from "lucide-react";

interface Snapshot {
  time: string;
  avgResponseTime: number;
  errorRate: number;
}

const MAX_SNAPSHOTS = 20;

export default function Overview() {
  const snapshotsRef = useRef<Snapshot[]>([]);

  const updateSnapshots = useCallback((data: OverviewData) => {
    const snap: Snapshot = {
      time: new Date().toLocaleTimeString(),
      avgResponseTime: Math.round(data.avgResponseTime * 100) / 100,
      errorRate: Math.round(data.errorRate * 100) / 100,
    };
    const next = [...snapshotsRef.current, snap].slice(-MAX_SNAPSHOTS);
    snapshotsRef.current = next;
    return next;
  }, []);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["overview"],
    queryFn: fetchOverview,
    refetchInterval: 3000,
    select: (raw) => ({
      overview: raw,
      snapshots: updateSnapshots(raw),
    }),
  });

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-white/40">
        <XCircle className="h-10 w-10 text-red-400" />
        <p className="text-sm">Cannot reach sidecar API</p>
        <p className="text-xs">
          Make sure the sidecar is running on port 4000
        </p>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-16 w-full" />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const { overview, snapshots } = data;
  const errorRate = overview.errorRate;
  const lag = overview.eventLoopLag;

  const healthStatus =
    errorRate > 10 || lag > 100
      ? { label: "Degraded", color: "border-red-500/30 bg-red-500/5 text-red-400", icon: AlertTriangle }
      : errorRate > 5 || lag > 50
        ? { label: "Warning", color: "border-yellow-500/30 bg-yellow-500/5 text-yellow-400", icon: AlertTriangle }
        : { label: "Healthy", color: "border-emerald-500/30 bg-emerald-500/5 text-emerald-400", icon: CheckCircle };

  const HealthIcon = healthStatus.icon;

  const stats = [
    {
      label: "Total Requests",
      value: overview.totalRequests.toLocaleString(),
      icon: Activity,
    },
    {
      label: "Error Rate",
      value: `${overview.errorRate.toFixed(1)}%`,
      icon: AlertTriangle,
    },
    {
      label: "Avg Response",
      value: `${overview.avgResponseTime.toFixed(1)}ms`,
      icon: Clock,
    },
    {
      label: "Event Loop Lag",
      value: `${overview.eventLoopLag.toFixed(1)}ms`,
      icon: Gauge,
    },
    {
      label: "CPU Usage",
      value: `${overview.cpuUsage.toFixed(1)}%`,
      icon: Cpu,
    },
    {
      label: "Memory",
      value: `${(overview.memoryUsage / 1024 / 1024).toFixed(1)} MB`,
      icon: HardDrive,
    },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* Health Banner */}
      <div
        className={`flex items-center gap-3 rounded-lg border px-5 py-3 ${healthStatus.color}`}
      >
        <HealthIcon className="h-5 w-5" />
        <span className="text-sm font-medium">{healthStatus.label}</span>
        <span className="text-xs opacity-60">
          {healthStatus.label === "Healthy"
            ? "All systems nominal"
            : `Error rate ${errorRate.toFixed(1)}% · Loop lag ${lag.toFixed(1)}ms`}
        </span>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon className="h-3.5 w-3.5" />
                {label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tracking-tight text-white">
                {value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Response Time Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={snapshots}>
                  <defs>
                    <linearGradient id="gradPurple" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a855f7" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="time"
                    tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    unit="ms"
                    width={50}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#1a1b26",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "rgba(255,255,255,0.5)" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="avgResponseTime"
                    stroke="#a855f7"
                    fill="url(#gradPurple)"
                    strokeWidth={2}
                    name="Avg Response (ms)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Error Rate Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={snapshots}>
                  <defs>
                    <linearGradient id="gradRed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="time"
                    tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    unit="%"
                    width={50}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#1a1b26",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "rgba(255,255,255,0.5)" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="errorRate"
                    stroke="#ef4444"
                    fill="url(#gradRed)"
                    strokeWidth={2}
                    name="Error Rate (%)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

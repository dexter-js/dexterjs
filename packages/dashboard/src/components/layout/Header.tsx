import { useQuery } from "@tanstack/react-query";
import { fetchOverview } from "@/api/client";
import { FlaskConical } from "lucide-react";

export function Header() {
  const { data } = useQuery({
    queryKey: ["overview"],
    queryFn: fetchOverview,
    refetchInterval: 3000,
  });

  const errorRate = data?.errorRate ?? 0;
  const lag = data?.eventLoopLag ?? 0;
  const dotColor =
    errorRate > 10 || lag > 100
      ? "bg-red-500 shadow-red-500/50"
      : errorRate > 5 || lag > 50
        ? "bg-yellow-500 shadow-yellow-500/50"
        : "bg-emerald-500 shadow-emerald-500/50";

  return (
    <header className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
      <div className="flex items-center gap-3">
        <FlaskConical className="h-6 w-6 text-purple-400" />
        <div>
          <h1 className="text-lg font-bold tracking-tight text-white">
            DexterJS
          </h1>
          <p className="text-xs text-white/40">Your app's secret lab</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <span className="text-xs text-white/30">
          {new Date().toLocaleTimeString()}
        </span>
        <div className="flex items-center gap-2">
          <div
            className={`h-2.5 w-2.5 rounded-full shadow-[0_0_8px] ${dotColor}`}
          />
          <span className="text-xs text-white/50">
            {data ? data.status : "connecting…"}
          </span>
        </div>
      </div>
    </header>
  );
}

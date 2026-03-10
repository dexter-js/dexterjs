import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Route,
  ScrollText,
  Lightbulb,
} from "lucide-react";

const tabs = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/routes", label: "Routes", icon: Route },
  { to: "/logs", label: "Logs", icon: ScrollText },
  { to: "/insights", label: "Insights", icon: Lightbulb },
] as const;

export function TabNav() {
  return (
    <nav className="flex gap-1 border-b border-white/[0.06] px-6">
      {tabs.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors",
              isActive
                ? "border-purple-500 text-white"
                : "border-transparent text-white/40 hover:text-white/70",
            )
          }
        >
          <Icon className="h-4 w-4" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

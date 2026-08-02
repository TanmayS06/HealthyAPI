import React from "react";

export type MonitorStatus = "operational" | "down" | "degraded" | "pending" | string;

interface StatusBadgeProps {
  status: MonitorStatus;
  showPulse?: boolean;
  size?: "sm" | "md" | "lg";
}

export function StatusBadge({ status, showPulse = true, size = "md" }: StatusBadgeProps) {
  const norm = status?.toLowerCase() || "pending";

  let bgClass = "bg-slate-800 text-slate-300 border-slate-700";
  let dotClass = "bg-slate-400";
  let label = "Pending";

  if (norm === "operational" || norm === "up") {
    bgClass = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    dotClass = "bg-emerald-400";
    label = "Operational";
  } else if (norm === "down" || norm === "major_outage") {
    bgClass = "bg-rose-500/10 text-rose-400 border-rose-500/20";
    dotClass = "bg-rose-500";
    label = "Outage";
  } else if (norm === "degraded" || norm === "partial_outage") {
    bgClass = "bg-amber-500/10 text-amber-400 border-amber-500/20";
    dotClass = "bg-amber-400";
    label = "Degraded";
  }

  const sizeClasses = {
    sm: "px-2 py-0.5 text-xs gap-1.5",
    md: "px-2.5 py-1 text-xs font-medium gap-2",
    lg: "px-3.5 py-1.5 text-sm font-medium gap-2.5",
  }[size];

  return (
    <span
      className={`inline-flex items-center rounded-full border transition-colors ${sizeClasses} ${bgClass}`}
    >
      <span className="relative flex h-2 w-2">
        {showPulse && norm === "operational" && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        )}
        {showPulse && (norm === "down" || norm === "major_outage") && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${dotClass}`}></span>
      </span>
      <span>{label}</span>
    </span>
  );
}

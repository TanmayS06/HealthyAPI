"use client";

import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

interface ChartDataPoint {
  timestamp: string;
  avgResponseTime: number;
  uptimePercent: number;
  checks: number;
  failures: number;
}

interface UptimeBarChartProps {
  data: ChartDataPoint[];
}

export function UptimeBarChart({ data }: UptimeBarChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-slate-500 glass-card rounded-xl">
        <p className="text-sm">No uptime distribution data available.</p>
      </div>
    );
  }

  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis
            dataKey="timestamp"
            stroke="#64748b"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: "#334155" }}
          />
          <YAxis
            stroke="#64748b"
            fontSize={11}
            domain={[0, 100]}
            tickLine={false}
            axisLine={false}
            unit="%"
          />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const item = payload[0].payload as ChartDataPoint;
                return (
                  <div className="rounded-lg border border-slate-700 bg-slate-900/95 p-3 shadow-xl backdrop-blur-md">
                    <p className="text-xs font-semibold text-slate-300">{item.timestamp}</p>
                    <div className="mt-1 space-y-1 text-xs">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-slate-400">Availability:</span>
                        <span
                          className={`font-mono font-bold ${
                            item.uptimePercent === 100
                              ? "text-emerald-400"
                              : item.uptimePercent > 95
                              ? "text-amber-400"
                              : "text-rose-400"
                          }`}
                        >
                          {item.uptimePercent}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-slate-400">Total Checks:</span>
                        <span className="font-mono text-slate-300">{item.checks}</span>
                      </div>
                      {item.failures > 0 && (
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-rose-400">Failures:</span>
                          <span className="font-mono text-rose-400">{item.failures}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }
              return null;
            }}
          />
          <Bar
            dataKey="uptimePercent"
            fill="#38bdf8"
            radius={[4, 4, 0, 0]}
            maxBarSize={32}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

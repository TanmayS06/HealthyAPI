"use client";

import React from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

interface ChartDataPoint {
  timestamp: string;
  avgResponseTime: number;
  uptimePercent: number;
  checks: number;
  failures: number;
}

interface ResponseTimeChartProps {
  data: ChartDataPoint[];
  p95?: number;
}

export function ResponseTimeChart({ data, p95 }: ResponseTimeChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-slate-500 glass-card rounded-xl">
        <p className="text-sm">No historical check telemetry available for this range.</p>
        <p className="text-xs text-slate-600 mt-1">Checks will populate once worker executes.</p>
      </div>
    );
  }

  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="latencyGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
            </linearGradient>
          </defs>
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
            tickLine={false}
            axisLine={false}
            unit="ms"
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
                        <span className="text-slate-400">Response Time:</span>
                        <span className="font-mono font-bold text-emerald-400">
                          {item.avgResponseTime} ms
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-slate-400">Uptime:</span>
                        <span className="font-mono text-slate-200">
                          {item.uptimePercent}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-slate-400">Checks:</span>
                        <span className="font-mono text-slate-300">
                          {item.checks} ({item.failures} failed)
                        </span>
                      </div>
                    </div>
                  </div>
                );
              }
              return null;
            }}
          />
          {p95 && p95 > 0 && (
            <ReferenceLine
              y={p95}
              stroke="#f59e0b"
              strokeDasharray="4 4"
              label={{
                value: `p95 (${p95}ms)`,
                fill: "#f59e0b",
                fontSize: 10,
                position: "insideTopRight",
              }}
            />
          )}
          <Area
            type="monotone"
            dataKey="avgResponseTime"
            stroke="#10b981"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#latencyGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

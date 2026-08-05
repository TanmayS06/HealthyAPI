"use client";

import React, { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Play,
  Trash2,
  Pause,
  Clock,
  Activity,
  AlertTriangle,
  Server,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ResponseTimeChart } from "@/components/charts/ResponseTimeChart";
import { UptimeBarChart } from "@/components/charts/UptimeBarChart";
import { CheckHistoryTable } from "@/components/monitors/CheckHistoryTable";

interface MonitorDetails {
  id: string;
  name: string;
  url: string;
  method: string;
  intervalSeconds: number;
  timeoutMs: number;
  expectedStatusCode: number;
  failureThreshold: number;
  recoveryThreshold: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  isActive: boolean;
  lastStatus: string;
  lastCheckedAt?: string | null;
  createdAt: string;
  incidents: Array<{
    id: string;
    startedAt: string;
    resolvedAt?: string | null;
    reason: string;
    status: string;
  }>;
}

interface AnalyticsData {
  range: "24h" | "7d" | "30d";
  uptimePercentage: number;
  totalChecks: number;
  successfulChecks: number;
  failedChecks: number;
  avgResponseTimeMs: number;
  p95ResponseTimeMs: number;
  minResponseTimeMs: number;
  maxResponseTimeMs: number;
  chartData: Array<{
    timestamp: string;
    avgResponseTime: number;
    uptimePercent: number;
    checks: number;
    failures: number;
  }>;
  recentChecks: Array<{
    id: string;
    checkedAt: string;
    statusCode: number | null;
    responseTimeMs: number;
    success: boolean;
    errorType: string | null;
    errorMessage: string | null;
  }>;
}

export default function MonitorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const monitorId = resolvedParams.id;
  const router = useRouter();

  const [monitor, setMonitor] = useState<MonitorDetails | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [timeRange, setTimeRange] = useState<"24h" | "7d" | "30d">("24h");
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [monRes, anaRes] = await Promise.all([
        fetch(`/api/monitors/${monitorId}`),
        fetch(`/api/monitors/${monitorId}/analytics?range=${timeRange}`),
      ]);

      if (monRes.ok) {
        const monData = await monRes.json();
        setMonitor(monData.monitor);
      } else if (monRes.status === 404) {
        router.push("/dashboard/monitors");
        return;
      }

      if (anaRes.ok) {
        const anaData = await anaRes.json();
        setAnalytics(anaData.analytics);
      }
    } catch (err) {
      console.error("Monitor fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [monitorId, timeRange, router]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 12000);
    return () => clearInterval(interval);
  }, [fetchData]);

  async function handleManualCheck() {
    setChecking(true);
    try {
      await fetch(`/api/monitors/${monitorId}/check`, { method: "POST" });
      await fetchData();
    } catch (err) {
      console.error("Manual check error:", err);
    } finally {
      setChecking(false);
    }
  }

  async function handleToggleActive() {
    if (!monitor) return;
    setActionLoading(true);
    try {
      await fetch(`/api/monitors/${monitorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !monitor.isActive }),
      });
      await fetchData();
    } catch (err) {
      console.error("Toggle active error:", err);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Are you sure you want to delete this monitor? All check history and incidents will be removed.")) {
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch(`/api/monitors/${monitorId}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/dashboard/monitors");
        router.refresh();
      }
    } catch (err) {
      console.error("Delete monitor error:", err);
    } finally {
      setActionLoading(false);
    }
  }

  if (loading && !monitor) {
    return (
      <div className="p-16 text-center text-slate-500 glass-card rounded-2xl animate-pulse">
        Loading monitor analytics and telemetry...
      </div>
    );
  }

  if (!monitor) {
    return null;
  }

  return (
    <div className="space-y-8">
      {/* Back button */}
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
        </Link>
      </div>

      {/* Header Banner */}
      <div className="glass-panel p-6 sm:p-8 rounded-2xl border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                {monitor.name}
              </h1>
              <StatusBadge status={monitor.lastStatus} size="lg" />
              {!monitor.isActive && (
                <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                  Paused
                </span>
              )}
            </div>

            <div className="mt-2 flex items-center gap-2 text-xs font-mono text-slate-400">
              <span className="font-bold text-slate-300">{monitor.method}</span>
              <a
                href={monitor.url}
                target="_blank"
                rel="noreferrer"
                className="text-emerald-400 hover:underline flex items-center gap-1"
              >
                {monitor.url} <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="mt-3 flex items-center gap-4 text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                Checked every {monitor.intervalSeconds}s
              </span>
              <span>•</span>
              <span>Timeout: {monitor.timeoutMs}ms</span>
              <span>•</span>
              <span>Expected HTTP: {monitor.expectedStatusCode}</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={handleManualCheck}
              disabled={checking}
              className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs tracking-wide transition shadow-lg shadow-emerald-500/20 flex items-center gap-2 disabled:opacity-50"
            >
              <Play className={`w-3.5 h-3.5 ${checking ? "animate-spin" : ""}`} />
              {checking ? "Checking..." : "Run Check Now"}
            </button>

            <button
              onClick={handleToggleActive}
              disabled={actionLoading}
              className="px-3.5 py-2.5 rounded-xl glass-card hover:bg-slate-800 text-slate-300 text-xs font-medium transition"
              title={monitor.isActive ? "Pause monitor" : "Resume monitor"}
            >
              {monitor.isActive ? (
                <span className="flex items-center gap-1.5 text-amber-400">
                  <Pause className="w-3.5 h-3.5" /> Pause
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <Play className="w-3.5 h-3.5" /> Resume
                </span>
              )}
            </button>

            <button
              onClick={handleDelete}
              disabled={actionLoading}
              className="p-2.5 rounded-xl glass-card hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 border-slate-800 transition"
              title="Delete monitor"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Range Filter Controls */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          Availability & Latency Metrics
        </h2>

        <div className="flex items-center rounded-xl bg-slate-900 border border-slate-800 p-1 text-xs">
          {(["24h", "7d", "30d"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setTimeRange(r)}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                timeRange === r
                  ? "bg-slate-800 text-emerald-400 shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {r === "24h" ? "24 Hours" : r === "7d" ? "7 Days" : "30 Days"}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="glass-panel p-5 rounded-2xl border border-slate-800">
          <span className="text-xs text-slate-400">Check-Based Uptime</span>
          <p
            className={`text-3xl font-extrabold font-mono mt-1 ${
              (analytics?.uptimePercentage ?? 100) === 100
                ? "text-emerald-400"
                : (analytics?.uptimePercentage ?? 100) > 95
                ? "text-amber-400"
                : "text-rose-400"
            }`}
          >
            {analytics?.uptimePercentage ?? 100}%
          </p>
          <span className="text-[11px] text-slate-500 mt-1 block">
            {analytics?.successfulChecks ?? 0} of {analytics?.totalChecks ?? 0} checks
          </span>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-slate-800">
          <span className="text-xs text-slate-400">Average Latency</span>
          <p className="text-3xl font-extrabold font-mono text-sky-400 mt-1">
            {analytics?.avgResponseTimeMs ?? 0} ms
          </p>
          <span className="text-[11px] text-slate-500 mt-1 block">
            Min: {analytics?.minResponseTimeMs ?? 0}ms • Max: {analytics?.maxResponseTimeMs ?? 0}ms
          </span>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-slate-800">
          <span className="text-xs text-slate-400">P95 Tail Latency</span>
          <p className="text-3xl font-extrabold font-mono text-amber-400 mt-1">
            {analytics?.p95ResponseTimeMs ?? 0} ms
          </p>
          <span className="text-[11px] text-slate-500 mt-1 block">95% of checks were faster</span>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-slate-800">
          <span className="text-xs text-slate-400">Check Failures</span>
          <p
            className={`text-3xl font-extrabold font-mono mt-1 ${
              (analytics?.failedChecks ?? 0) > 0 ? "text-rose-400" : "text-slate-300"
            }`}
          >
            {analytics?.failedChecks ?? 0}
          </p>
          <span className="text-[11px] text-slate-500 mt-1 block">
            Threshold: {monitor.failureThreshold} consecutive
          </span>
        </div>
      </div>

      {/* Recharts Response Time Area Chart */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white">Response Time Telemetry</h3>
            <p className="text-xs text-slate-400">Average round-trip latency in milliseconds</p>
          </div>
          <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            Real-time Bounded HTTP Checks
          </span>
        </div>
        <ResponseTimeChart
          data={analytics?.chartData ?? []}
          p95={analytics?.p95ResponseTimeMs}
        />
      </div>

      {/* Recharts Uptime Bar Chart */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white">Uptime Availability Distribution</h3>
            <p className="text-xs text-slate-400">Successful check percentage per interval bucket</p>
          </div>
        </div>
        <UptimeBarChart data={analytics?.chartData ?? []} />
      </div>

      {/* Incidents Section */}
      {monitor.incidents && monitor.incidents.length > 0 && (
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            Outage & Incident History
          </h3>
          <div className="space-y-2">
            {monitor.incidents.map((inc) => (
              <div
                key={inc.id}
                className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs flex items-center justify-between"
              >
                <div>
                  <span
                    className={`font-semibold ${
                      inc.status === "OPEN" ? "text-rose-400" : "text-emerald-400"
                    }`}
                  >
                    [{inc.status}] {inc.reason}
                  </span>
                  <p className="text-slate-400 mt-1">
                    Started: {new Date(inc.startedAt).toLocaleString()}
                    {inc.resolvedAt && ` • Resolved: ${new Date(inc.resolvedAt).toLocaleString()}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Check History Table */}
      <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-800/80 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white">Recent Execution History</h3>
            <p className="text-xs text-slate-400">Latest 20 health checks recorded in PostgreSQL</p>
          </div>
          <button
            onClick={fetchData}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Refresh history"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <CheckHistoryTable checks={analytics?.recentChecks ?? []} />
      </div>
    </div>
  );
}

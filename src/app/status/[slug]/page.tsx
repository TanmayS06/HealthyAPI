"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";

interface PublicStatusData {
  title: string;
  description?: string | null;
  slug: string;
  overallStatus: "ALL_OPERATIONAL" | "PARTIAL_OUTAGE" | "MAJOR_OUTAGE";
  updatedAt: string;
  monitors: Array<{
    id: string;
    name: string;
    status: string;
    uptimePercent: number;
    avgResponseTime: number;
    lastCheckedAt?: string | null;
  }>;
  incidents: Array<{
    id: string;
    serviceName: string;
    status: string;
    reason: string;
    startedAt: string;
    resolvedAt?: string | null;
  }>;
}

export default function PublicStatusPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const resolvedParams = use(params);
  const slug = resolvedParams.slug;

  const [data, setData] = useState<PublicStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchStatus() {
    try {
      const res = await fetch(`/api/status-pages/${slug}`);
      if (!res.ok) {
        setError("Status page not found or currently unavailable.");
        return;
      }
      const json = await res.json();
      setData(json.statusPage);
    } catch {
      setError("Unable to load real-time status telemetry.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 20000); // 20s live refresh
    return () => clearInterval(interval);
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#090d16] flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <Activity className="w-8 h-8 text-emerald-400 animate-pulse mx-auto" />
          <p className="text-sm text-slate-400">Loading system status...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#090d16] flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-md glass-panel p-8 rounded-2xl border border-slate-800">
          <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
          <h1 className="text-lg font-bold text-white">Status Page Unavailable</h1>
          <p className="text-xs text-slate-400">{error || "Page not found."}</p>
          <Link
            href="/"
            className="inline-block mt-2 text-xs font-semibold text-emerald-400 hover:underline"
          >
            ← Return to HealthyAPI
          </Link>
        </div>
      </div>
    );
  }

  const isAllOperational = data.overallStatus === "ALL_OPERATIONAL";
  const isMajorOutage = data.overallStatus === "MAJOR_OUTAGE";

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 selection:bg-emerald-500/30">
      {/* Top Brand Header */}
      <header className="border-b border-slate-800/80 bg-[#090d16]/80 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </div>
            <span className="font-bold text-white text-base tracking-tight">
              {data.title}
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="hidden sm:inline">Live Status</span>
            <button
              onClick={fetchStatus}
              className="p-1.5 rounded-lg glass-card hover:text-white transition"
              title="Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-10 space-y-8">
        {/* Title Description */}
        {data.description && (
          <p className="text-xs sm:text-sm text-slate-400 text-center max-w-xl mx-auto">
            {data.description}
          </p>
        )}

        {/* Global Operational Hero Banner */}
        <div
          className={`p-6 rounded-2xl border transition shadow-xl ${
            isAllOperational
              ? "bg-emerald-500/10 border-emerald-500/30 glow-emerald"
              : isMajorOutage
              ? "bg-rose-500/10 border-rose-500/30 glow-rose"
              : "bg-amber-500/10 border-amber-500/30"
          }`}
        >
          <div className="flex items-center gap-3.5">
            {isAllOperational ? (
              <CheckCircle2 className="w-7 h-7 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-7 h-7 text-rose-400 shrink-0" />
            )}

            <div>
              <h2 className="text-lg sm:text-xl font-extrabold text-white">
                {isAllOperational
                  ? "All Systems Operational"
                  : isMajorOutage
                  ? "Major Service Outage Detected"
                  : "Degraded System Performance"}
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                {isAllOperational
                  ? "All verified endpoints are responding within nominal latency thresholds."
                  : "Engineers are monitoring ongoing service disruptions."}
              </p>
            </div>
          </div>
        </div>

        {/* Monitored Services List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between pb-1 border-b border-slate-800">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Services & Core Components
            </h3>
            <span className="text-xs text-slate-500 font-mono">7-Day Uptime</span>
          </div>

          <div className="space-y-2.5">
            {data.monitors.map((service) => (
              <div
                key={service.id}
                className="glass-panel p-4 rounded-xl border border-slate-800 flex items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <span className="font-semibold text-sm text-white">{service.name}</span>
                    <StatusBadge status={service.status} size="sm" />
                  </div>
                  <div className="text-xs text-slate-500 flex items-center gap-2">
                    <span>Latency: ~{service.avgResponseTime}ms</span>
                    {service.lastCheckedAt && (
                      <>
                        <span>•</span>
                        <span>
                          Updated {new Date(service.lastCheckedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <span
                    className={`text-sm font-bold font-mono ${
                      service.uptimePercent === 100
                        ? "text-emerald-400"
                        : service.uptimePercent > 95
                        ? "text-amber-400"
                        : "text-rose-400"
                    }`}
                  >
                    {service.uptimePercent}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Incidents History */}
        <div className="space-y-4 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 pb-1 border-b border-slate-800">
            Incident History & Outage Log
          </h3>

          {data.incidents.length === 0 ? (
            <div className="glass-card p-6 rounded-xl text-center text-xs text-slate-500">
              No outages recorded in recent monitoring history.
            </div>
          ) : (
            <div className="space-y-3">
              {data.incidents.map((inc) => (
                <div
                  key={inc.id}
                  className="glass-panel p-4 rounded-xl border border-slate-800 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm">
                      {inc.serviceName}: {inc.reason}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        inc.status === "OPEN"
                          ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      }`}
                    >
                      {inc.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-slate-400 text-[11px]">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-500" />
                      Started {new Date(inc.startedAt).toLocaleString()}
                    </span>
                    {inc.resolvedAt && (
                      <>
                        <span>•</span>
                        <span className="text-emerald-400">
                          Resolved {new Date(inc.resolvedAt).toLocaleString()}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Public Footer */}
      <footer className="border-t border-slate-800/60 py-8 text-center text-xs text-slate-500">
        <div className="flex items-center justify-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-emerald-400" />
          <span>Powered by</span>
          <Link href="/" className="font-semibold text-slate-300 hover:text-white transition">
            HealthyAPI
          </Link>
          <span>API Monitoring Platform</span>
        </div>
      </footer>
    </div>
  );
}

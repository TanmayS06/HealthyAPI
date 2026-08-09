"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Server,
  Activity,
  AlertTriangle,
  Clock,
  PlusCircle,
  RefreshCw,
  ArrowRight,
  ShieldAlert,
  Radio,
} from "lucide-react";
import { MonitorCard } from "@/components/monitors/MonitorCard";
import { StatusBadge } from "@/components/ui/StatusBadge";

interface MonitorItem {
  id: string;
  name: string;
  url: string;
  method: string;
  intervalSeconds: number;
  lastStatus: string;
  lastCheckedAt?: string | null;
  isActive: boolean;
  consecutiveFailures: number;
  _count: {
    checkResults: number;
    incidents: number;
  };
}

interface IncidentItem {
  id: string;
  startedAt: string;
  resolvedAt?: string | null;
  reason: string;
  status: string;
  monitor: {
    name: string;
    url: string;
  };
}

export default function DashboardOverviewPage() {
  const [monitors, setMonitors] = useState<MonitorItem[]>([]);
  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboardData = useCallback(async () => {
    try {
      const [monitorsRes, incidentsRes] = await Promise.all([
        fetch("/api/monitors"),
        fetch("/api/incidents?status=ACTIVE"),
      ]);

      if (monitorsRes.ok) {
        const data = await monitorsRes.json();
        setMonitors(data.monitors || []);
      }

      if (incidentsRes.ok) {
        const data = await incidentsRes.json();
        setIncidents(data.incidents || []);
      }
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
    // Auto refresh every 15 seconds
    const interval = setInterval(fetchDashboardData, 15000);
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  // Aggregate stats
  const totalMonitors = monitors.length;
  const operationalCount = monitors.filter((m) => m.lastStatus === "operational").length;
  const downCount = monitors.filter((m) => m.lastStatus === "down").length;
  const openIncidentsCount = incidents.length;
  const healthPercent =
    totalMonitors > 0 ? Math.round((operationalCount / totalMonitors) * 100) : 100;

  return (
    <div className="space-y-8">
      {/* Header with Title and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
            System Overview
            <span className="flex items-center gap-1.5 text-xs font-mono font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
              <Radio className="w-3 h-3 animate-pulse" />
              Live Telemetry
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Real-time synthetic endpoint availability and operational health
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setRefreshing(true);
              fetchDashboardData();
            }}
            disabled={refreshing}
            className="p-2.5 rounded-xl glass-card text-slate-300 hover:text-white hover:border-slate-700 transition"
            title="Refresh status"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin text-emerald-400" : ""}`} />
          </button>

          <Link
            href="/dashboard/monitors/new"
            className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs tracking-wide transition shadow-lg shadow-emerald-500/20 flex items-center gap-2"
          >
            <PlusCircle className="w-4 h-4" />
            Add Monitor
          </Link>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Overall Health */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Cluster Availability</span>
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-3xl font-extrabold font-mono ${
                healthPercent === 100
                  ? "text-emerald-400"
                  : healthPercent > 80
                  ? "text-amber-400"
                  : "text-rose-400"
              }`}
            >
              {healthPercent}%
            </span>
            <span className="text-xs text-slate-500">operational</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400">
            {operationalCount} of {totalMonitors} endpoints healthy
          </div>
        </div>

        {/* KPI 2: Total Monitors */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Monitored Endpoints</span>
            <Server className="w-4 h-4 text-sky-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold font-mono text-white">
              {totalMonitors}
            </span>
            <span className="text-xs text-slate-500">active targets</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400">
            Background checks queued in BullMQ
          </div>
        </div>

        {/* KPI 3: Active Incidents */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Active Outages</span>
            <AlertTriangle className={`w-4 h-4 ${openIncidentsCount > 0 ? "text-rose-400" : "text-slate-500"}`} />
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-3xl font-extrabold font-mono ${
                openIncidentsCount > 0 ? "text-rose-400" : "text-emerald-400"
              }`}
            >
              {openIncidentsCount}
            </span>
            <span className="text-xs text-slate-500">active incidents</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400">
            {openIncidentsCount === 0 ? "All thresholds operating normally" : "Action required"}
          </div>
        </div>

        {/* KPI 4: Disrupted Services */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Down Services</span>
            <ShieldAlert className="w-4 h-4 text-rose-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold font-mono text-white">
              {downCount}
            </span>
            <span className="text-xs text-slate-500">failing checks</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400">
            Automated notifications active
          </div>
        </div>
      </div>

      {/* Active Incidents Banner (if any) */}
      {incidents.length > 0 && (
        <div className="glass-panel p-5 rounded-2xl border border-rose-500/30 bg-rose-500/5 glow-rose">
          <div className="flex items-center gap-2 text-rose-400 font-bold text-sm mb-3">
            <AlertTriangle className="w-5 h-5" />
            <span>Active Outages Requiring Attention ({incidents.length})</span>
          </div>
          <div className="space-y-2">
            {incidents.map((inc) => (
              <div
                key={inc.id}
                className="flex items-center justify-between p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs"
              >
                <div>
                  <span className="font-semibold text-white">{inc.monitor.name}</span>
                  <p className="text-slate-400 mt-0.5">{inc.reason}</p>
                </div>
                <Link
                  href="/dashboard/incidents"
                  className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-medium transition"
                >
                  Manage Incident →
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Monitors List Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            Monitored Endpoints
            <span className="text-xs font-normal text-slate-400 font-mono">
              ({monitors.length})
            </span>
          </h2>
          <Link
            href="/dashboard/monitors"
            className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
          >
            View All Monitors <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500 glass-card rounded-2xl animate-pulse">
            Loading active telemetry monitors...
          </div>
        ) : monitors.length === 0 ? (
          /* Empty state */
          <div className="glass-panel rounded-2xl p-10 text-center border border-slate-800 max-w-xl mx-auto">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto mb-4">
              <Server className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">No API monitors configured</h3>
            <p className="text-xs sm:text-sm text-slate-400 mb-6 leading-relaxed">
              Register your first HTTP or HTTPS endpoint to begin automated availability checks,
              latency percentiles tracking, and downtime alerting.
            </p>
            <Link
              href="/dashboard/monitors/new"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs tracking-wide transition shadow-lg shadow-emerald-500/20"
            >
              <PlusCircle className="w-4 h-4" />
              Configure First Monitor
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {monitors.map((monitor) => (
              <MonitorCard
                key={monitor.id}
                id={monitor.id}
                name={monitor.name}
                url={monitor.url}
                method={monitor.method}
                intervalSeconds={monitor.intervalSeconds}
                lastStatus={monitor.lastStatus}
                lastCheckedAt={monitor.lastCheckedAt}
                isActive={monitor.isActive}
                consecutiveFailures={monitor.consecutiveFailures}
                onCheckCompleted={fetchDashboardData}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

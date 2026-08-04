"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Server, PlusCircle, Search, RefreshCw } from "lucide-react";
import { MonitorCard } from "@/components/monitors/MonitorCard";

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
}

export default function MonitorsListPage() {
  const [monitors, setMonitors] = useState<MonitorItem[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  const fetchMonitors = useCallback(async () => {
    try {
      const res = await fetch("/api/monitors");
      if (res.ok) {
        const data = await res.json();
        setMonitors(data.monitors || []);
      }
    } catch (err) {
      console.error("Fetch monitors error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMonitors();
  }, [fetchMonitors]);

  const filteredMonitors = monitors.filter((m) => {
    const matchesSearch =
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.url.toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) return false;
    if (statusFilter === "all") return true;
    if (statusFilter === "paused") return !m.isActive;
    return m.lastStatus === statusFilter;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Server className="w-6 h-6 text-emerald-400" />
            API Monitors
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Manage your monitored HTTP endpoints, check frequencies, and alerts
          </p>
        </div>

        <Link
          href="/dashboard/monitors/new"
          className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs tracking-wide transition shadow-lg shadow-emerald-500/20 flex items-center gap-2 self-start sm:self-auto"
        >
          <PlusCircle className="w-4 h-4" />
          Add Monitor
        </Link>
      </div>

      {/* Search and Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 glass-panel p-3 rounded-2xl border border-slate-800">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by name or URL..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-800 focus:border-emerald-500 text-xs text-slate-200 placeholder-slate-500 outline-none transition"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 outline-none transition w-full sm:w-auto"
          >
            <option value="all">All Statuses ({monitors.length})</option>
            <option value="operational">Operational</option>
            <option value="down">Outages</option>
            <option value="degraded">Degraded</option>
            <option value="paused">Paused</option>
          </select>

          <button
            onClick={fetchMonitors}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="p-12 text-center text-slate-500 glass-card rounded-2xl animate-pulse">
          Loading monitors...
        </div>
      ) : filteredMonitors.length === 0 ? (
        <div className="glass-panel p-10 text-center rounded-2xl border border-slate-800 text-slate-400 text-xs">
          {search || statusFilter !== "all"
            ? "No monitors match your search filter."
            : "No monitors added yet. Click 'Add Monitor' to get started."}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredMonitors.map((m) => (
            <MonitorCard
              key={m.id}
              id={m.id}
              name={m.name}
              url={m.url}
              method={m.method}
              intervalSeconds={m.intervalSeconds}
              lastStatus={m.lastStatus}
              lastCheckedAt={m.lastCheckedAt}
              isActive={m.isActive}
              consecutiveFailures={m.consecutiveFailures}
              onCheckCompleted={fetchMonitors}
            />
          ))}
        </div>
      )}
    </div>
  );
}

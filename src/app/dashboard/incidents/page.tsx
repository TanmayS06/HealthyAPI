"use client";

import React, { useEffect, useState, useCallback } from "react";
import { AlertTriangle, CheckCircle, Clock, Check, Bell, RefreshCw } from "lucide-react";

interface IncidentItem {
  id: string;
  startedAt: string;
  resolvedAt?: string | null;
  reason: string;
  status: string;
  acknowledgedAt?: string | null;
  monitor: {
    id: string;
    name: string;
    url: string;
  };
  notifications: Array<{
    id: string;
    channel: string;
    status: string;
    sentAt: string;
    recipient: string;
  }>;
}

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  const fetchIncidents = useCallback(async () => {
    try {
      const url = filter === "all" ? "/api/incidents" : `/api/incidents?status=${filter}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setIncidents(data.incidents || []);
      }
    } catch (err) {
      console.error("Fetch incidents error:", err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  async function handleAcknowledge(incidentId: string) {
    try {
      const res = await fetch(`/api/incidents/${incidentId}/acknowledge`, {
        method: "PATCH",
      });
      if (res.ok) {
        await fetchIncidents();
      }
    } catch (err) {
      console.error("Acknowledge error:", err);
    }
  }

  function formatDuration(startedAt: string, resolvedAt?: string | null) {
    const start = new Date(startedAt).getTime();
    const end = resolvedAt ? new Date(resolvedAt).getTime() : Date.now();
    const diffSeconds = Math.round((end - start) / 1000);

    if (diffSeconds < 60) return `${diffSeconds}s`;
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ${diffSeconds % 60}s`;
    const diffHours = Math.floor(diffMinutes / 60);
    return `${diffHours}h ${diffMinutes % 60}m`;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <AlertTriangle className="w-6 h-6 text-rose-400" />
            Incident Management
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Track automated outage lifecycles, duration, root causes, and alert notifications
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-xl bg-slate-900 border border-slate-800 p-1 text-xs">
            {["all", "OPEN", "ACKNOWLEDGED", "RESOLVED"].map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-3 py-1.5 rounded-lg font-medium transition uppercase ${
                  filter === s
                    ? "bg-slate-800 text-emerald-400 shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {s === "all" ? "All" : s}
              </button>
            ))}
          </div>

          <button
            onClick={fetchIncidents}
            className="p-2.5 rounded-xl glass-card text-slate-400 hover:text-white transition"
            title="Refresh incidents"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-500 glass-card rounded-2xl animate-pulse">
          Loading incident history...
        </div>
      ) : incidents.length === 0 ? (
        <div className="glass-panel p-12 text-center rounded-2xl border border-slate-800 text-slate-400 max-w-lg mx-auto">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto mb-3">
            <CheckCircle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white">No incidents found</h3>
          <p className="text-xs text-slate-400 mt-1">
            All services are operational or no outages have occurred under this filter.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {incidents.map((inc) => {
            const isResolved = inc.status === "RESOLVED";
            const isOpen = inc.status === "OPEN";

            return (
              <div
                key={inc.id}
                className={`glass-panel p-5 rounded-2xl border transition ${
                  isOpen
                    ? "border-rose-500/30 bg-rose-500/5 glow-rose"
                    : "border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-3">
                      <span className="text-base font-bold text-white">
                        {inc.monitor.name}
                      </span>
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${
                          isOpen
                            ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                            : inc.status === "ACKNOWLEDGED"
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                            : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        }`}
                      >
                        {inc.status}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 font-mono bg-slate-900/60 p-2 rounded-lg border border-slate-800/80 max-w-2xl">
                      {inc.reason}
                    </p>

                    <div className="flex items-center gap-4 text-xs text-slate-400 pt-1">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        Duration: {formatDuration(inc.startedAt, inc.resolvedAt)}
                      </span>
                      <span>•</span>
                      <span>Started {new Date(inc.startedAt).toLocaleString()}</span>
                      {inc.resolvedAt && (
                        <>
                          <span>•</span>
                          <span className="text-emerald-400/90">
                            Resolved {new Date(inc.resolvedAt).toLocaleTimeString()}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions & notifications */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {isOpen && (
                      <button
                        onClick={() => handleAcknowledge(inc.id)}
                        className="px-3.5 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 text-xs font-semibold flex items-center gap-1.5 transition"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Acknowledge Outage
                      </button>
                    )}

                    {inc.notifications && inc.notifications.length > 0 && (
                      <div className="flex items-center gap-1 text-[11px] text-slate-400">
                        <Bell className="w-3 h-3 text-slate-500" />
                        <span>Alerted {inc.notifications[0].recipient}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

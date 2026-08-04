"use client";

import React, { useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Play, ArrowUpRight, Clock, AlertTriangle, ShieldCheck } from "lucide-react";

interface MonitorProps {
  id: string;
  name: string;
  url: string;
  method: string;
  intervalSeconds: number;
  lastStatus: string;
  lastCheckedAt?: string | null;
  isActive: boolean;
  consecutiveFailures: number;
  onCheckCompleted?: () => void;
}

export function MonitorCard({
  id,
  name,
  url,
  method,
  intervalSeconds,
  lastStatus,
  lastCheckedAt,
  isActive,
  consecutiveFailures,
  onCheckCompleted,
}: MonitorProps) {
  const [checking, setChecking] = useState(false);

  async function handleTriggerCheck(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setChecking(true);
    try {
      const res = await fetch(`/api/monitors/${id}/check`, {
        method: "POST",
      });
      if (res.ok) {
        onCheckCompleted?.();
      }
    } catch (err) {
      console.error("Trigger check error:", err);
    } finally {
      setChecking(false);
    }
  }

  const lastCheckedDate = lastCheckedAt ? new Date(lastCheckedAt) : null;

  return (
    <div className="glass-panel rounded-xl p-5 hover:border-slate-700/80 transition group relative overflow-hidden">
      {/* Glow highlight based on status */}
      <div
        className={`absolute top-0 left-0 right-0 h-1 ${
          lastStatus === "operational"
            ? "bg-emerald-500"
            : lastStatus === "down"
            ? "bg-rose-500"
            : lastStatus === "degraded"
            ? "bg-amber-500"
            : "bg-slate-700"
        }`}
      />

      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <Link
              href={`/dashboard/monitors/${id}`}
              className="text-base font-semibold text-white group-hover:text-emerald-400 transition truncate flex items-center gap-1.5"
            >
              {name}
              <ArrowUpRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
            <StatusBadge status={lastStatus} />
            {!isActive && (
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                Paused
              </span>
            )}
          </div>

          <p className="text-xs font-mono text-slate-400 mt-1 truncate max-w-md">
            <span className="text-slate-500 font-semibold">{method}</span> {url}
          </p>
        </div>

        {/* Trigger check button */}
        <button
          onClick={handleTriggerCheck}
          disabled={checking}
          title="Run immediate health check"
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 transition disabled:opacity-50"
        >
          <Play className={`w-3 h-3 ${checking ? "animate-spin text-emerald-400" : ""}`} />
          {checking ? "Checking..." : "Check Now"}
        </button>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 text-slate-400">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>Every {intervalSeconds}s</span>
          </div>

          {consecutiveFailures > 0 ? (
            <div className="flex items-center gap-1 text-rose-400">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{consecutiveFailures} consecutive failures</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-emerald-400/80">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>Threshold intact</span>
            </div>
          )}
        </div>

        <div className="text-slate-500">
          {lastCheckedDate ? (
            <span>
              Checked {lastCheckedDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          ) : (
            <span>Not checked yet</span>
          )}
        </div>
      </div>
    </div>
  );
}

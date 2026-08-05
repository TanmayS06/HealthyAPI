"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Server,
  ShieldCheck,
  AlertCircle,
  Clock,
  Zap,
} from "lucide-react";

export default function NewMonitorPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState("GET");
  const [intervalSeconds, setIntervalSeconds] = useState(60);
  const [timeoutMs, setTimeoutMs] = useState(5000);
  const [expectedStatusCode, setExpectedStatusCode] = useState(200);
  const [failureThreshold, setFailureThreshold] = useState(3);
  const [recoveryThreshold, setRecoveryThreshold] = useState(3);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quick preset helper
  function handlePreset(presetName: string, presetUrl: string) {
    setName(presetName);
    setUrl(presetUrl);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/monitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          url,
          method,
          intervalSeconds,
          timeoutMs,
          expectedStatusCode,
          failureThreshold,
          recoveryThreshold,
          isActive: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.details || data.error || "Failed to create monitor");
        return;
      }

      router.push(`/dashboard/monitors/${data.monitor.id}`);
      router.refresh();
    } catch {
      setError("An unexpected network error occurred.");
    } finally {
      setLoading(false);
    }
  }

  // Live client-side heuristic warning for obvious private targets
  const isPrivateWarning =
    url.includes("localhost") ||
    url.includes("127.0.0.1") ||
    url.includes("169.254.") ||
    url.includes("192.168.") ||
    url.includes("10.");

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back button */}
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Overview
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Server className="w-6 h-6 text-emerald-400" />
            Register API Monitor
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Configure periodic synthetic health checks and incident trigger rules
          </p>
        </div>
      </div>

      {/* Preset suggestions */}
      <div className="glass-card p-4 rounded-xl flex items-center justify-between flex-wrap gap-2 text-xs">
        <span className="text-slate-400">Quick Test Endpoints:</span>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => handlePreset("GitHub Zen API", "https://api.github.com/zen")}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            GitHub Zen API
          </button>
          <button
            type="button"
            onClick={() => handlePreset("Cloudflare Trace", "https://1.1.1.1/cdn-cgi/trace")}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            Cloudflare Trace
          </button>
          <button
            type="button"
            onClick={() => handlePreset("HTTPBin Status 200", "https://httpbin.org/status/200")}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            HTTPBin 200
          </button>
        </div>
      </div>

      {/* Error Box */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <div>
            <p className="font-semibold">Creation Rejected</p>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* SSRF Pre-warning */}
      {isPrivateWarning && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>
            Notice: Localhost and private IPv4/IPv6 ranges will be blocked by the server-side SSRF
            defense filter. Please use public domains or routable IPs.
          </span>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="glass-panel p-6 sm:p-8 rounded-2xl border border-slate-800 space-y-6">
        {/* Basic Details */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider text-xs border-b border-slate-800/80 pb-2">
            Endpoint Configuration
          </h2>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Friendly Service Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Production Authentication API"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-900/80 border border-slate-800 focus:border-emerald-500 text-slate-100 placeholder-slate-600 text-sm outline-none transition"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="sm:col-span-1">
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                HTTP Method
              </label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-900/80 border border-slate-800 focus:border-emerald-500 text-slate-100 text-sm outline-none transition"
              >
                <option value="GET">GET</option>
                <option value="HEAD">HEAD</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
              </select>
            </div>

            <div className="sm:col-span-3">
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Endpoint URL *
              </label>
              <input
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://api.example.com/health"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-900/80 border border-slate-800 focus:border-emerald-500 text-slate-100 placeholder-slate-600 text-sm font-mono outline-none transition"
              />
            </div>
          </div>
        </div>

        {/* Timing & Intervals */}
        <div className="space-y-4 pt-2">
          <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider text-xs border-b border-slate-800/80 pb-2">
            Check Frequency & Timeouts
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Check Interval
              </label>
              <select
                value={intervalSeconds}
                onChange={(e) => setIntervalSeconds(Number(e.target.value))}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-900/80 border border-slate-800 focus:border-emerald-500 text-slate-100 text-sm outline-none transition"
              >
                <option value={10}>Every 10 seconds (Rapid)</option>
                <option value={30}>Every 30 seconds</option>
                <option value={60}>Every 60 seconds (Recommended)</option>
                <option value={120}>Every 2 minutes</option>
                <option value={300}>Every 5 minutes</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Request Timeout
              </label>
              <select
                value={timeoutMs}
                onChange={(e) => setTimeoutMs(Number(e.target.value))}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-900/80 border border-slate-800 focus:border-emerald-500 text-slate-100 text-sm outline-none transition"
              >
                <option value={2000}>2,000 ms (Strict)</option>
                <option value={5000}>5,000 ms (Default)</option>
                <option value={10000}>10,000 ms</option>
                <option value={15000}>15,000 ms (Max)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Expected HTTP Status
              </label>
              <input
                type="number"
                min={100}
                max={599}
                value={expectedStatusCode}
                onChange={(e) => setExpectedStatusCode(Number(e.target.value))}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-900/80 border border-slate-800 focus:border-emerald-500 text-slate-100 text-sm outline-none transition font-mono"
              />
            </div>
          </div>
        </div>

        {/* Incident Threshold Rules */}
        <div className="space-y-4 pt-2">
          <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider text-xs border-b border-slate-800/80 pb-2">
            Incident Rules & Escalation
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Consecutive Failures for Outage
              </label>
              <input
                type="number"
                min={1}
                max={10}
                value={failureThreshold}
                onChange={(e) => setFailureThreshold(Number(e.target.value))}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-900/80 border border-slate-800 focus:border-emerald-500 text-slate-100 text-sm outline-none transition font-mono"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                Trigger incident only after N consecutive failed checks
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Consecutive Successes for Recovery
              </label>
              <input
                type="number"
                min={1}
                max={10}
                value={recoveryThreshold}
                onChange={(e) => setRecoveryThreshold(Number(e.target.value))}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-900/80 border border-slate-800 focus:border-emerald-500 text-slate-100 text-sm outline-none transition font-mono"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                Auto-resolve outage after N consecutive passed checks
              </span>
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
          <Link
            href="/dashboard"
            className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition"
          >
            Cancel
          </Link>

          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs tracking-wide transition shadow-lg shadow-emerald-500/20 disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? "Scheduling Monitor..." : "Save & Start Monitoring"}
          </button>
        </div>
      </form>
    </div>
  );
}

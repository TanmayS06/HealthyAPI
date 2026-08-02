import React from "react";
import Link from "next/link";
import {
  Activity,
  Shield,
  Zap,
  Bell,
  BarChart3,
  Globe,
  ArrowRight,
  CheckCircle2,
  Lock,
  Layers,
} from "lucide-react";
import { Navbar } from "@/components/ui/Navbar";
import { getCurrentUser } from "@/lib/auth";

export default async function LandingPage() {
  const user = await getCurrentUser();

  return (
    <div className="min-h-screen flex flex-col bg-[#090d16] selection:bg-emerald-500/30">
      <Navbar user={user} />

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-16 pb-20 md:pt-24 md:pb-28">
        {/* Ambient background glows */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-emerald-500/10 blur-[130px] pointer-events-none rounded-full" />
        <div className="absolute top-1/3 left-1/4 w-[350px] h-[250px] bg-sky-500/10 blur-[120px] pointer-events-none rounded-full" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs font-medium mb-6">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Production Synthetic Monitoring & Incident Engine
          </div>

          {/* Heading */}
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white max-w-4xl mx-auto leading-tight sm:leading-none">
            Know when your APIs fail{" "}
            <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-sky-400 bg-clip-text text-transparent">
              before your users do.
            </span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Automated synthetic health checks, consecutive outage thresholds, P95 latency analytics,
            and shareable public status pages—engineered with high concurrency and strict SSRF defenses.
          </p>

          {/* CTA Buttons */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href={user ? "/dashboard" : "/register"}
              className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-sm shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition transform hover:-translate-y-0.5"
            >
              {user ? "Open Dashboard" : "Start Monitoring Free"}
              <ArrowRight className="w-4 h-4" />
            </Link>

            <Link
              href="/login"
              className="w-full sm:w-auto px-7 py-3.5 rounded-xl glass-panel text-slate-200 hover:text-white hover:border-slate-600 font-semibold text-sm flex items-center justify-center gap-2 transition"
            >
              Explore Demo Workspace
            </Link>
          </div>

          {/* Live Platform Visual Demonstration */}
          <div className="mt-16 max-w-5xl mx-auto glass-panel rounded-2xl p-4 sm:p-6 border border-slate-800 shadow-2xl relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-4 mb-6">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-rose-500/80" />
                <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                <span className="ml-2 text-xs font-mono text-slate-400">pulsecheck.internal/monitors</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-emerald-400 font-mono font-medium flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  All 12 Monitored Clusters Active
                </span>
              </div>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="glass-card p-4 rounded-xl text-left">
                <span className="text-xs text-slate-400">Average Uptime (30d)</span>
                <p className="text-2xl font-bold font-mono text-emerald-400 mt-1">99.98%</p>
                <span className="text-[11px] text-emerald-400/80">Check-based availability</span>
              </div>

              <div className="glass-card p-4 rounded-xl text-left">
                <span className="text-xs text-slate-400">Average Latency</span>
                <p className="text-2xl font-bold font-mono text-sky-400 mt-1">42 ms</p>
                <span className="text-[11px] text-slate-500">Global response time</span>
              </div>

              <div className="glass-card p-4 rounded-xl text-left">
                <span className="text-xs text-slate-400">P95 Tail Latency</span>
                <p className="text-2xl font-bold font-mono text-amber-400 mt-1">78 ms</p>
                <span className="text-[11px] text-slate-500">95th percentile metric</span>
              </div>

              <div className="glass-card p-4 rounded-xl text-left">
                <span className="text-xs text-slate-400">Active Incidents</span>
                <p className="text-2xl font-bold font-mono text-slate-200 mt-1">0</p>
                <span className="text-[11px] text-emerald-400">No unresolved outages</span>
              </div>
            </div>

            {/* Mock Monitor Row Items */}
            <div className="space-y-3">
              {[
                { name: "Primary Auth Gateway", url: "https://auth.company.com/v1/health", latency: "28ms", status: "Operational" },
                { name: "Stripe Billing Webhook", url: "https://api.company.com/billing/ping", latency: "45ms", status: "Operational" },
                { name: "Search Query Engine", url: "https://search.company.com/live", latency: "61ms", status: "Operational" },
              ].map((m, idx) => (
                <div key={idx} className="flex items-center justify-between p-3.5 rounded-lg bg-slate-900/60 border border-slate-800/80 text-left text-xs sm:text-sm">
                  <div className="flex items-center gap-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                    <div>
                      <p className="font-semibold text-slate-200">{m.name}</p>
                      <p className="text-[11px] font-mono text-slate-500">{m.url}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-slate-400">{m.latency}</span>
                    <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-medium">
                      {m.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Engineering Architecture & Pillars */}
      <section className="py-20 border-t border-slate-800/80 bg-slate-950/40 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-bold tracking-tight text-white">
              Built for Engineering Rigor & Scalability
            </h2>
            <p className="mt-3 text-slate-400 text-sm sm:text-base">
              PulseCheck separates concerns between the user-facing web tier, durable storage,
              scheduling queues, and dedicated background workers.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1 */}
            <div className="glass-panel p-6 rounded-2xl border border-slate-800 hover:border-slate-700 transition">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-4">
                <Zap className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Decoupled Worker Architecture</h3>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Next.js serves the frontend and APIs, while a dedicated Node.js worker backed by Redis
                and BullMQ executes recurring HTTP checks with isolated concurrency and timeouts.
              </p>
            </div>

            {/* Card 2 */}
            <div className="glass-panel p-6 rounded-2xl border border-slate-800 hover:border-slate-700 transition">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center mb-4">
                <Shield className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Hardened SSRF Protection</h3>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Prevents attackers from scanning internal VPCs or cloud metadata (169.254.169.254).
                Validates DNS resolution, blocks loopback and private IPv4/IPv6, and inspects redirect chains.
              </p>
            </div>

            {/* Card 3 */}
            <div className="glass-panel p-6 rounded-2xl border border-slate-800 hover:border-slate-700 transition">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center mb-4">
                <Layers className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Atomic Incident Engine</h3>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                PostgreSQL ACID transactions safeguard state transitions. Outages require consecutive failures
                (e.g., 3 failures) to prevent false alarms, and automatically resolve when endpoints stabilize.
              </p>
            </div>

            {/* Card 4 */}
            <div className="glass-panel p-6 rounded-2xl border border-slate-800 hover:border-slate-700 transition">
              <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center mb-4">
                <BarChart3 className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Telemetry & Latency Percentiles</h3>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Calculate uptime percentages, p95 latency percentiles, and check history over 24h, 7d, and 30d
                windows, accelerated by short-lived Redis caching.
              </p>
            </div>

            {/* Card 5 */}
            <div className="glass-panel p-6 rounded-2xl border border-slate-800 hover:border-slate-700 transition">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center mb-4">
                <Bell className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Webhook Alerting</h3>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Trigger structured JSON webhooks and email alert logs as soon as downtime is confirmed,
                with duplicate-alert suppression to avoid spamming incident responders.
              </p>
            </div>

            {/* Card 6 */}
            <div className="glass-panel p-6 rounded-2xl border border-slate-800 hover:border-slate-700 transition">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center mb-4">
                <Globe className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Public Status Pages</h3>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Generate shareable, unguessable status pages (/status/[slug]) that safely communicate operational
                availability and incident timelines without exposing private URLs.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-800/60 py-8 bg-[#090d16]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <span className="font-semibold text-slate-300">PulseCheck</span>
            <span>— API Monitoring & Incident Management Platform</span>
          </div>
          <p>© 2026 PulseCheck. Open source under MIT License.</p>
        </div>
      </footer>
    </div>
  );
}

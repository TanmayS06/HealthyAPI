"use client";

import React, { useEffect, useState } from "react";
import { Settings, Bell, Shield, Check, AlertCircle, Send } from "lucide-react";

export default function SettingsPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          setName(data.user?.name || "");
          setEmail(data.user?.email || "");
          setWebhookUrl(data.user?.webhookUrl || "");
        }
      } catch (err) {
        console.error("Load settings error:", err);
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSavedSuccess(false);

    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, webhookUrl }),
      });

      if (res.ok) {
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 3000);
      }
    } catch (err) {
      console.error("Save settings error:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
          <Settings className="w-6 h-6 text-slate-400" />
          Platform Settings
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Configure notification dispatch channels and account credentials
        </p>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-500 glass-card rounded-2xl animate-pulse">
          Loading preferences...
        </div>
      ) : (
        <form onSubmit={handleSave} className="glass-panel p-6 sm:p-8 rounded-2xl border border-slate-800 space-y-6">
          {savedSuccess && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
              <Check className="w-4 h-4" />
              <span>Settings updated successfully.</span>
            </div>
          )}

          {/* Account Profile */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider text-xs border-b border-slate-800/80 pb-2">
              Account Credentials
            </h2>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-100 outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Email Address
              </label>
              <input
                type="email"
                disabled
                value={email}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/40 border border-slate-800 text-xs text-slate-500 cursor-not-allowed outline-none"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                Primary destination for automated incident opening & resolution emails.
              </span>
            </div>
          </div>

          {/* Webhook Alerting */}
          <div className="space-y-4 pt-2">
            <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider text-xs border-b border-slate-800/80 pb-2 flex items-center gap-2">
              <Bell className="w-4 h-4 text-emerald-400" />
              Webhook Alert Destination
            </h2>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                HTTP Webhook Endpoint URL
              </label>
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://hooks.slack.com/services/... or https://api.myops.com/webhook"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-100 font-mono outline-none focus:border-emerald-500"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                HealthyAPI dispatches JSON payloads for INCIDENT_OPENED and INCIDENT_RESOLVED events.
              </span>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 flex items-center justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs tracking-wide transition shadow-lg shadow-emerald-500/20 disabled:opacity-50"
            >
              {saving ? "Saving Changes..." : "Save Settings"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

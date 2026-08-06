"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Globe, PlusCircle, ExternalLink, Trash2, CheckCircle2 } from "lucide-react";

interface StatusPageItem {
  id: string;
  title: string;
  description?: string | null;
  slug: string;
  isPublished: boolean;
  selectedMonitorIds: string[];
  createdAt: string;
}

interface MonitorOption {
  id: string;
  name: string;
  url: string;
}

export default function StatusPagesDashboard() {
  const [pages, setPages] = useState<StatusPageItem[]>([]);
  const [monitors, setMonitors] = useState<MonitorOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal / Form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [slug, setSlug] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPages = useCallback(async () => {
    try {
      const [pRes, mRes] = await Promise.all([
        fetch("/api/status-pages"),
        fetch("/api/monitors"),
      ]);

      if (pRes.ok) {
        const pData = await pRes.json();
        setPages(pData.pages || []);
      }
      if (mRes.ok) {
        const mData = await mRes.json();
        setMonitors(mData.monitors || []);
      }
    } catch (err) {
      console.error("Fetch status pages error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPages();
  }, [fetchPages]);

  function handleOpenCreate() {
    setTitle("");
    setDescription("");
    // generate a random unique slug
    setSlug(`status-${Math.random().toString(36).substring(2, 8)}`);
    setSelectedIds(monitors.map((m) => m.id)); // default select all
    setError(null);
    setIsModalOpen(true);
  }

  function toggleMonitorSelection(id: string) {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((item) => item !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  }

  async function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);

    try {
      const res = await fetch("/api/status-pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          slug,
          isPublished: true,
          selectedMonitorIds: selectedIds,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create status page");
        return;
      }

      setIsModalOpen(false);
      await fetchPages();
    } catch {
      setError("An unexpected network error occurred.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDeletePage(pageId: string) {
    if (!confirm("Are you sure you want to delete this status page?")) return;
    try {
      const res = await fetch(`/api/status-pages/${pageId}`, { method: "DELETE" });
      if (res.ok) {
        await fetchPages();
      }
    } catch (err) {
      console.error("Delete status page error:", err);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Globe className="w-6 h-6 text-purple-400" />
            Public Status Pages
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Build branded public dashboards to communicate real-time availability to your users
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="px-4 py-2.5 rounded-xl bg-purple-500 hover:bg-purple-400 text-slate-950 font-bold text-xs tracking-wide transition shadow-lg shadow-purple-500/20 flex items-center gap-2 self-start sm:self-auto"
        >
          <PlusCircle className="w-4 h-4" />
          Create Status Page
        </button>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-500 glass-card rounded-2xl animate-pulse">
          Loading status pages...
        </div>
      ) : pages.length === 0 ? (
        <div className="glass-panel p-12 text-center rounded-2xl border border-slate-800 text-slate-400 max-w-lg mx-auto">
          <div className="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-400 flex items-center justify-center mx-auto mb-3">
            <Globe className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white">No status pages published</h3>
          <p className="text-xs text-slate-400 mt-1 mb-6">
            Share transparent uptime and incident communication on a hosted status page.
          </p>
          <button
            onClick={handleOpenCreate}
            className="px-4 py-2 rounded-xl bg-purple-500 hover:bg-purple-400 text-slate-950 font-bold text-xs tracking-wide transition"
          >
            Create Your First Status Page
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pages.map((page) => (
            <div
              key={page.id}
              className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4 hover:border-slate-700 transition"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-white">{page.title}</h3>
                  {page.description && (
                    <p className="text-xs text-slate-400 mt-1">{page.description}</p>
                  )}
                  <div className="mt-2 text-xs font-mono text-purple-400">
                    /status/{page.slug}
                  </div>
                </div>

                <button
                  onClick={() => handleDeletePage(page.id)}
                  className="p-2 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                  title="Delete status page"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                <span className="text-slate-400">
                  {page.selectedMonitorIds.length} published monitors
                </span>

                <Link
                  href={`/status/${page.slug}`}
                  target="_blank"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
                >
                  <span>View Public Page</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Creation Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg glass-panel p-6 sm:p-8 rounded-2xl border border-slate-800 shadow-2xl space-y-5">
            <h2 className="text-lg font-bold text-white">Create Status Page</h2>

            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                {error}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Page Title *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Acme Corp System Status"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-100 outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Public URL Slug *
                </label>
                <div className="flex items-center rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-xs">
                  <span className="text-slate-500 font-mono">/status/</span>
                  <input
                    type="text"
                    required
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    placeholder="my-company"
                    className="flex-1 bg-transparent text-purple-400 font-mono outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Description (Optional)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Real-time and historical operational performance."
                  rows={2}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-100 outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Select Monitors to Display ({selectedIds.length} selected)
                </label>
                <div className="max-h-44 overflow-y-auto space-y-1.5 p-2 rounded-xl bg-slate-900/60 border border-slate-800">
                  {monitors.map((m) => {
                    const isChecked = selectedIds.includes(m.id);
                    return (
                      <div
                        key={m.id}
                        onClick={() => toggleMonitorSelection(m.id)}
                        className={`flex items-center justify-between p-2 rounded-lg cursor-pointer text-xs transition ${
                          isChecked ? "bg-purple-500/10 text-white" : "text-slate-400 hover:bg-slate-800/40"
                        }`}
                      >
                        <span className="font-medium truncate">{m.name}</span>
                        {isChecked && <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0" />}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 rounded-xl bg-purple-500 hover:bg-purple-400 text-slate-950 font-bold text-xs tracking-wide transition disabled:opacity-50"
                >
                  {creating ? "Publishing..." : "Publish Page"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

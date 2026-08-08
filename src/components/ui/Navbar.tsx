"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  Server,
  AlertTriangle,
  Globe,
  Settings,
  LogOut,
  PlusCircle,
  Menu,
  X,
} from "lucide-react";

interface NavbarProps {
  user?: {
    name: string;
    email: string;
  } | null;
}

export function Navbar({ user }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch (err) {
      console.error("Logout failed:", err);
    }
  }

  const navLinks = [
    { href: "/dashboard", label: "Overview", icon: Activity },
    { href: "/dashboard/monitors", label: "Monitors", icon: Server },
    { href: "/dashboard/incidents", label: "Incidents", icon: AlertTriangle },
    { href: "/dashboard/status-pages", label: "Status Pages", icon: Globe },
    { href: "/dashboard/settings", label: "Settings", icon: Settings },
  ];

  return (
    <nav className="sticky top-0 z-50 border-b border-slate-800 bg-[#090d16]/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand */}
          <div className="flex items-center gap-8">
            <Link href={user ? "/dashboard" : "/"} className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                  HealthyAPI
                </span>
                <span className="text-[10px] text-emerald-400 font-mono tracking-wider -mt-1 uppercase">
                  Uptime Engine
                </span>
              </div>
            </Link>

            {/* Desktop Navigation */}
            {user && (
              <div className="hidden md:flex items-center gap-1">
                {navLinks.map((link) => {
                  const Icon = link.icon;
                  const isActive =
                    link.href === "/dashboard"
                      ? pathname === "/dashboard"
                      : pathname?.startsWith(link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-slate-800 text-emerald-400 border border-slate-700/60 shadow-sm"
                          : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${isActive ? "text-emerald-400" : "text-slate-400"}`} />
                      {link.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Side Actions */}
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <>
                <Link
                  href="/dashboard/monitors/new"
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs tracking-wide transition shadow-lg shadow-emerald-500/20"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  New Monitor
                </Link>

                <div className="h-6 w-px bg-slate-800 mx-1" />

                <div className="flex items-center gap-3 pl-2">
                  <div className="flex flex-col text-right">
                    <span className="text-xs font-semibold text-slate-200">{user.name}</span>
                    <span className="text-[11px] text-slate-500">{user.email}</span>
                  </div>
                  <button
                    onClick={handleLogout}
                    title="Sign out"
                    className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  href="/login"
                  className="text-sm font-medium text-slate-300 hover:text-white px-3 py-2 transition"
                >
                  Sign In
                </Link>
                <Link
                  href="/register"
                  className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm transition shadow-lg shadow-emerald-500/20"
                >
                  Get Started
                </Link>
              </div>
            )}
          </div>

          {/* Mobile menu trigger */}
          <div className="md:hidden flex items-center">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && user && (
        <div className="md:hidden border-b border-slate-800 bg-[#090d16] px-4 pt-2 pb-4 space-y-1">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive =
              link.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname?.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium ${
                  isActive
                    ? "bg-slate-800 text-emerald-400"
                    : "text-slate-300 hover:bg-slate-800/60"
                }`}
              >
                <Icon className="w-4 h-4" />
                {link.label}
              </Link>
            );
          })}
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-400">{user.email}</span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs text-rose-400 hover:underline"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}

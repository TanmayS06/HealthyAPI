import React from "react";
import { CheckCircle2, XCircle, AlertCircle, Clock } from "lucide-react";

interface CheckItem {
  id: string;
  checkedAt: string;
  statusCode: number | null;
  responseTimeMs: number;
  success: boolean;
  errorType: string | null;
  errorMessage: string | null;
}

interface CheckHistoryTableProps {
  checks: CheckItem[];
}

export function CheckHistoryTable({ checks }: CheckHistoryTableProps) {
  if (!checks || checks.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500 text-sm">
        No health checks executed yet. Trigger a manual check or wait for the next scheduled interval.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-900/60 text-xs text-slate-400 uppercase tracking-wider border-b border-slate-800">
          <tr>
            <th className="py-3 px-4">Status</th>
            <th className="py-3 px-4">HTTP Code</th>
            <th className="py-3 px-4">Response Time</th>
            <th className="py-3 px-4">Checked At</th>
            <th className="py-3 px-4">Error / Details</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {checks.map((check) => {
            const date = new Date(check.checkedAt);
            const timeStr = date.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            });
            const dateStr = date.toLocaleDateString([], {
              month: "short",
              day: "numeric",
            });

            return (
              <tr key={check.id} className="hover:bg-slate-800/30 transition-colors">
                <td className="py-3 px-4 whitespace-nowrap">
                  {check.success ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Passed
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-400">
                      <XCircle className="w-4 h-4 text-rose-400" />
                      Failed
                    </span>
                  )}
                </td>

                <td className="py-3 px-4 whitespace-nowrap font-mono text-xs">
                  {check.statusCode ? (
                    <span
                      className={`px-2 py-0.5 rounded ${
                        check.statusCode >= 200 && check.statusCode < 300
                          ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                          : "bg-rose-500/10 text-rose-300 border border-rose-500/20"
                      }`}
                    >
                      {check.statusCode}
                    </span>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </td>

                <td className="py-3 px-4 whitespace-nowrap font-mono text-xs">
                  <span
                    className={
                      check.responseTimeMs < 300
                        ? "text-emerald-400"
                        : check.responseTimeMs < 800
                        ? "text-amber-400"
                        : "text-rose-400"
                    }
                  >
                    {check.responseTimeMs} ms
                  </span>
                </td>

                <td className="py-3 px-4 whitespace-nowrap text-xs text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    <span>{dateStr} {timeStr}</span>
                  </div>
                </td>

                <td className="py-3 px-4 text-xs text-slate-300 max-w-xs truncate">
                  {check.errorMessage ? (
                    <span className="inline-flex items-center gap-1 text-rose-400 font-mono text-[11px]" title={check.errorMessage}>
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      {check.errorType ? `[${check.errorType}] ` : ""}{check.errorMessage}
                    </span>
                  ) : (
                    <span className="text-slate-500">None</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

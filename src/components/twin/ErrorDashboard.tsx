"use client";

import { useEffect, useState } from "react";
import { AlertCircle, X, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TwinErrorEvent } from "@/lib/twin/zoom-to-layer";

export type TwinError = TwinErrorEvent & { at: number };

interface ErrorDashboardProps {
  errors: TwinError[];
  onDismiss: (id: string) => void;
  onClear: () => void;
  className?: string;
}

export function ErrorDashboard({
  errors,
  onDismiss,
  onClear,
  className,
}: ErrorDashboardProps) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (errors.length === 0) setCollapsed(false);
  }, [errors.length]);

  if (errors.length === 0) return null;

  return (
    <div
      className={cn(
        "pointer-events-auto absolute bottom-14 left-3 z-30 w-[min(22rem,calc(100vw-1.5rem))] md:bottom-16 md:left-4",
        className
      )}
      role="region"
      aria-label="Error dashboard"
    >
      <div className="overflow-hidden rounded-xl border border-red-400/35 bg-[#120a0c]/92 shadow-[0_8px_28px_rgba(0,0,0,0.45)] backdrop-blur-md">
        <div className="flex items-center gap-2 border-b border-red-400/20 px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
          <button
            type="button"
            className="min-w-0 flex-1 text-left text-[11px] font-medium tracking-wide text-red-200"
            onClick={() => setCollapsed((c) => !c)}
          >
            Errors · {errors.length}
            <span className="ml-1.5 text-red-400/70">
              {collapsed ? "show" : "hide"}
            </span>
          </button>
          <button
            type="button"
            className="rounded p-1 text-slate-400 hover:bg-white/5 hover:text-slate-200"
            title="Clear all"
            onClick={onClear}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {!collapsed && (
          <ul className="max-h-48 space-y-0 overflow-y-auto">
            {errors.slice(0, 12).map((err) => (
              <li
                key={err.id}
                className={cn(
                  "border-b border-white/5 px-3 py-2 last:border-0"
                )}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] leading-snug text-red-100">
                      {err.message}
                    </p>
                    {err.detail && (
                      <p className="mt-0.5 break-all text-[10px] leading-snug text-slate-400">
                        {err.detail}
                      </p>
                    )}
                    <p className="mt-1 text-[10px] text-slate-500">
                      {err.source} ·{" "}
                      {new Date(err.at).toLocaleTimeString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded p-0.5 text-slate-500 hover:bg-white/5 hover:text-slate-300"
                    aria-label="Dismiss error"
                    onClick={() => onDismiss(err.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

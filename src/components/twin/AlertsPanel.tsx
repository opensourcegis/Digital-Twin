"use client";

import { cn } from "@/lib/utils";
import type { Alert } from "@/lib/twin/types";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Bell, Check } from "lucide-react";

interface AlertsPanelProps {
  alerts: Alert[];
  onAcknowledge: (id: string) => void;
  onSelectAsset?: (guid: string) => void;
}

export function AlertsPanel({ alerts, onAcknowledge, onSelectAsset }: AlertsPanelProps) {
  const critical = alerts.filter((a) => a.severity === "critical").length;
  const warning = alerts.filter((a) => a.severity === "warning").length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
        <div className="flex items-center gap-2">
          <Bell className={cn("h-4 w-4", critical ? "text-red-400" : "text-amber-300")} />
          <span className="text-sm text-slate-200">Active alerts</span>
        </div>
        <div className="flex gap-2 text-xs">
          {critical > 0 && (
            <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-red-300">
              {critical} critical
            </span>
          )}
          {warning > 0 && (
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-amber-200">
              {warning} warning
            </span>
          )}
        </div>
      </div>

      {alerts.length === 0 && (
        <p className="px-2 text-xs text-slate-500">No active threshold alerts.</p>
      )}

      {alerts.slice(0, 8).map((a) => (
        <div
          key={a.id}
          className={cn(
            "rounded-xl border px-3 py-2 text-xs",
            a.severity === "critical"
              ? "border-red-400/30 bg-red-500/10"
              : "border-amber-400/20 bg-amber-400/5"
          )}
        >
          <div className="flex items-start gap-2">
            <AlertTriangle
              className={cn(
                "mt-0.5 h-3.5 w-3.5 shrink-0",
                a.severity === "critical" ? "text-red-400" : "text-amber-300"
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-slate-100">{a.message}</p>
              <p className="mt-0.5 text-slate-500">
                {new Date(a.timestamp).toLocaleTimeString()}
                {a.spatial ? " · spatial" : ""}
              </p>
              <div className="mt-2 flex gap-1">
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 text-[10px]"
                  onClick={() => onSelectAsset?.(a.assetGuid)}
                >
                  View asset
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[10px]"
                  onClick={() => onAcknowledge(a.id)}
                >
                  <Check className="h-3 w-3" />
                  Ack
                </Button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

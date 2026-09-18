"use client";

import type { BmsPoint, SensorReading } from "@/lib/twin/types";
import { SensorGauges } from "@/components/twin/SensorGauges";
import { AlertsPanel } from "@/components/twin/AlertsPanel";
import type { Alert } from "@/lib/twin/types";
import { Activity, Building2, Thermometer } from "lucide-react";

interface OperationsPanelProps {
  readings: SensorReading[];
  alerts: Alert[];
  bms: BmsPoint[];
  symbology: Record<string, { color: string; pulse: boolean }>;
  connected: boolean;
  robotBattery?: number;
  robotAlerts?: number;
  onAcknowledge: (id: string) => void;
  onSelectAsset: (guid: string) => void;
}

export function OperationsPanel({
  readings,
  alerts,
  bms,
  symbology,
  connected,
  robotBattery,
  robotAlerts,
  onAcknowledge,
  onSelectAsset,
}: OperationsPanelProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-teal-400/20 bg-teal-400/5 px-3 py-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-teal-300" />
          <span className="text-sm font-medium text-teal-100">Operations COP</span>
        </div>
        <span
          className={`text-[10px] ${connected ? "text-teal-300" : "text-red-400"}`}
        >
          {connected ? "SSE live" : "Reconnecting…"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-2">
          <p className="text-slate-500">Robot battery</p>
          <p className="font-display text-xl text-amber-200">
            {robotBattery?.toFixed(0) ?? "—"}%
          </p>
        </div>
        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-2">
          <p className="text-slate-500">Critical alerts</p>
          <p className="font-display text-xl text-red-300">{robotAlerts ?? 0}</p>
        </div>
      </div>

      <div>
        <p className="mb-2 flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-slate-500">
          <Thermometer className="h-3 w-3" /> Live telemetry
        </p>
        <SensorGauges readings={readings} symbology={symbology} />
      </div>

      <div>
        <p className="mb-2 flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-slate-500">
          <Building2 className="h-3 w-3" /> BMS / BAS
        </p>
        <div className="space-y-1">
          {bms.slice(0, 4).map((p) => (
            <div
              key={p.guid}
              className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] px-2 py-1.5 text-xs"
            >
              <span className="text-slate-300">{p.name}</span>
              <span className="text-teal-200">
                {String(p.value)}
                {p.unit ? ` ${p.unit}` : ""}
              </span>
            </div>
          ))}
        </div>
      </div>

      <AlertsPanel
        alerts={alerts}
        onAcknowledge={onAcknowledge}
        onSelectAsset={onSelectAsset}
      />
    </div>
  );
}

"use client";

import type { SensorReading } from "@/lib/twin/types";
import { cn } from "@/lib/utils";

const METRIC_LABELS: Record<string, string> = {
  temperature: "Temp",
  vibration: "Vib",
  pressure: "Press",
  energy: "Energy",
  flow: "Flow",
  occupancy: "Occ",
  water_level: "Water",
};

interface SensorGaugesProps {
  readings: SensorReading[];
  symbology: Record<string, { color: string; pulse: boolean }>;
}

export function SensorGauges({ readings, symbology }: SensorGaugesProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {readings.map((r) => {
        const sym = symbology[r.sensorGuid];
        const color = sym?.color ?? "#94a3b8";
        const display =
          r.quality === "timeout"
            ? "—"
            : r.metric === "occupancy"
              ? Math.round(Number(r.value))
              : r.value;
        return (
          <div
            key={r.sensorGuid}
            className={cn(
              "rounded-lg border border-white/5 bg-white/[0.03] p-2.5",
              sym?.pulse && "animate-pulse"
            )}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="truncate text-[10px] uppercase tracking-wide text-slate-500">
                {METRIC_LABELS[r.metric] ?? r.metric}
              </span>
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: color }}
              />
            </div>
            <p className="mt-1 font-display text-lg leading-none text-white">
              {display}
              {r.quality !== "timeout" && (
                <span className="ml-0.5 text-xs text-slate-400">{r.unit}</span>
              )}
            </p>
            <p className="mt-1 truncate text-[10px] text-slate-500">
              {r.quality !== "good" ? r.quality : "live"}
            </p>
          </div>
        );
      })}
    </div>
  );
}

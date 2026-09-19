"use client";

import type { BmsPoint } from "@/lib/twin/types";
import { AlertsPanel } from "@/components/twin/AlertsPanel";
import type { Alert } from "@/lib/twin/types";
import type { SceneWeather } from "@/lib/weather/types";
import type { InformaticsSettings } from "@/lib/platform/types";
import { DEFAULT_INFORMATICS } from "@/lib/platform/types";
import { Activity, Building2, CloudRain } from "lucide-react";
import Link from "next/link";

interface OperationsPanelProps {
  alerts: Alert[];
  bms: BmsPoint[];
  connected: boolean;
  robotBattery?: number;
  robotAlerts?: number;
  weather?: SceneWeather | null;
  weatherError?: string | null;
  informatics?: InformaticsSettings;
  onAcknowledge: (id: string) => void;
  onSelectAsset: (guid: string) => void;
}

function fmt(n: number | null | undefined, digits = 0, suffix = "") {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}${suffix}`;
}

function formatTemp(
  c: number | null | undefined,
  unit: "C" | "F"
): string {
  if (c == null || !Number.isFinite(c)) return "—";
  if (unit === "F") return `${((c * 9) / 5 + 32).toFixed(1)}°F`;
  return `${c.toFixed(1)}°C`;
}

export function OperationsPanel({
  alerts,
  bms,
  connected,
  robotBattery,
  robotAlerts,
  weather,
  weatherError,
  informatics = DEFAULT_INFORMATICS,
  onAcknowledge,
  onSelectAsset,
}: OperationsPanelProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border border-teal-400/20 bg-teal-400/[0.06] px-3 py-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-teal-300" />
          <span className="text-sm font-medium text-teal-50">
            {informatics.copTitle}
          </span>
        </div>
        <span
          className={`text-[10px] uppercase tracking-wide ${connected ? "text-teal-300" : "text-red-400"}`}
        >
          {connected ? "SSE live" : "Reconnecting…"}
        </span>
      </div>

      {informatics.showWeather && (
        <div className="rounded-xl border border-sky-400/15 bg-sky-400/[0.05] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-sky-300/80">
              <CloudRain className="h-3 w-3" /> {informatics.weatherSectionTitle}
            </p>
            <Link
              href="/admin"
              className="text-[10px] text-slate-500 underline-offset-2 hover:text-sky-300 hover:underline"
            >
              Edit API
            </Link>
          </div>
          {weatherError && !weather ? (
            <p className="text-xs text-amber-300/90">{weatherError}</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-slate-500">Temp</p>
                <p className="font-display text-lg text-slate-100">
                  {formatTemp(
                    weather?.temperatureC,
                    informatics.temperatureUnit
                  )}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Rain</p>
                <p className="font-display text-lg text-sky-200">
                  {fmt(weather?.rainMm, 1, " mm")}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Visibility</p>
                <p className="text-slate-200">
                  {weather?.visibilityM != null
                    ? `${(weather.visibilityM / 1000).toFixed(1)} km`
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Wind</p>
                <p className="text-slate-200">
                  {fmt(weather?.windSpeedMps, 1, " m/s")}
                  {weather?.windDirectionDeg != null
                    ? ` · ${Math.round(weather.windDirectionDeg)}°`
                    : ""}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {informatics.showRobotStatus && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl border border-white/5 bg-white/[0.03] p-2">
            <p className="text-slate-500">{informatics.robotBatteryLabel}</p>
            <p className="font-display text-xl text-amber-200">
              {robotBattery?.toFixed(0) ?? "—"}%
            </p>
          </div>
          <div className="rounded-xl border border-white/5 bg-white/[0.03] p-2">
            <p className="text-slate-500">{informatics.criticalAlertsLabel}</p>
            <p className="font-display text-xl text-red-300">
              {robotAlerts ?? 0}
            </p>
          </div>
        </div>
      )}

      {informatics.showBms && (
        <div>
          <p className="mb-2 flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-slate-500">
            <Building2 className="h-3 w-3" /> {informatics.bmsSectionTitle}
          </p>
          <div className="space-y-1">
            {bms.slice(0, informatics.bmsLimit).map((p) => (
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
      )}

      {informatics.showAlerts && (
        <AlertsPanel
          alerts={alerts.slice(0, informatics.alertLimit)}
          onAcknowledge={onAcknowledge}
          onSelectAsset={onSelectAsset}
        />
      )}
    </div>
  );
}

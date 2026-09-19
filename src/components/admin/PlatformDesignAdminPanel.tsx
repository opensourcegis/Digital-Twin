"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, Map, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ALL_GIS_TOOLS,
  DEFAULT_GIS,
  DEFAULT_INFORMATICS,
  DEFAULT_SIMULATION,
  type GisAnalysisSettings,
  type GisToolId,
  type InformaticsSettings,
  type PlatformSettings,
  type SimulationSettings,
} from "@/lib/platform/types";

type Tab = "simulation" | "informatics" | "gis";

const fieldClass =
  "mt-1 w-full rounded-lg border border-white/10 bg-[#0a1018] px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-400/40";

function Num({
  label,
  value,
  onChange,
  step = 0.1,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <label className="block text-xs text-slate-400">
      {label}
      <input
        type="number"
        className={fieldClass}
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
      <input
        type="checkbox"
        className="h-4 w-4 accent-violet-400"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

export function PlatformDesignAdminPanel() {
  const [tab, setTab] = useState<Tab>("simulation");
  const [simulation, setSimulation] = useState<SimulationSettings>(DEFAULT_SIMULATION);
  const [informatics, setInformatics] =
    useState<InformaticsSettings>(DEFAULT_INFORMATICS);
  const [gis, setGis] = useState<GisAnalysisSettings>(DEFAULT_GIS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/platform-settings");
      if (res.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      if (!res.ok) throw new Error(`Load failed (${res.status})`);
      const data = (await res.json()) as { settings: PlatformSettings };
      setSimulation(data.settings.simulation);
      setInformatics(data.settings.informatics);
      setGis(data.settings.gis);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/platform-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ simulation, informatics, gis }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Save failed (${res.status})`);
      setSimulation(data.settings.simulation);
      setInformatics(data.settings.informatics);
      setGis(data.settings.gis);
      setMessage("Platform design saved. Twin picks this up on next refresh.");
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const toggleTool = (id: GisToolId) => {
    setGis((g) => ({
      ...g,
      enabledTools: g.enabledTools.includes(id)
        ? g.enabledTools.filter((t) => t !== id)
        : [...g.enabledTools, id],
    }));
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-500/15 text-violet-300">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-lg text-white">
              Platform design
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Design simulations, informatics COP blocks, and GIS analysis tools.
              Changes persist to{" "}
              <code className="text-violet-300/80">data/platform-settings.json</code>.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={save} disabled={saving || loading}>
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : "Save design"}
        </Button>
      </div>

      <div className="mt-4 flex gap-1 rounded-xl border border-white/10 bg-black/20 p-1">
        {(
          [
            ["simulation", "Simulation", Bot],
            ["informatics", "Informatics", Sparkles],
            ["gis", "GIS analysis", Map],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs transition ${
              tab === id
                ? "bg-white/10 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="mt-4 space-y-4">
          {tab === "simulation" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-slate-400 sm:col-span-2">
                Robot name
                <input
                  className={fieldClass}
                  value={simulation.robotName}
                  onChange={(e) =>
                    setSimulation((s) => ({ ...s, robotName: e.target.value }))
                  }
                />
              </label>
              <Num
                label="Base speed (m/s)"
                value={simulation.baseSpeedMps}
                onChange={(n) =>
                  setSimulation((s) => ({ ...s, baseSpeedMps: n }))
                }
              />
              <Num
                label="Turn rate (rad/s)"
                value={simulation.turnRateRad}
                onChange={(n) =>
                  setSimulation((s) => ({ ...s, turnRateRad: n }))
                }
              />
              <Num
                label="Goal timeout (s)"
                value={simulation.goalTimeoutSec}
                onChange={(n) =>
                  setSimulation((s) => ({ ...s, goalTimeoutSec: n }))
                }
                step={1}
              />
              <Num
                label="Alert slowdown factor"
                value={simulation.alertSlowdownFactor}
                onChange={(n) =>
                  setSimulation((s) => ({ ...s, alertSlowdownFactor: n }))
                }
                min={0.1}
                max={1}
              />
              <Num
                label="Battery drain / tick"
                value={simulation.batteryDrainPerTick}
                onChange={(n) =>
                  setSimulation((s) => ({ ...s, batteryDrainPerTick: n }))
                }
                step={0.01}
              />
              <Num
                label="Battery charge / tick"
                value={simulation.batteryChargePerTick}
                onChange={(n) =>
                  setSimulation((s) => ({ ...s, batteryChargePerTick: n }))
                }
                step={0.01}
              />
              <label className="block text-xs text-slate-400">
                Default walkthrough mode
                <select
                  className={fieldClass}
                  value={simulation.defaultWalkthroughMode}
                  onChange={(e) =>
                    setSimulation((s) => ({
                      ...s,
                      defaultWalkthroughMode: e.target
                        .value as SimulationSettings["defaultWalkthroughMode"],
                    }))
                  }
                >
                  <option value="off">Orbit</option>
                  <option value="walk">Walk</option>
                  <option value="third">Chase</option>
                  <option value="first">Cab</option>
                </select>
              </label>
              <Toggle
                label="Seed default poles on boot"
                checked={simulation.seedPoles}
                onChange={(v) =>
                  setSimulation((s) => ({ ...s, seedPoles: v }))
                }
              />
              <Num
                label="Default pole count"
                value={simulation.defaultPoleCount}
                onChange={(n) =>
                  setSimulation((s) => ({
                    ...s,
                    defaultPoleCount: Math.max(0, Math.round(n)),
                  }))
                }
                step={1}
                min={0}
                max={20}
              />
              <p className="sm:col-span-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                Spawn (EPSG:4326)
              </p>
              <Num
                label="Longitude"
                value={simulation.spawn.lon}
                onChange={(n) =>
                  setSimulation((s) => ({
                    ...s,
                    spawn: { ...s.spawn, lon: n },
                  }))
                }
                step={0.0001}
              />
              <Num
                label="Latitude"
                value={simulation.spawn.lat}
                onChange={(n) =>
                  setSimulation((s) => ({
                    ...s,
                    spawn: { ...s.spawn, lat: n },
                  }))
                }
                step={0.0001}
              />
              <Num
                label="Height (m)"
                value={simulation.spawn.height}
                onChange={(n) =>
                  setSimulation((s) => ({
                    ...s,
                    spawn: { ...s.spawn, height: n },
                  }))
                }
              />
              <Num
                label="Heading (°)"
                value={simulation.spawn.headingDeg}
                onChange={(n) =>
                  setSimulation((s) => ({
                    ...s,
                    spawn: { ...s.spawn, headingDeg: n },
                  }))
                }
                step={1}
              />
              <p className="sm:col-span-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                Roam bounds
              </p>
              {(
                [
                  ["minLon", "Min lon"],
                  ["maxLon", "Max lon"],
                  ["minLat", "Min lat"],
                  ["maxLat", "Max lat"],
                ] as const
              ).map(([key, label]) => (
                <Num
                  key={key}
                  label={label}
                  value={simulation.bounds[key]}
                  onChange={(n) =>
                    setSimulation((s) => ({
                      ...s,
                      bounds: { ...s.bounds, [key]: n },
                    }))
                  }
                  step={0.0001}
                />
              ))}
              <p className="sm:col-span-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                Camera home
              </p>
              {(
                [
                  ["lon", "Longitude"],
                  ["lat", "Latitude"],
                  ["height", "Height (m)"],
                  ["headingDeg", "Heading °"],
                  ["pitchDeg", "Pitch °"],
                ] as const
              ).map(([key, label]) => (
                <Num
                  key={key}
                  label={label}
                  value={simulation.cameraHome[key]}
                  onChange={(n) =>
                    setSimulation((s) => ({
                      ...s,
                      cameraHome: { ...s.cameraHome, [key]: n },
                    }))
                  }
                  step={key === "lon" || key === "lat" ? 0.0001 : 1}
                />
              ))}
            </div>
          )}

          {tab === "informatics" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-slate-400 sm:col-span-2">
                COP title
                <input
                  className={fieldClass}
                  value={informatics.copTitle}
                  onChange={(e) =>
                    setInformatics((i) => ({ ...i, copTitle: e.target.value }))
                  }
                />
              </label>
              <label className="block text-xs text-slate-400">
                Weather section title
                <input
                  className={fieldClass}
                  value={informatics.weatherSectionTitle}
                  onChange={(e) =>
                    setInformatics((i) => ({
                      ...i,
                      weatherSectionTitle: e.target.value,
                    }))
                  }
                />
              </label>
              <label className="block text-xs text-slate-400">
                BMS section title
                <input
                  className={fieldClass}
                  value={informatics.bmsSectionTitle}
                  onChange={(e) =>
                    setInformatics((i) => ({
                      ...i,
                      bmsSectionTitle: e.target.value,
                    }))
                  }
                />
              </label>
              <label className="block text-xs text-slate-400">
                Robot battery label
                <input
                  className={fieldClass}
                  value={informatics.robotBatteryLabel}
                  onChange={(e) =>
                    setInformatics((i) => ({
                      ...i,
                      robotBatteryLabel: e.target.value,
                    }))
                  }
                />
              </label>
              <label className="block text-xs text-slate-400">
                Critical alerts label
                <input
                  className={fieldClass}
                  value={informatics.criticalAlertsLabel}
                  onChange={(e) =>
                    setInformatics((i) => ({
                      ...i,
                      criticalAlertsLabel: e.target.value,
                    }))
                  }
                />
              </label>
              <label className="block text-xs text-slate-400">
                Temperature unit
                <select
                  className={fieldClass}
                  value={informatics.temperatureUnit}
                  onChange={(e) =>
                    setInformatics((i) => ({
                      ...i,
                      temperatureUnit: e.target.value as "C" | "F",
                    }))
                  }
                >
                  <option value="C">Celsius (°C)</option>
                  <option value="F">Fahrenheit (°F)</option>
                </select>
              </label>
              <Toggle
                label="Show site weather"
                checked={informatics.showWeather}
                onChange={(v) =>
                  setInformatics((i) => ({ ...i, showWeather: v }))
                }
              />
              <Toggle
                label="Show BMS / BAS"
                checked={informatics.showBms}
                onChange={(v) => setInformatics((i) => ({ ...i, showBms: v }))}
              />
              <Toggle
                label="Show alerts"
                checked={informatics.showAlerts}
                onChange={(v) =>
                  setInformatics((i) => ({ ...i, showAlerts: v }))
                }
              />
              <Toggle
                label="Show robot status cards"
                checked={informatics.showRobotStatus}
                onChange={(v) =>
                  setInformatics((i) => ({ ...i, showRobotStatus: v }))
                }
              />
              <Toggle
                label="Show time slider"
                checked={informatics.showTimeSlider}
                onChange={(v) =>
                  setInformatics((i) => ({ ...i, showTimeSlider: v }))
                }
              />
              <Num
                label="BMS rows shown"
                value={informatics.bmsLimit}
                onChange={(n) =>
                  setInformatics((i) => ({
                    ...i,
                    bmsLimit: Math.max(1, Math.round(n)),
                  }))
                }
                step={1}
                min={1}
                max={20}
              />
              <Num
                label="Alert list limit"
                value={informatics.alertLimit}
                onChange={(n) =>
                  setInformatics((i) => ({
                    ...i,
                    alertLimit: Math.max(1, Math.round(n)),
                  }))
                }
                step={1}
                min={1}
                max={50}
              />
              <Num
                label="Weather poll (minutes)"
                value={informatics.weatherPollMinutes}
                onChange={(n) =>
                  setInformatics((i) => ({
                    ...i,
                    weatherPollMinutes: Math.max(1, Math.round(n)),
                  }))
                }
                step={1}
                min={1}
                max={120}
              />
            </div>
          )}

          {tab === "gis" && (
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  Enabled analysis tools
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {ALL_GIS_TOOLS.map(({ id, label }) => (
                    <Toggle
                      key={id}
                      label={label}
                      checked={gis.enabledTools.includes(id)}
                      onChange={() => toggleTool(id)}
                    />
                  ))}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs text-slate-400">
                  Measure units
                  <select
                    className={fieldClass}
                    value={gis.measureUnits}
                    onChange={(e) =>
                      setGis((g) => ({
                        ...g,
                        measureUnits: e.target.value as "metric" | "imperial",
                      }))
                    }
                  >
                    <option value="metric">Metric (m / m²)</option>
                    <option value="imperial">Imperial (ft / ft²)</option>
                  </select>
                </label>
                <Num
                  label="Height profile samples"
                  value={gis.heightSampleCount}
                  onChange={(n) =>
                    setGis((g) => ({
                      ...g,
                      heightSampleCount: Math.max(4, Math.round(n)),
                    }))
                  }
                  step={1}
                  min={4}
                  max={64}
                />
                <Num
                  label="Viewshed radius (m)"
                  value={gis.viewshedRadiusM}
                  onChange={(n) =>
                    setGis((g) => ({ ...g, viewshedRadiusM: n }))
                  }
                  step={1}
                />
                <Num
                  label="Viewshed rays"
                  value={gis.viewshedRays}
                  onChange={(n) =>
                    setGis((g) => ({
                      ...g,
                      viewshedRays: Math.max(8, Math.round(n)),
                    }))
                  }
                  step={1}
                  min={8}
                  max={128}
                />
                <Num
                  label="Observer height (m)"
                  value={gis.viewshedObserverHeightM}
                  onChange={(n) =>
                    setGis((g) => ({ ...g, viewshedObserverHeightM: n }))
                  }
                />
                <Num
                  label="Pole spacing (m)"
                  value={gis.poleSpacingM}
                  onChange={(n) => setGis((g) => ({ ...g, poleSpacingM: n }))}
                  step={1}
                />
              </div>
            </div>
          )}

          {message && <p className="text-xs text-emerald-300">{message}</p>}
          {error && <p className="text-xs text-red-300">{error}</p>}
        </div>
      )}
    </section>
  );
}

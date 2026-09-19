"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Moon,
  Sun,
  Ruler,
  Pentagon,
  Mountain,
  Crosshair,
  Eye,
  Bot,
  Layers,
  Lightbulb,
  Zap,
  Undo2,
  Trash2,
  Play,
  Pause,
  MapPin,
  Waypoints,
  Link2,
  Navigation,
  FlaskConical,
  Activity,
  Settings,
  Plus,
  Minus,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  SANDCASTLE_PRESET_NOTE,
  SANDCASTLE_TEST_TILESET_URL,
} from "@/lib/sandcastle-preset";
import { useTwinPlatform } from "@/hooks/useTwinPlatform";
import { useLayerCatalog } from "@/hooks/useLayerCatalog";
import { useWeather } from "@/hooks/useWeather";
import { OperationsPanel } from "@/components/twin/OperationsPanel";
import { WalkthroughControls } from "@/components/twin/WalkthroughControls";
import { TimeSlider } from "@/components/twin/TimeSlider";
import { AssetDetailDrawer } from "@/components/twin/AssetDetailDrawer";
import type {
  ActiveTool,
  MeasureResult,
  PlacedPole,
  RobotState,
  TimeOfDay,
  TwinConfig,
} from "@/lib/types";
import type { WalkthroughMode } from "@/lib/twin/types";
import { zoomCamera } from "@/lib/twin/camera-controls";
import { weatherWetness } from "@/lib/weather/apply-weather";

const CesiumViewer = dynamic(
  () =>
    import("@/components/twin/CesiumViewer").then((m) => m.CesiumViewer),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 grid place-items-center bg-[#0a1018] text-slate-300">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-pulse rounded-md bg-teal-500/25" />
          <p className="font-display text-base tracking-wide text-slate-200">
            Opening twin…
          </p>
        </div>
      </div>
    ),
  }
);

export function TwinWorkspace() {
  const [config, setConfig] = useState<TwinConfig>({
    cesiumIonToken: null,
    cesiumIonAssetId: null,
    defaultTilesetUrl: null,
    basemap: "osm",
    demoScene: "campus",
    sandcastleTilesetUrl: SANDCASTLE_TEST_TILESET_URL,
  });
  const [tool, setTool] = useState<ActiveTool>("navigate");
  const layerCatalog = useLayerCatalog();
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>("day");
  const [poles, setPoles] = useState<PlacedPole[]>([]);
  const [poleHistory, setPoleHistory] = useState<PlacedPole[][]>([]);
  const [poleLightsOn, setPoleLightsOn] = useState(true);
  const [measure, setMeasure] = useState<MeasureResult | null>(null);
  const [status, setStatus] = useState("Booting…");
  const [tilesetUrl, setTilesetUrl] = useState("");
  const [activeScene, setActiveScene] = useState<"campus" | "sandcastle">(
    "campus"
  );
  const [robot, setRobot] = useState<RobotState>({
    playing: false,
    progress: 0,
    speed: 1,
  });
  const [panel, setPanel] = useState<"layers" | "sim" | "ops" | "connect">("ops");

  const twin = useTwinPlatform(robot.progress);
  const liveWeather = useWeather(true);
  const wetness = weatherWetness(liveWeather.weather);

  useEffect(() => {
    if (!liveWeather.followDayNight) return;
    if (liveWeather.weather?.isDay == null) return;
    setTimeOfDay(liveWeather.weather.isDay ? "day" : "night");
  }, [liveWeather.followDayNight, liveWeather.weather?.isDay]);

  const handleRobotProgress = useCallback((progress: number) => {
    setRobot((r) => (r.progress === progress ? r : { ...r, progress }));
  }, []);

  useEffect(() => {
    fetch("/api/config")
      .then(async (r) => {
        if (!r.ok) throw new Error(`Config ${r.status}`);
        return r.json();
      })
      .then((data: TwinConfig) => {
        setConfig({
          ...data,
          sandcastleTilesetUrl:
            data.sandcastleTilesetUrl || SANDCASTLE_TEST_TILESET_URL,
        });
        if (data.defaultTilesetUrl) setTilesetUrl(data.defaultTilesetUrl);
      })
      .catch((err) => {
        console.warn("Config fetch failed, keeping demo defaults", err);
      });
  }, []);

  const loadSandcastleTest = () => {
    const url = config.sandcastleTilesetUrl || SANDCASTLE_TEST_TILESET_URL;
    setActiveScene("sandcastle");
    setPanel("connect");
    setTilesetUrl(url);
    setStatus("Loading Sandcastle test tileset…");
  };

  const loadCampusDemo = () => {
    setActiveScene("campus");
    setTilesetUrl("");
    setStatus("Campus twin ready");
  };

  const updatePoles = useCallback((next: PlacedPole[]) => {
    setPoles((prev) => {
      setPoleHistory((h) => [...h.slice(-24), prev]);
      return next;
    });
  }, []);

  const undoPole = () => {
    setPoleHistory((h) => {
      if (!h.length) return h;
      const prev = h[h.length - 1];
      setPoles(prev);
      return h.slice(0, -1);
    });
  };

  const clearPoles = () => {
    updatePoles([]);
    setMeasure({
      kind: "poles",
      label: "Poles cleared",
      value: "0 poles",
    });
  };

  const toggleLayer = (configId: string) => {
    const layer = layerCatalog.layers.find((l) => l.configId === configId);
    if (!layer) return;
    const nextVisible = !layer.visible;
    layerCatalog.patchLayer(configId, { visible: nextVisible });
    void fetch(`/api/layers/${configId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visible: nextVisible }),
    }).catch(() => {
      layerCatalog.patchLayer(configId, { visible: layer.visible });
      setStatus("Layer toggle failed");
    });
  };

  const handleWalkthroughChange = useCallback(
    (mode: WalkthroughMode) => {
      twin.setWalkthroughMode(mode);
      if (mode === "walk") {
        setRobot((r) => (r.playing ? { ...r, playing: false } : r));
      }
      if ((mode === "first" || mode === "third") && !robot.playing) {
        setPanel("sim");
      }
    },
    [twin, robot.playing]
  );

  const handleWalkActive = useCallback(() => {
    setRobot((r) => (r.playing ? { ...r, playing: false } : r));
  }, []);

  const togglePatrol = useCallback(() => {
    const starting = !robot.playing;
    if (starting && twin.walkthroughMode === "off") {
      twin.setWalkthroughMode("third");
    }
    const criticalNearby = twin.alerts.some(
      (a) => a.severity === "critical" && !a.acknowledged
    );
    setRobot((r) => ({
      ...r,
      playing: starting,
      speed: starting && criticalNearby ? 0.5 : r.speed,
    }));
    setPanel("sim");
  }, [robot.playing, twin]);

  const tools = useMemo(
    () =>
      [
        { id: "navigate" as const, label: "Navigate", icon: Navigation },
        { id: "measure-distance" as const, label: "Distance", icon: Ruler },
        { id: "measure-area" as const, label: "Area", icon: Pentagon },
        { id: "height-profile" as const, label: "Height", icon: Mountain },
        { id: "identify" as const, label: "Identify", icon: Crosshair },
        { id: "viewshed" as const, label: "Viewshed", icon: Eye },
        { id: "place-pole" as const, label: "Place pole", icon: Zap },
        { id: "draw-poles" as const, label: "Draw poles", icon: Waypoints },
      ] as const,
    []
  );

  const criticalCount = twin.alerts.filter(
    (a) => a.severity === "critical" && !a.acknowledged
  ).length;

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#071018] text-slate-100">
      <div className="pointer-events-none absolute inset-0 z-0 twin-atmosphere" />
      <div
        className={cn("pointer-events-none absolute inset-0 z-[1] twin-rain", wetness > 0.08 && "twin-rain--active")}
        style={{ ["--rain-opacity" as string]: Math.min(0.55, 0.12 + wetness * 0.5) }}
        aria-hidden
      />

      <CesiumViewer
        config={config}
        tool={tool}
        layers={layerCatalog.layers}
        timeOfDay={timeOfDay}
        weather={liveWeather.weather}
        poles={poles}
        poleLightsOn={poleLightsOn}
        robot={robot}
        tilesetUrl={tilesetUrl}
        symbology={twin.symbology}
        walkthroughMode={twin.walkthroughMode}
        alerts={twin.alerts}
        onMeasure={setMeasure}
        onPolesChange={updatePoles}
        onRobotProgress={handleRobotProgress}
        onStatus={setStatus}
        onAssetSelect={twin.selectAsset}
        onWalkActive={handleWalkActive}
      />

      <AssetDetailDrawer
        assetGuid={twin.selectedAssetGuid}
        onClose={() => twin.selectAsset(null)}
      />

      {/* Top brand bar */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-4 p-3 md:p-4">
        <div className="pointer-events-auto glass-panel rounded-xl px-3.5 py-2.5">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-gradient-to-br from-slate-200 to-slate-500 text-slate-950">
              <Layers className="h-4 w-4" />
            </div>
            <div>
              <p className="font-display text-lg leading-none tracking-tight text-white">
                TwinBench
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                Genesis Campus · Operations twin
              </p>
            </div>
            <div className="ml-2 hidden items-center gap-2 border-l border-white/10 pl-3 sm:flex">
              <span className="hud-chip">
                <span
                  className={cn(
                    "live-dot",
                    !twin.connected && "live-dot--off",
                    twin.connected && criticalCount > 0 && "live-dot--warn"
                  )}
                />
                {twin.connected ? "Live" : "Offline"}
              </span>
              <span className="hud-chip">EPSG:4326</span>
              {liveWeather.weather && (
                <span className="hud-chip" title="Live Open-Meteo feed">
                  {liveWeather.weather.temperatureC != null
                    ? `${liveWeather.weather.temperatureC.toFixed(0)}°C`
                    : "Wx"}
                  {liveWeather.weather.windSpeedMps != null
                    ? ` · ${liveWeather.weather.windSpeedMps.toFixed(0)} m/s`
                    : ""}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2">
          <div className="glass-panel flex items-center gap-0.5 rounded-xl p-1">
            <Button asChild size="sm" variant="ghost">
              <Link href="/admin" title="Layer admin">
                <Settings className="h-4 w-4" />
                Admin
              </Link>
            </Button>
            <Button
              size="sm"
              variant={timeOfDay === "day" ? "default" : "ghost"}
              onClick={() => setTimeOfDay("day")}
              aria-pressed={timeOfDay === "day"}
            >
              <Sun className="h-4 w-4" />
              Day
            </Button>
            <Button
              size="sm"
              variant={timeOfDay === "night" ? "default" : "ghost"}
              onClick={() => setTimeOfDay("night")}
              aria-pressed={timeOfDay === "night"}
            >
              <Moon className="h-4 w-4" />
              Night
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => zoomCamera("out")}
              aria-label="Zoom out"
              title="Zoom out"
            >
              <Minus className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => zoomCamera("in")}
              aria-label="Zoom in"
              title="Zoom in"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="glass-panel flex items-center gap-3 rounded-xl px-3 py-2">
            <Lightbulb
              className={cn(
                "h-4 w-4",
                poleLightsOn ? "text-amber-300" : "text-slate-500"
              )}
            />
            <div className="text-xs">
              <p className="font-medium text-slate-200">Site lighting</p>
              <p className="text-slate-500">
                {poleLightsOn ? "Natural" : "Off"} · {poles.length} poles
              </p>
            </div>
            <Switch
              checked={poleLightsOn}
              onCheckedChange={setPoleLightsOn}
              aria-label="Toggle pole lights"
            />
          </div>
        </div>
      </header>

      {/* Walkthrough mode HUD */}
      {twin.walkthroughMode !== "off" && (
        <div className="pointer-events-none absolute left-1/2 top-[4.75rem] z-20 -translate-x-1/2 animate-in-fade">
          <div className="glass-panel rounded-full px-3 py-1.5 text-[11px] text-slate-200">
            {twin.walkthroughMode === "walk"
              ? "Walkthrough · WASD move · drag look"
              : twin.walkthroughMode === "first"
                ? `Cab view · ATLAS-01${robot.playing ? " · roaming" : ""}`
                : `Chase cam · ATLAS-01${robot.playing ? " · roaming" : ""}`}
          </div>
        </div>
      )}

      {/* Left tool rail */}
      <aside className="pointer-events-auto absolute bottom-20 left-3 z-20 flex max-h-[58vh] w-[min(100%-1.5rem,17rem)] flex-col gap-2 md:bottom-auto md:left-4 md:top-24 md:max-h-[calc(100dvh-9.5rem)]">
        <div className="glass-panel rounded-xl p-2">
          <p className="mb-2 px-2 pt-1 text-[10px] uppercase tracking-[0.18em] text-slate-500">
            Analysis tools
          </p>
          <div className="grid grid-cols-2 gap-1">
            {tools.map((t) => {
              const Icon = t.icon;
              const active = tool === t.id;
              return (
                <Button
                  key={t.id}
                  size="sm"
                  variant={active ? "default" : "ghost"}
                  className="justify-start"
                  onClick={() => {
                    setTool(t.id);
                    if (
                      t.id === "measure-distance" ||
                      t.id === "measure-area" ||
                      t.id === "height-profile" ||
                      t.id === "viewshed"
                    ) {
                      window.dispatchEvent(new Event("twin-clear-measure"));
                      setMeasure(null);
                    }
                  }}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </Button>
              );
            })}
          </div>
          <Separator className="my-2" />
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="secondary"
              className="flex-1"
              onClick={undoPole}
              disabled={!poleHistory.length}
            >
              <Undo2 className="h-3.5 w-3.5" />
              Undo
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="flex-1"
              onClick={clearPoles}
              disabled={!poles.length}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear
            </Button>
          </div>
        </div>

        {measure && (
          <div className="glass-panel animate-in-fade rounded-xl border-teal-400/20 p-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-teal-300/80">
              {measure.label}
            </p>
            <p className="mt-1 font-display text-xl text-white">{measure.value}</p>
            {measure.detail && (
              <p className="mt-1 text-xs text-slate-400">{measure.detail}</p>
            )}
          </div>
        )}
      </aside>

      {/* Right panel */}
      <aside className="pointer-events-auto absolute bottom-20 right-3 z-20 w-[min(100%-1.5rem,20rem)] md:bottom-auto md:right-4 md:top-24">
        <div className="glass-panel overflow-hidden rounded-xl">
          <div className="flex border-b border-white/10 p-1">
            {(
              [
                ["ops", "COP", Activity],
                ["layers", "Layers", Layers],
                ["sim", "Robot", Bot],
                ["connect", "Tiles", Link2],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setPanel(id)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs transition",
                  panel === id
                    ? "bg-white/10 text-white"
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          <ScrollArea className="h-[min(44vh,24rem)]">
            <div className="space-y-3 p-3">
              {panel === "ops" && (
                <OperationsPanel
                  readings={twin.readings}
                  alerts={twin.alerts}
                  bms={twin.bms}
                  symbology={twin.symbology}
                  connected={twin.connected}
                  robotBattery={twin.robotTelemetry?.batteryPct}
                  robotAlerts={twin.robotTelemetry?.activeAlerts}
                  weather={liveWeather.weather}
                  weatherError={liveWeather.error}
                  onAcknowledge={twin.acknowledgeAlert}
                  onSelectAsset={twin.selectAsset}
                />
              )}

              {panel === "layers" &&
                (layerCatalog.loading ? (
                  <p className="px-2 text-xs text-slate-500">Loading layers…</p>
                ) : layerCatalog.error ? (
                  <p className="px-2 text-xs text-red-400">{layerCatalog.error}</p>
                ) : layerCatalog.layers.length === 0 ? (
                  <p className="px-2 text-xs text-slate-500">
                    No layers — configure in{" "}
                    <Link href="/admin" className="text-teal-300 underline">
                      admin
                    </Link>
                  </p>
                ) : (
                  layerCatalog.layers.map((layer) => (
                    <div
                      key={layer.configId}
                      className="flex items-start justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2.5"
                    >
                      <div>
                        <p className="text-sm text-slate-100">{layer.label}</p>
                        <p className="text-xs text-slate-500">
                          {layer.description} · z{layer.zOrder}
                        </p>
                      </div>
                      <Switch
                        checked={layer.visible}
                        onCheckedChange={() => toggleLayer(layer.configId)}
                        aria-label={`Toggle ${layer.label}`}
                      />
                    </div>
                  ))
                ))}

              {panel === "sim" && (
                <>
                  <WalkthroughControls
                    mode={twin.walkthroughMode}
                    onChange={handleWalkthroughChange}
                    robotPlaying={robot.playing}
                  />
                  <div className="rounded-lg border border-amber-400/20 bg-amber-400/[0.06] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-amber-300" />
                        <p className="text-sm font-medium text-amber-50">
                          ATLAS-01
                        </p>
                      </div>
                      <span className="hud-chip">
                        <span
                          className={cn(
                            "live-dot",
                            !robot.playing && "live-dot--off"
                          )}
                        />
                        {robot.playing ? "Roaming" : "Standby"}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                      Free campus simulation — no fixed route. Picks live goals
                      and steers across site. Battery{" "}
                      {twin.robotTelemetry?.batteryPct?.toFixed(0) ?? "—"}%.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      variant={robot.playing ? "secondary" : "default"}
                      onClick={togglePatrol}
                    >
                      {robot.playing ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                      {robot.playing ? "Pause" : "Start simulation"}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        setRobot((r) => ({
                          ...r,
                          playing: false,
                          progress: 0,
                        }))
                      }
                    >
                      Reset
                    </Button>
                  </div>
                  <label className="block text-xs text-slate-400">
                    Simulation speed
                    <input
                      type="range"
                      min={0.35}
                      max={2.5}
                      step={0.05}
                      value={robot.speed}
                      onChange={(e) =>
                        setRobot((r) => ({
                          ...r,
                          speed: Number(e.target.value),
                        }))
                      }
                      className="mt-2 w-full accent-teal-400"
                    />
                  </label>
                  <p className="text-xs text-slate-500">
                    Use Chase / Cab to follow the unit. Amber marker stays
                    visible from orbit.
                  </p>
                </>
              )}

              {panel === "connect" && (
                <>
                  <div className="rounded-lg border border-teal-400/20 bg-teal-400/[0.06] p-3">
                    <div className="flex items-center gap-2">
                      <FlaskConical className="h-4 w-4 text-teal-300" />
                      <p className="text-sm font-medium text-teal-50">
                        Sandcastle test
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      {SANDCASTLE_PRESET_NOTE}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        variant={
                          activeScene === "sandcastle" ? "default" : "secondary"
                        }
                        onClick={loadSandcastleTest}
                      >
                        Load sample tiles
                      </Button>
                      <Button
                        size="sm"
                        variant={
                          activeScene === "campus" ? "default" : "secondary"
                        }
                        onClick={loadCampusDemo}
                      >
                        Campus
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed text-slate-400">
                    Paste a <code className="text-teal-300">tileset.json</code>{" "}
                    URL, or set{" "}
                    <code className="text-teal-300">CESIUM_ION_TOKEN</code> and{" "}
                    <code className="text-teal-300">CESIUM_ION_ASSET_ID</code>{" "}
                    in the environment. Demo campus works without credentials.
                  </p>
                  <label className="block text-xs text-slate-400">
                    3D Tiles URL
                    <input
                      value={tilesetUrl}
                      onChange={(e) => {
                        setTilesetUrl(e.target.value);
                        setActiveScene(
                          e.target.value.includes("sandcastle-tileset")
                            ? "sandcastle"
                            : "campus"
                        );
                      }}
                      placeholder="https://…/tileset.json"
                      className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100 outline-none ring-teal-400/40 placeholder:text-slate-600 focus:ring-2"
                    />
                  </label>
                  <div className="rounded-lg border border-white/5 bg-white/[0.03] p-3 text-xs text-slate-400">
                    <p>
                      Ion token:{" "}
                      {config.cesiumIonToken ? (
                        <span className="text-teal-300">configured</span>
                      ) : (
                        <span className="text-slate-500">not set</span>
                      )}
                    </p>
                    <p className="mt-1">
                      Ion asset:{" "}
                      {config.cesiumIonAssetId ?? (
                        <span className="text-slate-500">not set</span>
                      )}
                    </p>
                    <p className="mt-1">
                      Scene:{" "}
                      <span className="text-teal-300">{activeScene}</span>
                    </p>
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        </div>
      </aside>

      {/* Status bar */}
      <footer className="absolute inset-x-0 bottom-0 z-20 p-3 md:p-4">
        <div className="glass-panel flex flex-col gap-2 rounded-xl px-3 py-2">
          <TimeSlider
            isLive={twin.isLive}
            simulationTime={twin.simulationTime}
            onChange={twin.setSimulationTime}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
            <span className="truncate">{status}</span>
            <span className="flex items-center gap-3">
              <span>
                {timeOfDay === "day" ? "Daylight" : "Night"} · lights{" "}
                {poleLightsOn ? "on" : "off"}
              </span>
              <span className="hidden sm:inline">
                {criticalCount > 0
                  ? `${criticalCount} critical alerts`
                  : activeScene === "sandcastle"
                    ? "Sandcastle sample tiles"
                    : "Campus twin · live telemetry"}
              </span>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

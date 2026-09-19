"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  MapPin,
  Waypoints,
  Navigation,
  FlaskConical,
  Activity,
  Network,
  Settings,
  Plus,
  Minus,
  X,
  Wrench,
  Box,
  Focus,
  Scissors,
  Magnet,
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
  SAMPLE_TILESET_URL,
} from "@/lib/sandcastle-preset";
import { useTwinPlatform } from "@/hooks/useTwinPlatform";
import { useLayerCatalog } from "@/hooks/useLayerCatalog";
import { useWeather } from "@/hooks/useWeather";
import { OperationsPanel } from "@/components/twin/OperationsPanel";
import { TwinInsightPanel } from "@/components/twin/TwinInsightPanel";
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
import {
  weatherWetness,
  weatherWindFactor,
  weatherWindCssAngle,
} from "@/lib/weather/apply-weather";
import type { PlatformSettings } from "@/lib/platform/types";
import {
  DEFAULT_GIS,
  DEFAULT_INFORMATICS,
  DEFAULT_SIMULATION,
  DEFAULT_BRANDING,
  DEFAULT_SHELL,
} from "@/lib/platform/types";
import type { DockModuleId } from "@/lib/platform/types";
import { ErrorDashboard, type TwinError } from "@/components/twin/ErrorDashboard";
import { requestZoomToLayer } from "@/lib/twin/zoom-to-layer";
import type { TwinErrorEvent, ZoomLayerTarget } from "@/lib/twin/zoom-to-layer";
import { pauseWalkChase } from "@/lib/twin/keyboard-walk";
import {
  TILESET_STYLE_PRESETS,
  type DrapeMode,
  type TilesetStylePreset,
} from "@/lib/twin/cesium-advanced";

type DockPanel = DockModuleId | null;

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
  const layerCatalog = useLayerCatalog({ pollMs: 30_000 });
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>("day");
  const [poles, setPoles] = useState<PlacedPole[]>([]);
  const [poleHistory, setPoleHistory] = useState<PlacedPole[][]>([]);
  const [poleLightsOn, setPoleLightsOn] = useState(true);
  const [measure, setMeasure] = useState<MeasureResult | null>(null);
  const [status, setStatus] = useState("Booting…");
  const [errors, setErrors] = useState<TwinError[]>([]);
  const [tilesetUrl, setTilesetUrl] = useState("");
  const [vectorTilesUrl, setVectorTilesUrl] = useState("");
  const [drapeMode, setDrapeMode] = useState<DrapeMode>("both");
  const [tilesetStylePreset, setTilesetStylePreset] =
    useState<TilesetStylePreset>("default");
  const [clipInverse, setClipInverse] = useState(false);
  const [activeScene, setActiveScene] = useState<"demo" | "tiles">("demo");
  const pendingTilesetZoom = useRef<ZoomLayerTarget | null>(null);
  const [robot, setRobot] = useState<RobotState>({
    playing: false,
    progress: 0,
    speed: 1,
  });
  const [robotResetToken, setRobotResetToken] = useState(0);
  const [panel, setPanel] = useState<DockPanel>(null);
  const [platform, setPlatform] = useState<PlatformSettings | null>(null);

  const twin = useTwinPlatform(robot.progress);
  const weatherPollMs =
    (platform?.informatics.weatherPollMinutes ??
      DEFAULT_INFORMATICS.weatherPollMinutes) *
    60 *
    1000;
  const liveWeather = useWeather(true, weatherPollMs);
  const wetness = weatherWetness(liveWeather.weather);
  const windFactor = weatherWindFactor(liveWeather.weather);
  const windAngle = weatherWindCssAngle(liveWeather.weather);
  const windRad = (windAngle * Math.PI) / 180;
  const windDuration = Math.max(0.35, 1.8 - windFactor * 1.35);
  const sim = platform?.simulation ?? DEFAULT_SIMULATION;
  const informatics = platform?.informatics ?? DEFAULT_INFORMATICS;
  const gis = platform?.gis ?? DEFAULT_GIS;
  const branding = platform?.branding ?? DEFAULT_BRANDING;
  const shell = platform?.shell ?? DEFAULT_SHELL;
  const defaultPanelApplied = useRef(false);
  const walkthroughDefaultApplied = useRef(false);

  useEffect(() => {
    if (!liveWeather.followDayNight) return;
    if (liveWeather.weather?.isDay == null) return;
    setTimeOfDay(liveWeather.weather.isDay ? "day" : "night");
  }, [liveWeather.followDayNight, liveWeather.weather?.isDay]);

  const handleRobotProgress = useCallback((progress: number) => {
    setRobot((r) => (r.progress === progress ? r : { ...r, progress }));
  }, []);

  const applyPlatform = useCallback(
    (settings: PlatformSettings) => {
      setPlatform(settings);
      if (
        !defaultPanelApplied.current &&
        settings.shell.defaultPanel &&
        settings.shell.modules.some(
          (m) => m.id === settings.shell.defaultPanel && m.enabled
        )
      ) {
        setPanel(settings.shell.defaultPanel);
        defaultPanelApplied.current = true;
      }
      if (!walkthroughDefaultApplied.current) {
        const mode =
          settings.simulation.defaultWalkthroughMode === "walk"
            ? "walk"
            : settings.simulation.defaultWalkthroughMode === "off"
              ? "off"
              : "walk"; // chase/cab → WASD walk
        twin.setWalkthroughMode(mode);
        walkthroughDefaultApplied.current = true;
      }
    },
    [twin]
  );

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
        if (data.defaultTilesetUrl) {
          setTilesetUrl(data.defaultTilesetUrl);
          setActiveScene("tiles");
        }
      })
      .catch((err) => {
        console.warn("Config fetch failed, keeping demo defaults", err);
      });

    const loadPlatform = () =>
      fetch("/api/platform-settings")
        .then(async (r) => {
          if (!r.ok) throw new Error(`platform ${r.status}`);
          return r.json();
        })
        .then((data: { settings: PlatformSettings }) => {
          applyPlatform(data.settings);
        })
        .catch((err) => {
          console.warn("Platform settings unavailable", err);
        });

    void loadPlatform();
    const id = setInterval(loadPlatform, 12_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When admin uploads/changes the platform tileset URL, pick it up
  const platformDataSource = layerCatalog.layers.find(
    (l) => l.builtInKey === "tileset" || l.category === "tiles-3d"
  )?.dataSource;
  useEffect(() => {
    if (!platformDataSource) return;
    setTilesetUrl((prev) => {
      if (prev === platformDataSource) return prev;
      // Auto-load new admin uploads; don't override an in-progress custom paste
      // unless previous was empty or also a platform/sandcastle path
      if (
        !prev ||
        prev.startsWith("/uploads/tilesets/") ||
        prev.includes("sandcastle-tileset")
      ) {
        setActiveScene("tiles");
        return platformDataSource;
      }
      return prev;
    });
  }, [platformDataSource]);

  const togglePanel = (id: Exclude<DockPanel, null>) => {
    setPanel((p) => (p === id ? null : id));
  };

  const loadSandcastleTest = () => {
    const url =
      config.sandcastleTilesetUrl ||
      SAMPLE_TILESET_URL ||
      SANDCASTLE_TEST_TILESET_URL;
    setActiveScene("tiles");
    setPanel("tiles");
    setTilesetUrl(url);
    twin.setWalkthroughMode("off");
    setRobot((r) => ({ ...r, playing: false }));
    setStatus("Loading sample tileset (AGI HQ)…");
  };

  useEffect(() => {
    const onError = (e: Event) => {
      const detail = (e as CustomEvent<TwinErrorEvent>).detail;
      if (!detail?.message) return;
      setErrors((prev) => {
        const next: TwinError = {
          ...detail,
          at: Date.now(),
        };
        // Dedupe identical open messages
        if (
          prev.some(
            (p) =>
              p.message === next.message &&
              p.detail === next.detail &&
              Date.now() - p.at < 4_000
          )
        ) {
          return prev;
        }
        return [next, ...prev].slice(0, 20);
      });
    };
    const onTilesetReady = (e: Event) => {
      const pending = pendingTilesetZoom.current;
      if (!pending) return;
      pendingTilesetZoom.current = null;
      // Small delay so tilesetRef is set and bounding sphere starts filling
      window.setTimeout(() => {
        requestZoomToLayer(pending);
      }, 120);
    };
    window.addEventListener("twin-error", onError);
    window.addEventListener("twin-tileset-ready", onTilesetReady);
    return () => {
      window.removeEventListener("twin-error", onError);
      window.removeEventListener("twin-tileset-ready", onTilesetReady);
    };
  }, []);

  const pushError = useCallback(
    (message: string, source: string, detail?: string) => {
      setErrors((prev) =>
        [
          {
            id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            message,
            detail,
            source,
            at: Date.now(),
          },
          ...prev,
        ].slice(0, 20)
      );
    },
    []
  );

  const focusLayer = (layer: {
    configId: string;
    key: string;
    builtInKey?: string | null;
    label: string;
  }) => {
    // Orbit so chase cam doesn't fight the zoom fly-to
    twin.setWalkthroughMode("off");
    setRobot((r) => ({ ...r, playing: false }));

    const target: ZoomLayerTarget = {
      configId: layer.configId,
      key: layer.key,
      builtInKey: layer.builtInKey,
    };

    if (layer.builtInKey === "tileset") {
      const url = tilesetUrl.trim() || SAMPLE_TILESET_URL;
      if (!tilesetUrl.trim()) {
        pendingTilesetZoom.current = target;
        setTilesetUrl(url);
        setActiveScene("tiles");
        setStatus("Loading sample tileset, then zooming…");
        // Fallback if ready event never fires
        window.setTimeout(() => {
          if (pendingTilesetZoom.current === target) {
            pendingTilesetZoom.current = null;
            requestZoomToLayer(target);
          }
        }, 10_000);
        return;
      }
      setActiveScene("tiles");
      setStatus(`Focusing ${layer.label}…`);
    }

    requestZoomToLayer(target);
  };

  useEffect(() => {
    if (!liveWeather.error) return;
    pushError(liveWeather.error, "Weather");
  }, [liveWeather.error, pushError]);

  const loadDemoScene = () => {
    setActiveScene("demo");
    setTilesetUrl("");
    setStatus("Demo twin ready");
  };

  const loadPlatformTileset = () => {
    const tilesLayer = layerCatalog.layers.find(
      (l) => l.builtInKey === "tileset" || l.category === "tiles-3d"
    );
    if (tilesLayer?.dataSource) {
      setTilesetUrl(tilesLayer.dataSource);
      setActiveScene("tiles");
      setStatus("Loading platform tileset…");
      layerCatalog.patchLayer(tilesLayer.configId, { visible: true });
    } else {
      setStatus("No platform tileset — upload one in Admin");
      setPanel("tiles");
    }
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
      // Only Orbit + Walk — map legacy chase/cab to walk
      const next: WalkthroughMode =
        mode === "first" || mode === "third" ? "walk" : mode;
      twin.setWalkthroughMode(next);
      if (next === "walk") {
        setRobot((r) => ({ ...r, playing: false }));
        setPanel("sim");
        return;
      }
    },
    [twin]
  );

  const handleWalkActive = useCallback(() => {
    // WASD is driving — ensure free-roam stays off
    setRobot((r) => (r.playing ? { ...r, playing: false } : r));
  }, []);

  const togglePatrol = useCallback(() => {
    // Free-roam removed — Walk (WASD) is the only robot drive mode
    twin.setWalkthroughMode("walk");
    setRobot((r) => ({ ...r, playing: false }));
    setPanel("sim");
  }, [twin]);

  const tools = useMemo(() => {
    const all = [
      { id: "navigate" as const, label: "Navigate", icon: Navigation },
      { id: "measure-distance" as const, label: "Distance", icon: Ruler },
      { id: "measure-area" as const, label: "Area", icon: Pentagon },
      { id: "height-profile" as const, label: "Height", icon: Mountain },
      { id: "identify" as const, label: "Identify", icon: Crosshair },
      { id: "viewshed" as const, label: "Viewshed", icon: Eye },
      { id: "clip-polygon" as const, label: "Clip", icon: Scissors },
      { id: "clip-hole" as const, label: "Clip hole", icon: Scissors },
      { id: "bim-snap" as const, label: "BIM snap", icon: Magnet },
      { id: "place-pole" as const, label: "Place pole", icon: Zap },
      { id: "draw-poles" as const, label: "Draw poles", icon: Waypoints },
      { id: "robot-waypoints" as const, label: "Move robot", icon: MapPin },
    ] as const;
    return all.filter(
      (t) =>
        t.id === "navigate" ||
        t.id === "robot-waypoints" ||
        t.id === "clip-polygon" ||
        t.id === "clip-hole" ||
        t.id === "bim-snap" ||
        gis.enabledTools.includes(t.id as (typeof gis.enabledTools)[number])
    );
  }, [gis.enabledTools]);

  const criticalCount = twin.alerts.filter(
    (a) => a.severity === "critical" && !a.acknowledged
  ).length;

  const platformTilesUrl =
    layerCatalog.layers.find(
      (l) => l.builtInKey === "tileset" || l.category === "tiles-3d"
    )?.dataSource ?? null;

  const dockIconMap = {
    live: Activity,
    insight: Network,
    sim: Bot,
    tiles: Box,
    layers: Layers,
    tools: Wrench,
  } as const;

  const dockItems = [...shell.modules]
    .filter((m) => m.enabled)
    .sort((a, b) => a.order - b.order)
    .map((m) => ({
      id: m.id,
      label: m.label,
      icon: dockIconMap[m.id],
    }));

  const panelTitle: Record<DockModuleId, string> = Object.fromEntries(
    shell.modules.map((m) => [
      m.id,
      m.id === "insight" ? shell.insightPanelTitle || m.panelTitle : m.panelTitle,
    ])
  ) as Record<DockModuleId, string>;

  const footerText = shell.footerTemplate
    .replace("{status}", status)
    .replace("{tod}", timeOfDay === "day" ? "Day" : "Night")
    .replace(
      "{temp}",
      liveWeather.weather?.temperatureC != null
        ? informatics.temperatureUnit === "F"
          ? `${((liveWeather.weather.temperatureC * 9) / 5 + 32).toFixed(0)}°F`
          : `${liveWeather.weather.temperatureC.toFixed(0)}°C`
        : "—"
    )
    .replace("{alerts}", String(criticalCount));

  return (
    <div
      className="relative h-[100dvh] w-full overflow-hidden bg-[#071018] text-slate-100"
        style={
          {
            ["--twin-accent-from"]: branding.accentFrom,
            ["--twin-accent-to"]: branding.accentTo,
          } as Record<string, string>
        }
    >
      <div className="pointer-events-none absolute inset-0 z-0 twin-atmosphere" />
      <div
        className={cn(
          "pointer-events-none absolute inset-0 z-[1] twin-rain",
          wetness > 0.08 && "twin-rain--active"
        )}
        style={{
          ["--rain-opacity" as string]: Math.min(0.55, 0.12 + wetness * 0.5),
        }}
        aria-hidden
      />
      <div
        className={cn(
          "pointer-events-none absolute inset-0 z-[1] twin-wind",
          windFactor > 0.08 && "twin-wind--active"
        )}
        style={
          {
            ["--wind-opacity" as string]: Math.min(
              0.55,
              0.1 + windFactor * 0.5
            ),
            ["--wind-angle" as string]: `${windAngle}deg`,
            ["--wind-duration" as string]: `${windDuration}s`,
            ["--wind-drift-x" as string]: `${Math.round(Math.cos(windRad) * 120)}px`,
            ["--wind-drift-y" as string]: `${Math.round(Math.sin(windRad) * 120)}px`,
          } as Record<string, string>
        }
        aria-hidden
      />

      <CesiumViewer
        config={config}
        tool={tool}
        layers={layerCatalog.layers}
        timeOfDay={timeOfDay}
        weather={liveWeather.weather}
        platformSettings={platform}
        poles={poles}
        poleLightsOn={poleLightsOn}
        robot={robot}
        tilesetUrl={tilesetUrl}
        vectorTilesUrl={vectorTilesUrl}
        drapeMode={drapeMode}
        tilesetStylePreset={tilesetStylePreset}
        clipInverse={clipInverse}
        symbology={twin.symbology}
        walkthroughMode={twin.walkthroughMode}
        alerts={twin.alerts}
        onMeasure={setMeasure}
        onPolesChange={updatePoles}
        onRobotProgress={handleRobotProgress}
        onStatus={setStatus}
        onAssetSelect={twin.selectAsset}
        onWalkActive={handleWalkActive}
        robotResetToken={robotResetToken}
      />

      <AssetDetailDrawer
        assetGuid={twin.selectedAssetGuid}
        onClose={() => twin.selectAsset(null)}
      />

      {/* Minimal brand */}
      {shell.showHeader && (
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-3 md:p-4">
        {branding.showBrandChip && (
        <div className="pointer-events-auto glass-panel flex items-center gap-3 rounded-xl px-3 py-2">
          <div
            className="grid h-8 w-8 place-items-center rounded-md text-slate-950"
            style={{
              background: `linear-gradient(135deg, ${branding.accentFrom}, ${branding.accentTo})`,
            }}
          >
            <Layers className="h-3.5 w-3.5" />
          </div>
          <div>
            <p className="font-display text-base leading-none tracking-tight text-white">
              {branding.productName}
            </p>
            <p className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-slate-500">
              {branding.tagline}
            </p>
          </div>
          {branding.showLiveChip && (
          <span className="hud-chip ml-1">
            <span
              className={cn(
                "live-dot",
                !twin.connected && "live-dot--off",
                twin.connected && criticalCount > 0 && "live-dot--warn"
              )}
            />
            {twin.connected ? branding.liveLabel : branding.offlineLabel}
          </span>
          )}
        </div>
        )}

        <div className="pointer-events-auto ml-auto flex items-center gap-1.5">
          <div className="glass-panel flex items-center gap-0.5 rounded-xl p-1">
            {shell.showAdminLink && (
            <Button asChild size="sm" variant="ghost" title="Control Center">
              <Link href="/admin">
                <Settings className="h-4 w-4" />
              </Link>
            </Button>
            )}
            {shell.showDayNightToggle && (
            <>
            <Button
              size="sm"
              variant={timeOfDay === "day" ? "default" : "ghost"}
              onClick={() => setTimeOfDay("day")}
              title="Day"
            >
              <Sun className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant={timeOfDay === "night" ? "default" : "ghost"}
              onClick={() => setTimeOfDay("night")}
              title="Night"
            >
              <Moon className="h-4 w-4" />
            </Button>
            </>
            )}
            {shell.showZoomControls && (
            <>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => zoomCamera("out")}
              title="Zoom out"
            >
              <Minus className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => zoomCamera("in")}
              title="Zoom in"
            >
              <Plus className="h-4 w-4" />
            </Button>
            </>
            )}
          </div>
        </div>
      </header>
      )}

      {twin.walkthroughMode === "walk" && (
        <div className="pointer-events-none absolute left-1/2 top-16 z-20 -translate-x-1/2 animate-in-fade">
          <div className="glass-panel rounded-full px-3 py-1.5 text-[11px] text-slate-200">
            Walk · {sim.robotName} · WASD
            {tilesetUrl ? " · tileset surface" : " · campus roads"}
            {tool === "robot-waypoints" ? " · click to place" : ""}
          </div>
        </div>
      )}

      {measure && (
        <div className="pointer-events-none absolute left-1/2 top-24 z-20 -translate-x-1/2 animate-in-fade">
          <div className="glass-panel rounded-xl border-teal-400/20 px-4 py-2 text-center">
            <p className="text-[10px] uppercase tracking-[0.14em] text-teal-300/80">
              {measure.label}
            </p>
            <p className="font-display text-lg text-white">{measure.value}</p>
          </div>
        </div>
      )}

      {/* Click-to-open dock */}
      <nav className="pointer-events-auto absolute bottom-16 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-2xl border border-white/25 bg-[#071018]/95 p-2 shadow-[0_8px_32px_rgba(0,0,0,0.55)] backdrop-blur-xl md:bottom-20">
        {dockItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => togglePanel(id)}
            className={cn(
              "flex min-w-[4rem] flex-col items-center gap-1 rounded-xl px-3 py-2.5 text-[11px] font-medium tracking-wide transition",
              panel === id
                ? "bg-teal-400/25 text-white shadow-inner ring-1 ring-teal-300/40"
                : "bg-white/[0.07] text-slate-100 hover:bg-white/15 hover:text-white"
            )}
          >
            <Icon className="h-5 w-5 shrink-0 opacity-95" />
            <span className="leading-none">{label}</span>
          </button>
        ))}
      </nav>

      {/* Single floating panel */}
      {panel && (
        <aside className="pointer-events-auto absolute bottom-32 left-1/2 z-30 w-[min(100%-1.5rem,22rem)] -translate-x-1/2 animate-in-fade md:bottom-auto md:left-auto md:right-4 md:top-20 md:translate-x-0">
          <div className="glass-panel overflow-hidden rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2.5">
              <p className="text-sm font-medium text-white">{panelTitle[panel]}</p>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => setPanel(null)}
                aria-label="Close panel"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <ScrollArea className="h-[min(52vh,28rem)]">
              <div className="space-y-3 p-3">
                {panel === "live" && (
                  <>
                    <OperationsPanel
                      alerts={twin.alerts}
                      bms={twin.bms}
                      connected={twin.connected}
                      robotBattery={twin.robotTelemetry?.batteryPct}
                      robotAlerts={twin.robotTelemetry?.activeAlerts}
                      weather={liveWeather.weather}
                      weatherError={liveWeather.error}
                      informatics={informatics}
                      onAcknowledge={twin.acknowledgeAlert}
                      onSelectAsset={twin.selectAsset}
                    />
                    {informatics.showTimeSlider && (
                    <div className="rounded-lg border border-white/5 bg-white/[0.03] p-2">
                      <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                        Time travel
                      </p>
                      <TimeSlider
                        isLive={twin.isLive}
                        simulationTime={twin.simulationTime}
                        onChange={twin.setSimulationTime}
                      />
                      <p className="mt-2 text-[10px] text-slate-500">
                        Weather refreshes every{" "}
                        {informatics.weatherPollMinutes} minutes
                        {liveWeather.updatedAt
                          ? ` · last ${new Date(liveWeather.updatedAt).toLocaleTimeString()}`
                          : ""}
                      </p>
                    </div>
                    )}
                  </>
                )}

                {panel === "insight" && (
                  <TwinInsightPanel
                    onSelectAsset={twin.selectAsset}
                    showBim={shell.showInsightBim}
                    showScenario={shell.showInsightScenario}
                    showAnalytics={shell.showInsightAnalytics}
                  />
                )}

                {panel === "sim" && (
                  <>
                    <WalkthroughControls
                      mode={
                        twin.walkthroughMode === "walk" ? "walk" : "off"
                      }
                      onChange={handleWalkthroughChange}
                      robotPlaying={false}
                      tilesetActive={Boolean(tilesetUrl.trim())}
                    />
                    <div className="rounded-lg border border-amber-400/20 bg-amber-400/[0.06] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-amber-300" />
                          <p className="text-sm font-medium text-amber-50">
                            {sim.robotName}
                          </p>
                        </div>
                        <span className="hud-chip">
                          <span
                            className={cn(
                              "live-dot",
                              twin.walkthroughMode !== "walk" && "live-dot--off"
                            )}
                          />
                          {twin.walkthroughMode === "walk"
                            ? "WASD ready"
                            : "Orbit"}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                        {tilesetUrl
                          ? "External tileset — WASD walks the mesh surface. Use Click to move to drop ATLAS-01 anywhere on the model."
                          : "Campus roads — WASD stays outdoors. Load a tileset to walk its surface."}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
                        variant={
                          twin.walkthroughMode === "walk"
                            ? "secondary"
                            : "default"
                        }
                        onClick={togglePatrol}
                      >
                        <Play className="h-4 w-4" />
                        {twin.walkthroughMode === "walk"
                          ? "Walking"
                          : "Enter walk"}
                      </Button>
                      <Button
                        variant={
                          tool === "robot-waypoints" ? "default" : "secondary"
                        }
                        onClick={() => {
                          // Freeze chase BEFORE walk mode flips — otherwise the
                          // keyboard-walk RAF snaps the camera to the robot and
                          // leaves the external tileset the user was viewing.
                          pauseWalkChase(120_000);
                          setTool("robot-waypoints");
                          twin.setWalkthroughMode("walk");
                          setRobot((r) => ({ ...r, playing: false }));
                          setStatus(
                            tilesetUrl.trim()
                              ? "Click the external tileset to place ATLAS-01 (stays on this layer)"
                              : "Click the map to place ATLAS-01"
                          );
                        }}
                      >
                        <MapPin className="h-4 w-4" />
                        Click to move
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setRobot((r) => ({
                            ...r,
                            playing: false,
                            progress: 0,
                          }));
                          setRobotResetToken((n) => n + 1);
                          twin.setWalkthroughMode("walk");
                          setTool("navigate");
                          setStatus(
                            tilesetUrl.trim()
                              ? "Reset — robot on external tileset"
                              : "Reset — robot on campus"
                          );
                        }}
                      >
                        Reset
                      </Button>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2">
                      <div className="flex items-center gap-2 text-xs text-slate-300">
                        <Lightbulb
                          className={cn(
                            "h-4 w-4",
                            poleLightsOn ? "text-amber-300" : "text-slate-500"
                          )}
                        />
                        Site lighting · {poles.length} poles
                      </div>
                      <Switch
                        checked={poleLightsOn}
                        onCheckedChange={setPoleLightsOn}
                        aria-label="Toggle pole lights"
                      />
                    </div>
                  </>
                )}

                {panel === "tiles" && (
                  <>
                    <p className="text-xs leading-relaxed text-slate-400">
                      Load a tileset separately from the demo scene. Upload
                      locally in{" "}
                      <Link href="/admin" className="text-teal-300 underline">
                        Admin
                      </Link>{" "}
                      or paste a URL.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant={
                          activeScene === "tiles" &&
                          (tilesetUrl.includes("pelican-public") ||
                            tilesetUrl.includes("agi-hq") ||
                            tilesetUrl.includes("sandcastle"))
                            ? "default"
                            : "secondary"
                        }
                        onClick={loadSandcastleTest}
                      >
                        <FlaskConical className="h-3.5 w-3.5" />
                        Sample (AGI HQ)
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={loadPlatformTileset}
                        disabled={!platformTilesUrl}
                      >
                        <Box className="h-3.5 w-3.5" />
                        Platform
                      </Button>
                      <Button
                        size="sm"
                        variant={activeScene === "demo" ? "default" : "secondary"}
                        onClick={loadDemoScene}
                      >
                        Demo scene
                      </Button>
                    </div>
                    {platformTilesUrl && (
                      <p className="truncate font-mono text-[10px] text-slate-500">
                        Platform: {platformTilesUrl}
                      </p>
                    )}
                    <label className="block text-xs text-slate-400">
                      tileset.json URL
                      <input
                        value={tilesetUrl}
                        onChange={(e) => {
                          setTilesetUrl(e.target.value);
                          setActiveScene(e.target.value.trim() ? "tiles" : "demo");
                        }}
                        placeholder={SAMPLE_TILESET_URL}
                        className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-[11px] text-slate-100 outline-none ring-teal-400/40 placeholder:text-slate-600 focus:ring-2"
                      />
                    </label>
                    <p className="text-[10px] text-slate-500">
                      {SANDCASTLE_PRESET_NOTE}
                    </p>
                    <div className="rounded-lg border border-white/5 bg-white/[0.03] p-3 text-xs text-slate-400">
                      <p>
                        Ion:{" "}
                        {config.cesiumIonToken ? (
                          <span className="text-teal-300">token set</span>
                        ) : (
                          <span className="text-slate-500">no token</span>
                        )}
                        {config.cesiumIonAssetId
                          ? ` · asset ${config.cesiumIonAssetId}`
                          : ""}
                      </p>
                      <p className="mt-1">
                        Active:{" "}
                        <span className="text-teal-300">
                          {tilesetUrl ? "tileset" : "demo vectors"}
                        </span>
                      </p>
                    </div>

                    <Separator />
                    <p className="text-[11px] font-medium tracking-wide text-slate-300">
                      CesiumJS 1.145
                    </p>
                    <label className="block text-xs text-slate-400">
                      Vector / secondary 3D Tiles URL
                      <input
                        value={vectorTilesUrl}
                        onChange={(e) => setVectorTilesUrl(e.target.value)}
                        placeholder="https://…/tileset.json (vector or mesh)"
                        className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-[11px] text-slate-100 outline-none ring-teal-400/40 placeholder:text-slate-600 focus:ring-2"
                      />
                    </label>
                    <label className="block text-xs text-slate-400">
                      3D Tiles style
                      <select
                        value={tilesetStylePreset}
                        onChange={(e) =>
                          setTilesetStylePreset(
                            e.target.value as TilesetStylePreset
                          )
                        }
                        className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[11px] text-slate-100 outline-none"
                      >
                        {(
                          Object.keys(TILESET_STYLE_PRESETS) as TilesetStylePreset[]
                        ).map((k) => (
                          <option key={k} value={k}>
                            {TILESET_STYLE_PRESETS[k].label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs text-slate-400">
                      Drape vectors on
                      <select
                        value={drapeMode}
                        onChange={(e) =>
                          setDrapeMode(e.target.value as DrapeMode)
                        }
                        className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[11px] text-slate-100 outline-none"
                      >
                        <option value="both">Terrain + 3D Tiles</option>
                        <option value="tiles">3D Tiles only</option>
                        <option value="terrain">Terrain only</option>
                        <option value="none">Off</option>
                      </select>
                    </label>
                    <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2">
                      <span className="text-xs text-slate-300">
                        Inverse clip
                      </span>
                      <Switch
                        checked={clipInverse}
                        onCheckedChange={setClipInverse}
                        aria-label="Inverse clipping"
                      />
                    </div>
                    <p className="text-[10px] leading-relaxed text-slate-500">
                      Tools → Clip / Clip hole for ClippingPolygon (holes
                      supported). BIM snap needs ion token + BIM/CAD asset.
                    </p>
                  </>
                )}

                {panel === "layers" &&
                  (layerCatalog.loading ? (
                    <p className="text-xs text-slate-500">Loading layers…</p>
                  ) : layerCatalog.error ? (
                    <p className="text-xs text-red-400">{layerCatalog.error}</p>
                  ) : layerCatalog.layers.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      No layers — configure in{" "}
                      <Link href="/admin" className="text-teal-300 underline">
                        admin
                      </Link>
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-[11px] leading-relaxed text-slate-500">
                        Toggle visibility or Focus to fly the camera. External
                        tiles Focus loads the AGI HQ sample when none is set.
                      </p>
                      {layerCatalog.layers.map((layer) => (
                        <div
                          key={layer.configId}
                          className="flex items-start justify-between gap-3 rounded-lg border border-white/8 bg-[#0a121c]/80 px-3 py-2.5"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-100">
                              {layer.label}
                            </p>
                            <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                              {layer.description}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
                            <Button
                              size="icon"
                              variant="secondary"
                              className="h-8 w-8 border border-white/10"
                              title={`Zoom to ${layer.label}`}
                              aria-label={`Zoom to ${layer.label}`}
                              onClick={() => focusLayer(layer)}
                            >
                              <Focus className="h-3.5 w-3.5" />
                            </Button>
                            <Switch
                              checked={layer.visible}
                              onCheckedChange={() =>
                                toggleLayer(layer.configId)
                              }
                              aria-label={`Toggle ${layer.label}`}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}

                {panel === "tools" && (
                  <>
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
                              if (t.id === "robot-waypoints") {
                                pauseWalkChase(120_000);
                                twin.setWalkthroughMode("walk");
                                setRobot((r) => ({ ...r, playing: false }));
                              }
                              setTool(t.id);
                              if (
                                t.id === "measure-distance" ||
                                t.id === "measure-area" ||
                                t.id === "height-profile" ||
                                t.id === "viewshed"
                              ) {
                                window.dispatchEvent(
                                  new Event("twin-clear-measure")
                                );
                                setMeasure(null);
                              }
                              if (t.id === "clip-polygon") {
                                setStatus(
                                  "Clip: click outer ring vertices · double-click to apply"
                                );
                              }
                              if (t.id === "clip-hole") {
                                setStatus(
                                  "Clip hole: click hole ring · double-click to close hole"
                                );
                              }
                              if (t.id === "bim-snap") {
                                setStatus(
                                  config.cesiumIonToken && config.cesiumIonAssetId
                                    ? "BIM snap: click a feature (IonSnapService)"
                                    : "BIM snap needs CESIUM_ION_TOKEN + ion BIM asset"
                                );
                              }
                            }}
                          >
                            <Icon className="h-3.5 w-3.5" />
                            {t.label}
                          </Button>
                        );
                      })}
                    </div>
                    <Separator />
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
                        Clear poles
                      </Button>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="w-full"
                      onClick={() => {
                        window.dispatchEvent(new Event("twin-clear-clip"));
                        setStatus("Clipping cleared");
                      }}
                    >
                      <Scissors className="h-3.5 w-3.5" />
                      Clear clipping
                    </Button>
                    <p className="text-[11px] text-slate-500">
                      Clip / Clip hole use Cesium 1.145 ClippingPolygon (holes
                      supported). BIM snap uses IonSnapService when ion is
                      configured.
                    </p>
                  </>
                )}
              </div>
            </ScrollArea>
          </div>
        </aside>
      )}

      {/* Error dashboard — bottom left */}
      <ErrorDashboard
        errors={errors}
        className={shell.showStatusBar ? undefined : "bottom-3 md:bottom-4"}
        onDismiss={(id) =>
          setErrors((prev) => prev.filter((e) => e.id !== id))
        }
        onClear={() => setErrors([])}
      />

      {/* Slim status */}
      {shell.showStatusBar && (
      <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-3 md:px-4 md:pb-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-full border border-white/8 bg-[#0a1018]/75 px-4 py-1.5 text-[11px] text-slate-400 backdrop-blur-md">
          <span className="truncate">{footerText}</span>
        </div>
      </footer>
      )}
    </div>
  );
}

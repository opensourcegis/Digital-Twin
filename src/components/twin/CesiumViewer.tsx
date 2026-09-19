"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type {
  ActiveTool,
  MeasureResult,
  PlacedPole,
  RobotState,
  TimeOfDay,
  TwinConfig,
} from "@/lib/types";
import type { ViewerLayer } from "@/hooks/useLayerCatalog";
import { formatMeters, formatSquareMeters } from "@/lib/utils";
import { resolveAssetGuid } from "@/lib/twin/asset-map";
import {
  applyBuildingSymbology,
  applyLayerOpacity,
  applySensorSymbology,
  loadCustomGeoJsonLayer,
  loadTwinLayers,
  updateWalkthroughCamera,
} from "@/lib/twin/cesium-layers";
import {
  attachKeyboardWalk,
  enterWalkCamera,
  applyWalkCamera,
  pauseWalkChase,
} from "@/lib/twin/keyboard-walk";
import { pickSurfaceCartesian } from "@/lib/twin/pick-surface";
import {
  applyCesium3DTileStyle,
  applyDrapeToEntities,
  attachTilesetErrorHandlers,
  clearClippingPolygons,
  createIonSnapper,
  loadVectorOrMeshTileset,
  setClippingPolygons,
  snapAgainstBim,
  upsertClipPreview,
  type ClipRing,
  type DrapeMode,
  type TilesetStylePreset,
} from "@/lib/twin/cesium-advanced";
import {
  isPoseOnTileset,
  poseAtTilesetCenter,
  sampleSurfaceHeightEnu,
  tilesetHeightBand,
} from "@/lib/twin/geo-frame";
import {
  attachCameraControls,
  clearUserCameraControl,
  isUserControllingCamera,
  markUserCameraControl,
} from "@/lib/twin/camera-controls";
import {
  layerRenderStateChanged,
  toLayerRenderState,
  type LayerRenderState,
} from "@/lib/twin/layer-viewer-state";
import {
  createAtlasRobot,
  type AtlasRobotHandle,
} from "@/lib/twin/robot-model";
import {
  createWanderController,
  poseToCartesian,
  ROBOT_SPAWN,
  spawnFromSettings,
  type RobotPose,
} from "@/lib/twin/robot-sim";
import {
  removePoleLight,
  startPoleLightFlickerLoop,
  syncNaturalPoleLight,
  type PoleLightCaches,
} from "@/lib/twin/pole-lights";
import type { Alert, WalkthroughMode } from "@/lib/twin/types";
import { TWIN_LOOK, buildingFinish } from "@/lib/twin/visual-theme";
import type { SceneWeather } from "@/lib/weather/types";
import {
  applyTimeOfDay,
  applyWeatherToScene,
  removeWeatherClouds,
} from "@/lib/weather/apply-weather";
import type { PlatformSettings } from "@/lib/platform/types";
import { DEFAULT_GIS, DEFAULT_SIMULATION } from "@/lib/platform/types";
import {
  notifyTilesetReady,
  reportTwinError,
  zoomCameraToLayer,
  type ZoomLayerTarget,
} from "@/lib/twin/zoom-to-layer";

/* eslint-disable @typescript-eslint/no-explicit-any */
type CesiumNS = any;

interface ViewerProps {
  config: TwinConfig;
  tool: ActiveTool;
  layers: ViewerLayer[];
  timeOfDay: TimeOfDay;
  weather?: SceneWeather | null;
  platformSettings?: PlatformSettings | null;
  poles: PlacedPole[];
  poleLightsOn: boolean;
  robot: RobotState;
  tilesetUrl: string;
  /** Additional vector/mesh 3D Tiles URL (Cesium 1.145 vector tiles) */
  vectorTilesUrl?: string;
  /** Drape GeoJSON vectors onto terrain / 3D Tiles */
  drapeMode?: DrapeMode;
  tilesetStylePreset?: TilesetStylePreset;
  clipInverse?: boolean;
  symbology?: Record<string, { color: string; pulse: boolean }>;
  walkthroughMode?: WalkthroughMode;
  alerts?: Alert[];
  onMeasure: (result: MeasureResult | null) => void;
  onPolesChange: (poles: PlacedPole[]) => void;
  onRobotProgress: (progress: number) => void;
  onStatus: (status: string) => void;
  onAssetSelect?: (guid: string | null) => void;
  onWalkActive?: () => void;
  /** Increment to force campus/tileset-aware spawn reset */
  robotResetToken?: number;
}

const CAMPUS = { lon: -122.1339, lat: 37.42205, height: 280 };

function uid() {
  return `pole-${Math.random().toString(36).slice(2, 9)}`;
}

async function loadCesium(): Promise<CesiumNS> {
  if (typeof window === "undefined") {
    throw new Error("Cesium requires a browser");
  }
  const w = window as Window & { CESIUM_BASE_URL?: string; Cesium?: CesiumNS };
  if (w.Cesium) return w.Cesium;

  w.CESIUM_BASE_URL = "/cesium/";

  if (!document.getElementById("cesium-widgets-css")) {
    const link = document.createElement("link");
    link.id = "cesium-widgets-css";
    link.rel = "stylesheet";
    link.href = "/cesium/Widgets/widgets.css";
    document.head.appendChild(link);
  }

  await new Promise<void>((resolve, reject) => {
    const existing = document.getElementById("cesium-js") as HTMLScriptElement | null;
    if (existing) {
      if (w.Cesium) resolve();
      else existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Cesium script failed")));
      return;
    }
    const script = document.createElement("script");
    script.id = "cesium-js";
    script.src = "/cesium/Cesium.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load /cesium/Cesium.js"));
    document.head.appendChild(script);
  });

  if (!w.Cesium) throw new Error("Cesium global missing after script load");
  return w.Cesium;
}

export function CesiumViewer({
  config,
  tool,
  layers,
  timeOfDay,
  weather = null,
  platformSettings = null,
  poles,
  poleLightsOn,
  robot,
  tilesetUrl,
  vectorTilesUrl = "",
  drapeMode = "both",
  tilesetStylePreset = "default",
  clipInverse = false,
  symbology = {},
  walkthroughMode = "off",
  alerts = [],
  onMeasure,
  onPolesChange,
  onRobotProgress,
  onStatus,
  onAssetSelect,
  onWalkActive,
  robotResetToken = 0,
}: ViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cesiumRef = useRef<CesiumNS | null>(null);
  const viewerRef = useRef<any>(null);
  const layerEntities = useRef<Record<string, any[]>>({});
  const tilesetRef = useRef<any>(null);
  const vectorTilesetRef = useRef<any>(null);
  const ionSnapperRef = useRef<any>(null);
  const clipOuterRef = useRef<ClipRing>([]);
  const clipHolesRef = useRef<ClipRing[]>([]);
  const clipHoleDraftRef = useRef<ClipRing>([]);
  const clipPreviewRef = useRef<any>(null);
  const clipInverseRef = useRef(clipInverse);
  const drapeModeRef = useRef(drapeMode);
  const measureEntities = useRef<any[]>([]);
  const measurePoints = useRef<any[]>([]);
  const drawLinePoints = useRef<any[]>([]);
  const drawPreview = useRef<any>(null);
  const poleEntities = useRef<Map<string, any>>(new Map());
  const poleLightCaches = useRef<PoleLightCaches>({
    poles: new Map(),
    lamps: new Map(),
    pools: new Map(),
    hotspots: new Map(),
    cones: new Map(),
  });
  const robotHandle = useRef<AtlasRobotHandle | null>(null);
  const robotPoseRef = useRef<RobotPose>({ ...ROBOT_SPAWN });
  const wanderRef = useRef(createWanderController(7));
  const stopFlickerRef = useRef<(() => void) | null>(null);
  const handlerRef = useRef<any>(null);
  const animFrame = useRef<number | null>(null);
  const polesRef = useRef(poles);
  const toolRef = useRef(tool);
  const poleLightsRef = useRef(poleLightsOn);
  const timeOfDayRef = useRef(timeOfDay);
  const platformSettingsRef = useRef(platformSettings);
  const onPolesChangeRef = useRef(onPolesChange);
  const onMeasureRef = useRef(onMeasure);
  const onStatusRef = useRef(onStatus);
  const onAssetSelectRef = useRef(onAssetSelect);
  const onWalkActiveRef = useRef(onWalkActive);
  const robotResetTokenRef = useRef(robotResetToken);
  const lastResetHandledRef = useRef(0);
  const ensureRobotOnActiveTilesetRef = useRef<
    ((opts?: { snapCamera?: boolean }) => boolean) | null
  >(null);
  const onRobotProgressRef = useRef(onRobotProgress);
  const walkthroughRef = useRef(walkthroughMode);
  const robotPlayingRef = useRef(robot.playing);
  const robotSpeedRef = useRef(robot.speed);
  const symbologyRef = useRef(symbology);
  const alertEntities = useRef<any[]>([]);
  const customLayerEntities = useRef<Map<string, any[]>>(new Map());
  const layersRef = useRef(layers);
  const readyRef = useRef(false);
  const [sceneReadyTick, setSceneReadyTick] = useState(0);
  const windActiveRef = useRef(false);
  const detachKeyboardWalkRef = useRef<(() => void) | null>(null);
  const detachCameraControlsRef = useRef<(() => void) | null>(null);
  const layerRenderStateRef = useRef<Map<string, LayerRenderState>>(new Map());
  const customLayersLoadedRef = useRef<Set<string>>(new Set());

  polesRef.current = poles;
  toolRef.current = tool;
  poleLightsRef.current = poleLightsOn;
  clipInverseRef.current = clipInverse;
  drapeModeRef.current = drapeMode;
  timeOfDayRef.current = timeOfDay;
  platformSettingsRef.current = platformSettings;
  onPolesChangeRef.current = onPolesChange;
  onMeasureRef.current = onMeasure;
  onStatusRef.current = onStatus;
  onAssetSelectRef.current = onAssetSelect;
  onWalkActiveRef.current = onWalkActive;
  robotResetTokenRef.current = robotResetToken;
  onRobotProgressRef.current = onRobotProgress;
  walkthroughRef.current = walkthroughMode;
  robotPlayingRef.current = robot.playing;
  robotSpeedRef.current = robot.speed;
  symbologyRef.current = symbology;
  layersRef.current = layers;

  const clearMeasureGraphics = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    for (const e of measureEntities.current) viewer.entities.remove(e);
    measureEntities.current = [];
    measurePoints.current = [];
    if (drawPreview.current) {
      viewer.entities.remove(drawPreview.current);
      drawPreview.current = null;
    }
    drawLinePoints.current = [];
  }, []);

  const syncPoleEntity = useCallback(
    (Cesium: CesiumNS, viewer: any, pole: PlacedPole) => {
      syncNaturalPoleLight(
        Cesium,
        viewer,
        pole,
        timeOfDayRef.current,
        poleLightsRef.current,
        poleLightCaches.current
      );
    },
    []
  );

  const rebuildPoles = useCallback(() => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!Cesium || !viewer) return;

    const keep = new Set(polesRef.current.map((p) => p.id));
    for (const id of [...poleLightCaches.current.poles.keys()]) {
      if (!keep.has(id)) {
        removePoleLight(viewer, id, poleLightCaches.current);
        poleEntities.current.delete(id);
      }
    }
    for (const pole of polesRef.current) {
      syncPoleEntity(Cesium, viewer, pole);
      poleEntities.current.set(
        pole.id,
        poleLightCaches.current.poles.get(pole.id)
      );
    }
    viewer.scene.requestRender();
  }, [syncPoleEntity]);

  useEffect(() => {
    let destroyed = false;

    function trackMeasure(e: any) {
      measureEntities.current.push(e);
      return e;
    }

    function addMeasurePoint(Cesium: CesiumNS, viewer: any, cartesian: any) {
      trackMeasure(
        viewer.entities.add({
          position: cartesian,
          point: {
            pixelSize: 9,
            color: Cesium.Color.fromCssColorString("#2dd4bf"),
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 1,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        })
      );
    }

    function redrawDrawPreview(Cesium: CesiumNS, viewer: any) {
      if (drawPreview.current) viewer.entities.remove(drawPreview.current);
      if (drawLinePoints.current.length < 2) return;
      drawPreview.current = viewer.entities.add({
        polyline: {
          positions: drawLinePoints.current,
          width: 3,
          material: Cesium.Color.fromCssColorString("#fbbf24"),
        },
      });
    }

    function pickGround(Cesium: CesiumNS, viewer: any, windowPosition: any) {
      // Prefer scene.pickPosition so clicks land on 3D Tiles / buildings
      const picked = viewer.scene.pickPosition(windowPosition);
      if (picked && Cesium.defined(picked)) {
        const carto = Cesium.Cartographic.fromCartesian(picked);
        if (carto && Number.isFinite(carto.height)) return picked;
      }
      const ray = viewer.camera.getPickRay(windowPosition);
      if (!ray) return undefined;
      const globeHit = viewer.scene.globe.pick(ray, viewer.scene);
      if (globeHit) return globeHit;
      return undefined;
    }

    function pathLength(points: any[]) {
      let d = 0;
      const Cesium = cesiumRef.current;
      for (let i = 1; i < points.length; i++) {
        d += Cesium.Cartesian3.distance(points[i - 1], points[i]);
      }
      return d;
    }

    function polygonArea(Cesium: CesiumNS, positions: any[]) {
      try {
        const coords = positions.map((p: any) => {
          const c = Cesium.Cartographic.fromCartesian(p);
          return [
            Cesium.Math.toDegrees(c.longitude),
            Cesium.Math.toDegrees(c.latitude),
          ];
        });
        let area = 0;
        for (let i = 0; i < coords.length; i++) {
          const [x1, y1] = coords[i];
          const [x2, y2] = coords[(i + 1) % coords.length];
          area += x1 * y2 - x2 * y1;
        }
        area = Math.abs(area) / 2;
        const mPerDegLat = 110540;
        const mPerDegLon = 111320 * Math.cos((CAMPUS.lat * Math.PI) / 180);
        return area * mPerDegLat * mPerDegLon;
      } catch {
        return 0;
      }
    }

    async function loadDemoLayers(Cesium: CesiumNS, viewer: any) {
      const buildings = await (await fetch("/demo/campus-buildings.geojson")).json();
      const roads = await (await fetch("/demo/campus-roads.geojson")).json();
      const pois = await (await fetch("/demo/campus-pois.geojson")).json();

      const buildingEntities: any[] = [];
      for (const f of buildings.features) {
        const coords = f.geometry.coordinates[0] as number[][];
        const hierarchy = coords.map(([lon, lat]) =>
          Cesium.Cartesian3.fromDegrees(lon, lat, 0)
        );
        const height = f.properties.height || 20;
        const color = buildingFinish(f.properties.use);
        buildingEntities.push(
          viewer.entities.add({
            name: f.properties.name,
            polygon: {
              hierarchy,
              extrudedHeight: height,
              material: Cesium.Color.fromCssColorString(color).withAlpha(
                TWIN_LOOK.buildings.alpha
              ),
              outline: true,
              outlineColor: Cesium.Color.fromCssColorString(
                TWIN_LOOK.buildings.outline
              ).withAlpha(TWIN_LOOK.buildings.outlineAlpha),
              closeTop: true,
              closeBottom: true,
            },
            properties: f.properties,
          })
        );
      }
      layerEntities.current.buildings = buildingEntities;

      const roadEntities: any[] = [];
      for (const f of roads.features) {
        const positions = (f.geometry.coordinates as number[][]).map(
          ([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat, 0.35)
        );
        const primary = f.properties.class === "primary";
        roadEntities.push(
          viewer.entities.add({
            name: f.properties.name,
            polyline: {
              positions,
              width: primary
                ? TWIN_LOOK.roads.widthPrimary
                : TWIN_LOOK.roads.widthSecondary,
              material: Cesium.Color.fromCssColorString(
                primary ? TWIN_LOOK.roads.primary : TWIN_LOOK.roads.secondary
              ).withAlpha(TWIN_LOOK.roads.alpha),
            },
            properties: f.properties,
          })
        );
      }
      layerEntities.current.roads = roadEntities;

      const poiEntities: any[] = [];
      for (const f of pois.features) {
        const [lon, lat] = f.geometry.coordinates as number[];
        poiEntities.push(
          viewer.entities.add({
            name: f.properties.name,
            position: Cesium.Cartesian3.fromDegrees(lon, lat, 2),
            point: {
              pixelSize: TWIN_LOOK.pois.size,
              color: Cesium.Color.fromCssColorString(TWIN_LOOK.pois.color),
              outlineColor: Cesium.Color.fromCssColorString("#0f172a"),
              outlineWidth: 1,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
            label: {
              text: f.properties.name,
              font: "600 10px DM Sans, sans-serif",
              fillColor: Cesium.Color.fromCssColorString("#f1f5f9"),
              showBackground: true,
              backgroundColor: Cesium.Color.fromCssColorString(
                "#0f172a"
              ).withAlpha(0.7),
              backgroundPadding: new Cesium.Cartesian2(7, 4),
              style: Cesium.LabelStyle.FILL,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              pixelOffset: new Cesium.Cartesian2(0, -12),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              scaleByDistance: new Cesium.NearFarScalar(150, 1.0, 2200, 0.3),
            },
            properties: f.properties,
          })
        );
      }
      layerEntities.current.pois = poiEntities;

      try {
        const sensorData = await (await fetch("/demo/sensors.json")).json();
        const twin = await loadTwinLayers(Cesium, viewer, sensorData.sensors);
        layerEntities.current.utilities = twin.utilityEntities;
        layerEntities.current.terrain = twin.terrainEntities;
        layerEntities.current.sensors = twin.sensorEntities;
      } catch {
        onStatusRef.current("Extended twin layers partially loaded");
      }
    }

    async function boot() {
      if (!containerRef.current) return;
      onStatusRef.current("Loading Cesium…");
      const Cesium = await loadCesium();
      if (destroyed) return;
      cesiumRef.current = Cesium;

      if (config.cesiumIonToken) {
        Cesium.Ion.defaultAccessToken = config.cesiumIonToken;
      }

      const viewer = new Cesium.Viewer(containerRef.current, {
        animation: false,
        timeline: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        baseLayerPicker: false,
        navigationHelpButton: false,
        fullscreenButton: false,
        infoBox: false,
        selectionIndicator: false,
        creditContainer: document.createElement("div"),
        baseLayer: false,
        terrain: undefined,
      });
      viewer.imageryLayers.addImageryProvider(
        new Cesium.UrlTemplateImageryProvider({
          url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
          credit: "© OpenStreetMap",
          maximumLevel: 19,
        })
      );

      viewer.scene.globe.depthTestAgainstTerrain = false;
      viewer.scene.requestRenderMode = true;
      // Keep rendering after recoverable Cesium errors (bad tile / clip BV / clouds)
      viewer.scene.rethrowRenderErrors = false;
      // CesiumWidget's default renderError handler stops the RAF loop + shows a modal.
      // We recover ourselves and surface the fault in the twin Error Dashboard instead.
      try {
        if (viewer.cesiumWidget) {
          viewer.cesiumWidget.showRenderLoopErrors = false;
        }
      } catch {
        /* ignore */
      }
      try {
        viewer.scene.renderError.addEventListener(
          (_scene: unknown, error: unknown) => {
            const msg =
              error instanceof Error ? error.message : String(error ?? "render");
            console.error("Cesium renderError", error);
            reportTwinError({
              source: "Cesium render",
              message: "Rendering error — recovering scene",
              detail: msg,
            });
            try {
              // Resume CesiumWidget RAF (default handler may have flipped this off)
              if (viewer.cesiumWidget) {
                viewer.cesiumWidget.showRenderLoopErrors = false;
                viewer.cesiumWidget.useDefaultRenderLoop = true;
                const panel =
                  viewer.cesiumWidget._element?.querySelector?.(
                    ".cesium-widget-errorPanel"
                  ) ??
                  viewer.container?.querySelector?.(
                    ".cesium-widget-errorPanel"
                  );
                panel?.remove?.();
              }
              // CloudCollection DrawCommands lack boundingVolume → distanceSquaredTo crash
              removeWeatherClouds(viewer);
              clearClippingPolygons({
                tileset: tilesetRef.current ?? vectorTilesetRef.current,
                globe: viewer.scene.globe,
              });
              if (vectorTilesetRef.current) {
                viewer.scene.primitives.remove(vectorTilesetRef.current);
                vectorTilesetRef.current = null;
              }
              viewer.scene.requestRender();
            } catch (recoverErr) {
              console.warn("Render recovery failed", recoverErr);
            }
            onStatusRef.current(`Cesium render recovered · ${msg.slice(0, 80)}`);
          }
        );
      } catch {
        /* ignore */
      }
      // Depth picking for click-to-place on 3D Tiles
      try {
        viewer.scene.pickTranslucentDepth = true;
        viewer.scene.useDepthPicking = true;
      } catch {
        /* older Cesium */
      }
      // Allow interactive wheel/pinch to keep rendering between frames
      viewer.scene.maximumRenderTimeChange = 1 / 30;
      if (viewer.scene.postProcessStages?.fxaa) {
        viewer.scene.postProcessStages.fxaa.enabled = true;
      }

      // Ensure canvas can receive gestures
      const canvas = viewer.canvas ?? viewer.scene.canvas;
      if (canvas) {
        canvas.style.touchAction = "none";
        canvas.tabIndex = 0;
      }

      applyTimeOfDay(Cesium, viewer, "day");
      const home =
        platformSettingsRef.current?.simulation.cameraHome ??
        DEFAULT_SIMULATION.cameraHome;
      // Skip long orbital fly when entering walk — chase cam places itself
      if (walkthroughRef.current === "walk") {
        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(
            home.lon,
            home.lat,
            28
          ),
          orientation: {
            heading: Cesium.Math.toRadians(35),
            pitch: Cesium.Math.toRadians(-32),
            roll: 0,
          },
        });
      } else {
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(
            home.lon,
            home.lat,
            home.height
          ),
          orientation: {
            heading: Cesium.Math.toRadians(home.headingDeg),
            pitch: Cesium.Math.toRadians(home.pitchDeg),
            roll: 0,
          },
          duration: 1.4,
        });
      }

      viewerRef.current = viewer;
      onStatusRef.current("Loading twin…");
      await loadDemoLayers(Cesium, viewer);
      if (destroyed) return;

      const seed: PlacedPole[] = [
        { id: uid(), lon: -122.1352, lat: 37.42188, height: 0, lightsOn: true },
        { id: uid(), lon: -122.1344, lat: 37.42195, height: 0, lightsOn: true },
        { id: uid(), lon: -122.1335, lat: 37.42205, height: 0, lightsOn: true },
        { id: uid(), lon: -122.1328, lat: 37.42215, height: 0, lightsOn: true },
      ];
      onPolesChangeRef.current(seed);

      try {
        const sim = platformSettingsRef.current?.simulation ?? DEFAULT_SIMULATION;
        const spawn = spawnFromSettings(sim.spawn);
        robotPoseRef.current = { ...spawn };
        wanderRef.current = createWanderController({
          seed: 7,
          bounds: sim.bounds,
          turnRateRad: sim.turnRateRad,
          goalTimeoutSec: sim.goalTimeoutSec,
        });
        robotHandle.current = createAtlasRobot(Cesium, viewer, spawn);
      } catch (err) {
        console.warn(err);
        onStatusRef.current("Robot unavailable");
      }

      const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      handlerRef.current = handler;

      handler.setInputAction((movement: { position: any }) => {
        const t = toolRef.current;

        if (t === "robot-waypoints") {
          // Keep camera on the layer the user is looking at — do NOT teleport the
          // robot onto a tileset before the pick (that jerked the view / re-triggered
          // translucent sort crashes). Place only where the click hits.
          pauseWalkChase(120_000);
          markUserCameraControl(viewer);

          // Need a rendered depth frame for reliable tileset picks
          viewer.scene.requestRenderMode = false;
          viewer.scene.requestRender();

          let hit: ReturnType<typeof pickSurfaceCartesian> = null;
          try {
            hit = pickSurfaceCartesian(Cesium, viewer, movement.position, {
              tileset: tilesetRef.current,
              exclude: robotHandle.current?.entities ?? [],
            });
          } catch (pickErr) {
            console.warn("Click-to-move pick failed", pickErr);
            reportTwinError({
              source: "Click-to-move",
              message: "Surface pick failed — try again",
              detail:
                pickErr instanceof Error ? pickErr.message : String(pickErr),
            });
            removeWeatherClouds(viewer);
            viewer.scene.requestRender();
            return;
          }
          if (!hit) {
            if (tilesetRef.current) {
              onStatusRef.current(
                "Click a visible point on the external tileset mesh"
              );
            } else {
              onStatusRef.current(
                "Click a surface (tileset or ground) to place"
              );
            }
            return;
          }
          const next = {
            ...robotPoseRef.current,
            lon: hit.lon,
            lat: hit.lat,
            height: hit.height,
          };
          robotPoseRef.current = next;
          robotHandle.current?.update(next);
          // Only now follow the robot — after a successful place on this layer
          viewer.camera.cancelFlight?.();
          pauseWalkChase(0);
          clearUserCameraControl();
          if (walkthroughRef.current === "walk") {
            applyWalkCamera(Cesium, viewer, next);
          } else {
            viewer.camera.setView({
              destination: Cesium.Cartesian3.fromDegrees(
                hit.lon,
                hit.lat,
                hit.height + 40,
                Cesium.Ellipsoid.WGS84
              ),
              orientation: {
                heading: next.heading,
                pitch: Cesium.Math.toRadians(-35),
                roll: 0,
              },
            });
          }
          onStatusRef.current(
            `Robot placed on layer · ${hit.lat.toFixed(5)}, ${hit.lon.toFixed(5)} · ${hit.height.toFixed(1)} m`
          );
          onMeasureRef.current({
            kind: "identify",
            label: "Robot on surface",
            value: `${hit.lat.toFixed(5)}, ${hit.lon.toFixed(5)}`,
            detail: `h ${hit.height.toFixed(1)} m — WASD to walk`,
          });
          viewer.scene.requestRender();
          return;
        }

        if (t === "clip-polygon" || t === "clip-hole") {
          const hit = pickSurfaceCartesian(Cesium, viewer, movement.position, {
            tileset: tilesetRef.current,
            exclude: robotHandle.current?.entities ?? [],
          });
          if (!hit) {
            onStatusRef.current("Click ground or tileset to add clip vertex");
            return;
          }
          const pt = { lon: hit.lon, lat: hit.lat, height: hit.height };
          if (t === "clip-polygon") {
            clipOuterRef.current = [...clipOuterRef.current, pt];
            clipHoleDraftRef.current = [];
          } else {
            clipHoleDraftRef.current = [...clipHoleDraftRef.current, pt];
          }
          clipPreviewRef.current = upsertClipPreview(
            Cesium,
            viewer,
            clipPreviewRef.current,
            clipOuterRef.current,
            [
              ...clipHolesRef.current,
              ...(clipHoleDraftRef.current.length
                ? [clipHoleDraftRef.current]
                : []),
            ]
          );
          onStatusRef.current(
            t === "clip-polygon"
              ? `Clip outer ring · ${clipOuterRef.current.length} pts — double-click to apply`
              : `Clip hole · ${clipHoleDraftRef.current.length} pts — double-click to close hole`
          );
          viewer.scene.requestRender();
          return;
        }

        if (t === "bim-snap") {
          void (async () => {
            const result = await snapAgainstBim(
              Cesium,
              viewer,
              ionSnapperRef.current,
              {
                windowPosition: {
                  x: movement.position.x,
                  y: movement.position.y,
                },
              }
            );
            if (result.ok && result.snapPoint) {
              const p = result.snapPoint;
              const ent = viewer.entities.add({
                position: Cesium.Cartesian3.fromDegrees(
                  p.lon,
                  p.lat,
                  p.height,
                  Cesium.Ellipsoid.WGS84
                ),
                point: {
                  pixelSize: 12,
                  color: Cesium.Color.fromCssColorString("#a78bfa"),
                  outlineColor: Cesium.Color.WHITE,
                  outlineWidth: 1,
                  disableDepthTestDistance: Number.POSITIVE_INFINITY,
                },
                label: {
                  text: result.geometryType
                    ? `Snap · ${result.geometryType}`
                    : "Snap",
                  font: "600 11px DM Sans, sans-serif",
                  fillColor: Cesium.Color.WHITE,
                  showBackground: true,
                  backgroundColor: Cesium.Color.fromCssColorString(
                    "#1e1b4b"
                  ).withAlpha(0.85),
                  pixelOffset: new Cesium.Cartesian2(0, -16),
                  disableDepthTestDistance: Number.POSITIVE_INFINITY,
                },
              });
              measureEntities.current.push(ent);
              onMeasureRef.current({
                kind: "identify",
                label: result.message,
                value: `${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}`,
                detail:
                  result.detail ??
                  `h ${p.height.toFixed(3)} m (WGS84 ellipsoidal)`,
              });
              onStatusRef.current(result.message);
            } else {
              onStatusRef.current(result.message);
              reportTwinError({
                source: "BIM snap",
                message: result.message,
                detail: result.detail,
              });
            }
            viewer.scene.requestRender();
          })();
          return;
        }

        const cartesian = pickGround(Cesium, viewer, movement.position);
        if (!cartesian) return;

        if (t === "place-pole") {
          const carto = Cesium.Cartographic.fromCartesian(cartesian);
          const pole: PlacedPole = {
            id: uid(),
            lon: Cesium.Math.toDegrees(carto.longitude),
            lat: Cesium.Math.toDegrees(carto.latitude),
            height: carto.height || 0,
            lightsOn: true,
          };
          onPolesChangeRef.current([...polesRef.current, pole]);
          onMeasureRef.current({
            kind: "poles",
            label: "Pole placed",
            value: `${polesRef.current.length + 1} poles`,
            detail: `${pole.lat.toFixed(5)}, ${pole.lon.toFixed(5)}`,
          });
          return;
        }

        if (t === "draw-poles") {
          drawLinePoints.current.push(cartesian);
          redrawDrawPreview(Cesium, viewer);
          onStatusRef.current(
            `Draw poles: ${drawLinePoints.current.length} vertex(es) — double-click to finish`
          );
          return;
        }

        if (t === "measure-distance") {
          measurePoints.current.push(cartesian);
          addMeasurePoint(Cesium, viewer, cartesian);
          if (measurePoints.current.length >= 2) {
            const a = measurePoints.current[measurePoints.current.length - 2];
            const b = measurePoints.current[measurePoints.current.length - 1];
            const dist = Cesium.Cartesian3.distance(a, b);
            trackMeasure(
              viewer.entities.add({
                polyline: {
                  positions: [a, b],
                  width: 3,
                  material: Cesium.Color.fromCssColorString("#2dd4bf"),
                },
              })
            );
            const units =
            platformSettingsRef.current?.gis.measureUnits ?? "metric";
          onMeasureRef.current({
              kind: "distance",
              label: "Distance",
              value: formatMeters(pathLength(measurePoints.current), units),
              detail: `Last segment ${formatMeters(dist, units)}`,
            });
          }
          return;
        }

        if (t === "measure-area") {
          measurePoints.current.push(cartesian);
          addMeasurePoint(Cesium, viewer, cartesian);
          if (measurePoints.current.length >= 3) {
            const positions = [
              ...measurePoints.current,
              measurePoints.current[0],
            ];
            for (const e of [...measureEntities.current]) {
              if (e.polygon) {
                viewer.entities.remove(e);
                measureEntities.current = measureEntities.current.filter(
                  (x) => x !== e
                );
              }
            }
            trackMeasure(
              viewer.entities.add({
                polygon: {
                  hierarchy: measurePoints.current,
                  material: Cesium.Color.fromCssColorString("#2dd4bf").withAlpha(
                    0.28
                  ),
                  outline: true,
                  outlineColor: Cesium.Color.fromCssColorString("#2dd4bf"),
                  perPositionHeight: true,
                },
                polyline: {
                  positions,
                  width: 2,
                  material: Cesium.Color.fromCssColorString("#2dd4bf"),
                },
              })
            );
            onMeasureRef.current({
              kind: "area",
              label: "Area",
              value: formatSquareMeters(
                polygonArea(Cesium, measurePoints.current),
                platformSettingsRef.current?.gis.measureUnits ?? "metric"
              ),
              detail: `${measurePoints.current.length} vertices`,
            });
          }
          return;
        }

        if (t === "height-profile") {
          measurePoints.current.push(cartesian);
          addMeasurePoint(Cesium, viewer, cartesian);
          const carto = Cesium.Cartographic.fromCartesian(cartesian);
          const heights = measurePoints.current.map(
            (p) => Cesium.Cartographic.fromCartesian(p).height
          );
          if (measurePoints.current.length >= 2) {
            const a = measurePoints.current[measurePoints.current.length - 2];
            const b = measurePoints.current[measurePoints.current.length - 1];
            trackMeasure(
              viewer.entities.add({
                polyline: {
                  positions: [a, b],
                  width: 3,
                  material: Cesium.Color.fromCssColorString("#38bdf8"),
                },
              })
            );
          }
          const units =
            platformSettingsRef.current?.gis.measureUnits ?? "metric";
          const min = Math.min(...heights);
          const max = Math.max(...heights);
          onMeasureRef.current({
            kind: "height",
            label: "Elevation profile",
            value: `${formatMeters(carto.height, units)} here`,
            detail: `Range ${formatMeters(min, units)} → ${formatMeters(max, units)} · Δ ${formatMeters(max - min, units)}`,
          });
          return;
        }

        if (t === "identify") {
          const picked = viewer.scene.pick(movement.position);
          if (Cesium.defined(picked) && picked.id) {
            const ent = picked.id;
            const name = ent.name || ent.id;
            const props = ent.properties;
            let detail = "";
            let guid: string | null = null;
            if (props) {
              const keys = props.propertyNames || [];
              const raw: Record<string, unknown> = {};
              detail = keys
                .map((k: string) => {
                  const v = props[k]?.getValue?.() ?? props[k];
                  raw[k] = v;
                  return `${k}: ${v}`;
                })
                .join(" · ");
              guid = resolveAssetGuid(raw) ?? resolveAssetGuid({ guid: raw.guid as string });
            }
            onMeasureRef.current({
              kind: "identify",
              label: "Identify",
              value: String(name),
              detail: detail || "Entity",
            });
            if (guid) onAssetSelectRef.current?.(guid);
            viewer.selectedEntity = ent;
          } else {
            onMeasureRef.current({
              kind: "identify",
              label: "Identify",
              value: "No feature",
              detail: "Click a building, sensor, utility, or pole",
            });
            onAssetSelectRef.current?.(null);
          }
          return;
        }

        if (t === "viewshed") {
          clearMeasureGraphics();
          const gis = platformSettingsRef.current?.gis ?? DEFAULT_GIS;
          const carto = Cesium.Cartographic.fromCartesian(cartesian);
          const origin = Cesium.Cartesian3.fromDegrees(
            Cesium.Math.toDegrees(carto.longitude),
            Cesium.Math.toDegrees(carto.latitude),
            (carto.height || 0) + gis.viewshedObserverHeightM
          );
          trackMeasure(
            viewer.entities.add({
              position: origin,
              point: {
                pixelSize: 12,
                color: Cesium.Color.fromCssColorString("#a78bfa"),
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 2,
              },
              label: {
                text: "Observer",
                font: "11px DM Sans, sans-serif",
                fillColor: Cesium.Color.WHITE,
                pixelOffset: new Cesium.Cartesian2(0, -16),
              },
            })
          );
          const radius = gis.viewshedRadiusM;
          const rays = gis.viewshedRays;
          let visible = 0;
          for (let i = 0; i < rays; i++) {
            const bearing = (i / rays) * Math.PI * 2;
            const destLon =
              Cesium.Math.toDegrees(carto.longitude) +
              (radius / 111320) * Math.cos(bearing);
            const destLat =
              Cesium.Math.toDegrees(carto.latitude) +
              (radius / 110540) * Math.sin(bearing);
            const dest = Cesium.Cartesian3.fromDegrees(
              destLon,
              destLat,
              (carto.height || 0) + 2
            );
            const direction = Cesium.Cartesian3.normalize(
              Cesium.Cartesian3.subtract(dest, origin, new Cesium.Cartesian3()),
              new Cesium.Cartesian3()
            );
            const ray = new Cesium.Ray(origin, direction);
            const hit = viewer.scene.pickFromRay
              ? viewer.scene.pickFromRay(ray)
              : undefined;
            const blocked = Cesium.defined(hit) && hit?.position;
            if (!blocked) visible++;
            const end = blocked && hit?.position ? hit.position : dest;
            trackMeasure(
              viewer.entities.add({
                polyline: {
                  positions: [origin, end],
                  width: 1.5,
                  material: blocked
                    ? Cesium.Color.fromCssColorString("#f43f5e").withAlpha(0.55)
                    : Cesium.Color.fromCssColorString("#34d399").withAlpha(0.7),
                },
              })
            );
          }
          onMeasureRef.current({
            kind: "viewshed",
            label: "Viewshed (lite)",
            value: `${Math.round((visible / rays) * 100)}% open`,
            detail: `${visible}/${rays} rays clear · ${radius} m radius`,
          });
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

      handler.setInputAction(() => {
        const t = toolRef.current;
        if (t === "clip-hole" && clipHoleDraftRef.current.length >= 3) {
          clipHolesRef.current = [
            ...clipHolesRef.current,
            clipHoleDraftRef.current,
          ];
          clipHoleDraftRef.current = [];
          clipPreviewRef.current = upsertClipPreview(
            Cesium,
            viewer,
            clipPreviewRef.current,
            clipOuterRef.current,
            clipHolesRef.current
          );
          onStatusRef.current(
            `Hole added · ${clipHolesRef.current.length} hole(s) — switch to Clip polygon & double-click to apply`
          );
          viewer.scene.requestRender();
          return;
        }
        if (t === "clip-polygon" && clipOuterRef.current.length >= 3) {
          // Finalize any open hole draft
          if (clipHoleDraftRef.current.length >= 3) {
            clipHolesRef.current = [
              ...clipHolesRef.current,
              clipHoleDraftRef.current,
            ];
            clipHoleDraftRef.current = [];
          }
          const clipOpts = {
            outer: clipOuterRef.current,
            holes: clipHolesRef.current,
            inverse: clipInverseRef.current,
            enabled: true,
          };
          // Separate collections per owner (tileset + globe + vector tileset)
          const primary = setClippingPolygons(
            Cesium,
            {
              tileset: tilesetRef.current,
              globe: viewer.scene.globe,
              scene: viewer.scene,
            },
            clipOpts
          );
          if (vectorTilesetRef.current) {
            setClippingPolygons(
              Cesium,
              {
                tileset: vectorTilesetRef.current,
                globe: null,
                scene: viewer.scene,
              },
              clipOpts
            );
          }
          if (!primary && !tilesetRef.current && !vectorTilesetRef.current) {
            onStatusRef.current(
              "Clipping needs a loaded tileset (or globe-only clip failed)"
            );
            reportTwinError({
              source: "Clipping",
              message: "Could not apply clipping polygon",
              detail: "Degenerate ring or no clip target",
            });
            return;
          }
          onStatusRef.current(
            `Clipping applied · ${clipOuterRef.current.length} outer / ${clipHolesRef.current.length} hole(s)${
              clipInverseRef.current ? " · inverse" : ""
            }`
          );
          onMeasureRef.current({
            kind: "identify",
            label: "Clipping polygon",
            value: `${clipOuterRef.current.length} pts`,
            detail: `${clipHolesRef.current.length} hole(s) · Cesium 1.145 ClippingPolygon`,
          });
          viewer.scene.requestRender();
          return;
        }

        if (
          toolRef.current === "draw-poles" &&
          drawLinePoints.current.length >= 2
        ) {
          const pts = drawLinePoints.current;
          const spacing =
            platformSettingsRef.current?.gis.poleSpacingM ??
            DEFAULT_GIS.poleSpacingM;
          const newPoles: PlacedPole[] = [];
          for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i];
            const b = pts[i + 1];
            const dist = Cesium.Cartesian3.distance(a, b);
            const steps = Math.max(1, Math.round(dist / spacing));
            for (let s = 0; s <= steps; s++) {
              const t = s / steps;
              const p = Cesium.Cartesian3.lerp(
                a,
                b,
                t,
                new Cesium.Cartesian3()
              );
              const c = Cesium.Cartographic.fromCartesian(p);
              newPoles.push({
                id: uid(),
                lon: Cesium.Math.toDegrees(c.longitude),
                lat: Cesium.Math.toDegrees(c.latitude),
                height: c.height || 0,
                lightsOn: true,
              });
            }
          }
          const merged = [...polesRef.current];
          for (const np of newPoles) {
            const dup = merged.some(
              (p) =>
                Math.abs(p.lon - np.lon) < 1e-5 &&
                Math.abs(p.lat - np.lat) < 1e-5
            );
            if (!dup) merged.push(np);
          }
          onPolesChangeRef.current(merged);
          onMeasureRef.current({
            kind: "poles",
            label: "Poles along line",
            value: `${merged.length} total`,
            detail: `Added along ${pts.length} vertices`,
          });
          clearMeasureGraphics();
          drawLinePoints.current = [];
        }
      }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

      readyRef.current = true;
      if (!destroyed) setSceneReadyTick((n) => n + 1);
      try {
        detachCameraControlsRef.current = attachCameraControls(viewer, Cesium);
      } catch (err) {
        console.warn("Camera controls attach failed", err);
      }
      try {
        detachKeyboardWalkRef.current = attachKeyboardWalk(
          viewer,
          Cesium,
          () => walkthroughRef.current,
          {
            getPose: () => robotPoseRef.current,
            setPose: (pose) => {
              robotPoseRef.current = pose;
              robotHandle.current?.update(pose);
              viewer.scene.requestRender();
            },
          },
          () => onWalkActiveRef.current?.(),
          {
            getSurfaceMode: () =>
              tilesetRef.current ? "tileset" : "campus",
            getTileset: () => tilesetRef.current,
            getExcludeObjects: () => robotHandle.current?.entities ?? [],
            // Keep left-click free for place; don't orbit-drag during place
            getAllowOrbitDrag: () => toolRef.current !== "robot-waypoints",
            // Never chase-snap to robot while placing — stay on the layer in view
            getHoldCamera: () => toolRef.current === "robot-waypoints",
          }
        );
      } catch (err) {
        console.warn("Keyboard walk attach failed", err);
      }
      stopFlickerRef.current = startPoleLightFlickerLoop(
        viewer,
        () => poleLightsRef.current && timeOfDayRef.current === "night"
      );
      onStatusRef.current("Twin ready");
      viewer.scene.requestRender();
    }

    boot().catch((err) => {
      console.error(err);
      const msg = err instanceof Error ? err.message : String(err);
      onStatusRef.current(`Viewer error: ${msg}`);
      reportTwinError({
        source: "Viewer",
        message: "Cesium viewer failed to start",
        detail: msg,
      });
    });

    return () => {
      destroyed = true;
      detachKeyboardWalkRef.current?.();
      detachKeyboardWalkRef.current = null;
      detachCameraControlsRef.current?.();
      detachCameraControlsRef.current = null;
      if (animFrame.current) cancelAnimationFrame(animFrame.current);
      stopFlickerRef.current?.();
      stopFlickerRef.current = null;
      robotHandle.current?.destroy();
      robotHandle.current = null;
      handlerRef.current?.destroy();
      viewerRef.current?.destroy();
      viewerRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!Cesium || !viewer) return;
    applyWeatherToScene(Cesium, viewer, weather ?? null, timeOfDay);
    // Wind particles disabled — don't force continuous render for weather alone
    windActiveRef.current = false;
    if (robotPlayingRef.current) {
      viewer.scene.requestRenderMode = false;
    }
    rebuildPoles();
  }, [timeOfDay, weather, rebuildPoles]);

  useEffect(() => {
    rebuildPoles();
  }, [poles, poleLightsOn, rebuildPoles]);

  useEffect(() => {
    const onZoomLayer = (e: Event) => {
      const Cesium = cesiumRef.current;
      const viewer = viewerRef.current;
      if (!Cesium || !viewer || !readyRef.current) {
        reportTwinError({
          source: "Zoom",
          message: "Viewer not ready — wait for the twin to finish loading",
        });
        return;
      }
      const detail = (e as CustomEvent<ZoomLayerTarget>).detail;
      if (!detail?.configId) return;
      // Leave chase cam so zoom-to sticks (esp. external tilesets)
      pauseWalkChase(20_000);
      markUserCameraControl(viewer);

      const runZoom = async (attempt: number): Promise<void> => {
        // External tileset may still be loading after Focus kicked off a Sample URL
        if (
          detail.builtInKey === "tileset" &&
          !tilesetRef.current &&
          attempt < 25
        ) {
          await new Promise((r) => setTimeout(r, 200));
          return runZoom(attempt + 1);
        }

        const result = await zoomCameraToLayer(Cesium, viewer, detail, {
          layerEntities: layerEntities.current,
          customLayerEntities: customLayerEntities.current,
          tileset: tilesetRef.current,
          poles: poleLightCaches.current.poles,
          robotRoot: robotHandle.current?.root ?? null,
        });

        if (result.ok) {
          onStatusRef.current(
            detail.builtInKey === "tileset"
              ? "Zoomed into external tileset"
              : "Zoomed to layer"
          );
        } else {
          const reason =
            result.reason ?? "No geometry to zoom for that layer";
          onStatusRef.current(reason);
          reportTwinError({
            source:
              detail.builtInKey === "tileset"
                ? "External layer zoom"
                : "Layer zoom",
            message: reason,
            detail: detail.builtInKey
              ? `layer=${detail.builtInKey}`
              : `key=${detail.key}`,
          });
        }
        viewer.scene.requestRender();
      };

      void runZoom(0);
    };
    window.addEventListener("twin-zoom-layer", onZoomLayer);
    return () => window.removeEventListener("twin-zoom-layer", onZoomLayer);
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium || !readyRef.current) return;

    let needsRender = false;

    for (const layer of layers) {
      const prev = layerRenderStateRef.current.get(layer.configId);
      const next = toLayerRenderState(layer);
      const delta = layerRenderStateChanged(prev, next);
      layerRenderStateRef.current.set(layer.configId, next);

      const bucket = layer.builtInKey ?? layer.key;
      const ents =
        layerEntities.current[bucket] ??
        customLayerEntities.current.get(layer.configId);

      if (ents && (delta.visibility || delta.opacity)) {
        if (delta.visibility) {
          for (const e of ents) e.show = layer.visible;
        }
        if (delta.opacity && layer.visible) {
          applyLayerOpacity(Cesium, ents, layer.opacity);
        }
        needsRender = true;
      }

      if (layer.builtInKey === "tileset" && tilesetRef.current && delta.visibility) {
        tilesetRef.current.show = layer.visible;
        needsRender = true;
      }
      if (layer.builtInKey === "robot-path" && delta.visibility) {
        robotHandle.current?.setShow(layer.visible);
        needsRender = true;
      }
      if (layer.builtInKey === "poles" && delta.visibility) {
        const caches = poleLightCaches.current;
        for (const id of caches.poles.keys()) {
          const poleOn =
            polesRef.current.find((p) => p.id === id)?.lightsOn !== false &&
            poleLightsRef.current;
          const shaft = caches.poles.get(id);
          const lamp = caches.lamps.get(id);
          const pool = caches.pools.get(id);
          const hot = caches.hotspots.get(id);
          const cone = caches.cones.get(id);
          if (shaft) shaft.show = layer.visible;
          if (lamp) lamp.show = layer.visible;
          if (pool) pool.show = layer.visible && poleOn;
          if (hot) hot.show = layer.visible && poleOn;
          if (cone) cone.show = layer.visible && poleOn;
        }
        needsRender = true;
      }
      if (layer.builtInKey === "alerts" && delta.visibility) {
        for (const e of alertEntities.current) e.show = layer.visible;
        needsRender = true;
      }
    }

    if (needsRender) viewer.scene.requestRender();
  }, [layers, poles, poleLightsOn]);

  useEffect(() => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!Cesium || !viewer || !readyRef.current) return;

    let cancelled = false;
    let needsRender = false;

    async function syncCustom() {
      for (const layer of layers) {
        if (layer.builtInKey) continue;
        if (!layer.dataSource || !layer.dataSource.endsWith(".geojson")) continue;

        const prev = layerRenderStateRef.current.get(layer.configId);
        const next = toLayerRenderState(layer);
        const delta = layerRenderStateChanged(prev, next);

        const existing = customLayerEntities.current.get(layer.configId) ?? [];

        if (delta.reload || (existing.length === 0 && layer.enabled)) {
          for (const e of existing) viewer.entities.remove(e);
          customLayerEntities.current.set(layer.configId, []);
          if (!layer.enabled) {
            customLayersLoadedRef.current.delete(layer.configId);
            continue;
          }
          try {
            const ents = await loadCustomGeoJsonLayer(
              Cesium,
              viewer,
              layer.dataSource,
              layer.style,
              layer.opacity
            );
            if (cancelled) return;
            for (const e of ents) e.show = layer.visible;
            customLayerEntities.current.set(layer.configId, ents);
            customLayersLoadedRef.current.add(layer.configId);
            needsRender = true;
          } catch (err) {
            console.warn("Custom layer load failed", layer.configId, err);
            reportTwinError({
              source: "Custom layer",
              message: `Failed to load layer “${layer.label ?? layer.configId}”`,
              detail: err instanceof Error ? err.message : String(err),
            });
          }
        } else if (!layer.enabled) {
          for (const e of existing) viewer.entities.remove(e);
          customLayerEntities.current.set(layer.configId, []);
          customLayersLoadedRef.current.delete(layer.configId);
          needsRender = true;
        } else if (existing.length > 0 && (delta.visibility || delta.opacity)) {
          if (delta.visibility) {
            for (const e of existing) e.show = layer.visible;
          }
          if (delta.opacity && layer.visible) {
            applyLayerOpacity(Cesium, existing, layer.opacity);
          }
          needsRender = true;
        }
      }
      if (needsRender) viewer.scene.requestRender();
    }
    syncCustom();
    return () => {
      cancelled = true;
    };
  }, [layers]);

  useEffect(() => {
    onStatusRef.current(
      tool === "place-pole"
        ? "Click the scene to place an electric pole"
        : tool === "draw-poles"
          ? "Click to draw a line, double-click to place poles along it"
          : tool === "navigate"
            ? "Navigate · drag to pan, scroll to zoom, right-drag to tilt"
            : `Tool: ${tool}`
    );
  }, [tool]);

  useEffect(() => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!Cesium || !viewer) return;
    let cancelled = false;

    async function loadTiles() {
      if (tilesetRef.current) {
        viewer.scene.primitives.remove(tilesetRef.current);
        tilesetRef.current = null;
      }
      try {
        if (tilesetUrl.trim()) {
          const url = tilesetUrl.trim();
          const isSample =
            url.includes("pelican-public") ||
            url.includes("agi-hq") ||
            url.includes("sandcastle");
          onStatusRef.current(
            isSample ? "Loading sample 3D Tiles (AGI HQ)…" : "Loading 3D Tiles…"
          );
          const tileset = await Cesium.Cesium3DTileset.fromUrl(url);
          if (cancelled) return;
          // Prefer finer LOD so external mesh is visible after zoom
          if ("maximumScreenSpaceError" in tileset) {
            tileset.maximumScreenSpaceError = 8;
          }
          viewer.scene.primitives.add(tileset);
          tilesetRef.current = tileset;
          attachTilesetErrorHandlers(tileset, (message, detail) => {
            reportTwinError({ source: "3D Tiles", message, detail });
          });
          applyCesium3DTileStyle(Cesium, tileset, tilesetStylePreset);
          pauseWalkChase(20_000);
          markUserCameraControl(viewer);

          const zoomResult = await zoomCameraToLayer(
            Cesium,
            viewer,
            {
              configId: "tileset",
              key: "tileset",
              builtInKey: "tileset",
            },
            {
              layerEntities: layerEntities.current,
              customLayerEntities: customLayerEntities.current,
              tileset,
              poles: poleLightCaches.current.poles,
              robotRoot: null,
            }
          );

          if (cancelled) return;

          // Place robot on tileset center (WGS84 ellipsoidal height)
          try {
            const bs = tileset.boundingSphere;
            if (bs?.center) {
              const c = Cesium.Cartographic.fromCartesian(
                bs.center,
                Cesium.Ellipsoid.WGS84
              );
              if (c) {
                const lon = Cesium.Math.toDegrees(c.longitude);
                const lat = Cesium.Math.toDegrees(c.latitude);
                const band = tilesetHeightBand(Cesium, tileset);
                const seedH = band?.mid ?? c.height ?? 0;
                const height = sampleSurfaceHeightEnu(
                  Cesium,
                  viewer,
                  lon,
                  lat,
                  seedH,
                  {
                    exclude: robotHandle.current?.entities ?? [],
                    tileset,
                    maxClimbM: 40,
                    maxDropM: 40,
                  }
                );
                const next = {
                  ...robotPoseRef.current,
                  lon,
                  lat,
                  height,
                };
                robotPoseRef.current = next;
                robotHandle.current?.update(next);
              }
            }
          } catch (placeErr) {
            console.warn("Place robot on tileset failed", placeErr);
          }

          if (zoomResult.ok) {
            onStatusRef.current(
              isSample
                ? "Sample tileset loaded — zoomed to AGI HQ (WGS84)"
                : "3D Tiles loaded — zoomed in (WGS84)"
            );
          } else {
            onStatusRef.current(
              isSample
                ? "Sample tileset loaded (zoom pending)"
                : "3D Tiles loaded (zoom pending)"
            );
            reportTwinError({
              source: "Tileset zoom",
              message:
                zoomResult.reason ??
                "Tileset loaded but camera could not zoom in",
              detail: url,
            });
          }
          notifyTilesetReady(url);
        } else if (config.cesiumIonAssetId && config.cesiumIonToken) {
          onStatusRef.current("Loading ion asset…");
          const tileset = await Cesium.Cesium3DTileset.fromIonAssetId(
            Number(config.cesiumIonAssetId)
          );
          if (cancelled) return;
          viewer.scene.primitives.add(tileset);
          tilesetRef.current = tileset;
          attachTilesetErrorHandlers(tileset, (message, detail) => {
            reportTwinError({ source: "Ion 3D Tiles", message, detail });
          });
          pauseWalkChase(12_000);
          markUserCameraControl(viewer);
          const zoomResult = await zoomCameraToLayer(
            Cesium,
            viewer,
            {
              configId: "tileset",
              key: "tileset",
              builtInKey: "tileset",
            },
            {
              layerEntities: layerEntities.current,
              customLayerEntities: customLayerEntities.current,
              tileset,
              poles: poleLightCaches.current.poles,
              robotRoot: null,
            }
          );
          if (!zoomResult.ok) {
            reportTwinError({
              source: "Ion tileset zoom",
              message:
                zoomResult.reason ??
                `Ion asset ${config.cesiumIonAssetId} loaded but zoom failed`,
            });
          }
          onStatusRef.current(`Ion asset ${config.cesiumIonAssetId} loaded`);
          notifyTilesetReady(`ion:${config.cesiumIonAssetId}`);
        } else if (config.cesiumIonAssetId && !config.cesiumIonToken) {
          const msg =
            "Ion asset configured but CESIUM_ION_TOKEN is missing — set the token or use Sample/Campus";
          onStatusRef.current(msg);
          reportTwinError({
            source: "Ion tileset",
            message: msg,
            detail: `assetId=${config.cesiumIonAssetId}`,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        onStatusRef.current(`Tileset error: ${msg}`);
        reportTwinError({
          source: "Tileset load",
          message: "Failed to load external 3D Tiles layer",
          detail: msg,
        });
      }
    }
    loadTiles();
    return () => {
      cancelled = true;
    };
  }, [
    tilesetUrl,
    config.defaultTilesetUrl,
    config.cesiumIonAssetId,
    config.cesiumIonToken,
  ]);

  // Cesium 1.145 — vector / secondary 3D Tileset (do not reload on style change)
  useEffect(() => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!Cesium || !viewer || !readyRef.current) return;
    let cancelled = false;

    async function loadVector() {
      if (vectorTilesetRef.current) {
        try {
          clearClippingPolygons({
            tileset: vectorTilesetRef.current,
            globe: null,
          });
          viewer.scene.primitives.remove(vectorTilesetRef.current);
        } catch {
          /* ignore */
        }
        vectorTilesetRef.current = null;
      }
      const url = vectorTilesUrl.trim();
      if (!url) return;
      try {
        onStatusRef.current("Loading vector / secondary 3D Tiles…");
        const tileset = await loadVectorOrMeshTileset(Cesium, viewer, url, {
          stylePreset: tilesetStylePreset,
          maximumScreenSpaceError: 12,
        });
        if (cancelled) {
          viewer.scene.primitives.remove(tileset);
          return;
        }
        attachTilesetErrorHandlers(tileset, (message, detail) => {
          reportTwinError({ source: "Vector 3D Tiles", message, detail });
        });
        // Guard: tileset must expose a usable root BV before we keep it
        const bs = tileset.boundingSphere;
        if (!bs || !(bs.radius > 0)) {
          viewer.scene.primitives.remove(tileset);
          reportTwinError({
            source: "Vector 3D Tiles",
            message: "Tileset has no bounding volume — not added to scene",
            detail: url,
          });
          return;
        }
        vectorTilesetRef.current = tileset;
        pauseWalkChase(12_000);
        markUserCameraControl(viewer);
        try {
          await viewer.zoomTo(tileset);
        } catch {
          /* ignore */
        }
        onStatusRef.current("Vector / secondary 3D Tiles loaded");
        notifyTilesetReady(url);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        onStatusRef.current(`Vector tileset error: ${msg}`);
        reportTwinError({
          source: "Vector 3D Tiles",
          message: "Failed to load vector/secondary tileset",
          detail: msg,
        });
      }
    }
    void loadVector();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- style applied in separate effect
  }, [vectorTilesUrl, sceneReadyTick]);

  // Cesium 1.145 — drape roads/utilities/custom GeoJSON on terrain & 3D Tiles
  useEffect(() => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!Cesium || !viewer || !readyRef.current) return;
    const bags = [
      layerEntities.current.roads,
      layerEntities.current.utilities,
      ...Array.from(customLayerEntities.current.values()),
    ];
    for (const ents of bags) {
      if (ents?.length) applyDrapeToEntities(Cesium, ents, drapeMode);
    }
    viewer.scene.requestRender();
  }, [drapeMode, sceneReadyTick, layers, tilesetUrl]);

  // Style presets for mesh + vector tilesets
  useEffect(() => {
    const Cesium = cesiumRef.current;
    if (!Cesium || !readyRef.current) return;
    try {
      if (tilesetRef.current) {
        applyCesium3DTileStyle(Cesium, tilesetRef.current, tilesetStylePreset);
      }
      if (vectorTilesetRef.current) {
        applyCesium3DTileStyle(
          Cesium,
          vectorTilesetRef.current,
          tilesetStylePreset
        );
      }
    } catch (err) {
      reportTwinError({
        source: "3D Tiles style",
        message: "Failed to apply Cesium3DTileStyle",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
    viewerRef.current?.scene.requestRender();
  }, [tilesetStylePreset, tilesetUrl, vectorTilesUrl, sceneReadyTick]);

  // IonSnapService when ion token + asset configured
  useEffect(() => {
    let cancelled = false;
    async function initSnap() {
      ionSnapperRef.current = null;
      const Cesium = cesiumRef.current;
      if (!Cesium || !readyRef.current) return;
      const token = config.cesiumIonToken;
      const assetId = Number(config.cesiumIonAssetId);
      if (!token || !Number.isFinite(assetId) || assetId <= 0) return;
      const snapper = await createIonSnapper(Cesium, assetId, token);
      if (!cancelled) ionSnapperRef.current = snapper;
    }
    void initSnap();
    return () => {
      cancelled = true;
    };
  }, [config.cesiumIonToken, config.cesiumIonAssetId, sceneReadyTick]);

  // Clear clipping
  useEffect(() => {
    const clear = () => {
      const Cesium = cesiumRef.current;
      const viewer = viewerRef.current;
      clearClippingPolygons({
        tileset: tilesetRef.current ?? vectorTilesetRef.current,
        globe: viewer?.scene?.globe,
      });
      if (tilesetRef.current && vectorTilesetRef.current) {
        clearClippingPolygons({
          tileset: vectorTilesetRef.current,
          globe: null,
        });
      }
      clipOuterRef.current = [];
      clipHolesRef.current = [];
      clipHoleDraftRef.current = [];
      if (clipPreviewRef.current && viewer) {
        viewer.entities.remove(clipPreviewRef.current);
        clipPreviewRef.current = null;
      }
      onStatusRef.current("Clipping cleared");
      viewer?.scene.requestRender();
    };
    window.addEventListener("twin-clear-clip", clear);
    return () => window.removeEventListener("twin-clear-clip", clear);
  }, []);

  const syncRobotPose = useCallback((followCamera: boolean) => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    const handle = robotHandle.current;
    if (!Cesium || !viewer || !handle) return;
    const pose = robotPoseRef.current;
    handle.update(pose);
    const pos = poseToCartesian(Cesium, pose);
    if (
      followCamera &&
      !isUserControllingCamera() &&
      walkthroughRef.current !== "off" &&
      walkthroughRef.current !== "walk"
    ) {
      updateWalkthroughCamera(
        Cesium,
        viewer,
        walkthroughRef.current,
        pos,
        pose.heading
      );
    }
    viewer.scene.requestRender();
  }, []);

  /** If an external tileset is loaded and the robot is still on campus, move it onto the mesh. */
  const ensureRobotOnActiveTileset = useCallback(
    (opts?: { snapCamera?: boolean }): boolean => {
      const Cesium = cesiumRef.current;
      const viewer = viewerRef.current;
      const tileset = tilesetRef.current;
      if (!Cesium || !viewer || !tileset) return false;
      const current = robotPoseRef.current;
      if (isPoseOnTileset(Cesium, tileset, current)) return false;

      const placed = poseAtTilesetCenter(Cesium, viewer, tileset, {
        exclude: robotHandle.current?.entities ?? [],
        heading: current.heading,
      });
      if (!placed) return false;

      robotPoseRef.current = placed;
      robotHandle.current?.update(placed);
      if (opts?.snapCamera !== false) {
        pauseWalkChase(0);
        clearUserCameraControl();
        if (walkthroughRef.current === "walk") {
          applyWalkCamera(Cesium, viewer, placed);
        } else {
          viewer.camera.setView({
            destination: Cesium.Cartesian3.fromDegrees(
              placed.lon,
              placed.lat,
              placed.height + 35,
              Cesium.Ellipsoid.WGS84
            ),
            orientation: {
              heading: placed.heading,
              pitch: Cesium.Math.toRadians(-32),
              roll: 0,
            },
          });
        }
      }
      onStatusRef.current(
        `Robot on external tileset · ${placed.lat.toFixed(5)}, ${placed.lon.toFixed(5)}`
      );
      viewer.scene.requestRender();
      return true;
    },
    []
  );
  ensureRobotOnActiveTilesetRef.current = ensureRobotOnActiveTileset;

  useEffect(() => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!Cesium || !viewer || !robotHandle.current) return;

    if (animFrame.current) {
      cancelAnimationFrame(animFrame.current);
      animFrame.current = null;
    }

    if (!robot.playing) {
      if (!windActiveRef.current) {
        viewer.scene.requestRenderMode = true;
      }
      syncRobotPose(true);
      return;
    }

    // Continuous renders while robot moves so motion stays smooth
    viewer.scene.requestRenderMode = false;
    clearUserCameraControl();
    let last = performance.now();
    let lastEmit = 0;
    let traveled = 0;

    const tick = (now: number) => {
      if (!robotPlayingRef.current) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const speedMps =
        (platformSettingsRef.current?.simulation.baseSpeedMps ??
          DEFAULT_SIMULATION.baseSpeedMps) * robotSpeedRef.current;
      robotPoseRef.current = wanderRef.current.step(
        robotPoseRef.current,
        dt,
        speedMps
      );
      traveled += speedMps * dt;
      syncRobotPose(true);
      if (now - lastEmit > 100) {
        lastEmit = now;
        onRobotProgressRef.current((traveled % 400) / 400);
      }
      animFrame.current = requestAnimationFrame(tick);
    };
    animFrame.current = requestAnimationFrame(tick);

    return () => {
      if (animFrame.current) cancelAnimationFrame(animFrame.current);
      animFrame.current = null;
      if (
        viewerRef.current &&
        !windActiveRef.current &&
        !robotPlayingRef.current
      ) {
        viewerRef.current.scene.requestRenderMode = true;
      }
    };
  }, [robot.playing, sceneReadyTick, syncRobotPose]);

  // Explicit Reset only — do NOT snap to campus whenever progress happens to be 0
  useEffect(() => {
    if (!readyRef.current) return;
    if (robotResetToken <= 0) return;
    if (robotResetToken === lastResetHandledRef.current) return;
    lastResetHandledRef.current = robotResetToken;

    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!Cesium || !viewer) return;

    const sim = platformSettingsRef.current?.simulation ?? DEFAULT_SIMULATION;
    wanderRef.current = createWanderController({
      seed: 7,
      bounds: sim.bounds,
      turnRateRad: sim.turnRateRad,
      goalTimeoutSec: sim.goalTimeoutSec,
    });
    wanderRef.current.reset();

    // Prefer resetting onto the active external tileset, not campus
    if (tilesetRef.current) {
      const placed = poseAtTilesetCenter(Cesium, viewer, tilesetRef.current, {
        exclude: robotHandle.current?.entities ?? [],
        heading: (sim.spawn.headingDeg * Math.PI) / 180,
      });
      if (placed) {
        robotPoseRef.current = placed;
        robotHandle.current?.update(placed);
        pauseWalkChase(0);
        clearUserCameraControl();
        if (walkthroughRef.current === "walk") {
          applyWalkCamera(Cesium, viewer, placed);
        }
        onStatusRef.current("Reset — robot on external tileset");
        viewer.scene.requestRender();
        return;
      }
    }

    robotPoseRef.current = { ...spawnFromSettings(sim.spawn) };
    syncRobotPose(false);
    syncRobotPose(true);
    onStatusRef.current("Reset — robot on campus spawn");
  }, [robotResetToken, syncRobotPose]);

  useEffect(() => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!Cesium || !viewer || !readyRef.current) return;

    if (walkthroughMode === "walk") {
      const placing = tool === "robot-waypoints";

      if (placing) {
        // Hold the current view (new layer) so the user can click a point.
        // Do NOT move the robot or chase-cam — that leaves the tileset.
        pauseWalkChase(120_000);
        markUserCameraControl(viewer);
        viewer.camera.cancelFlight?.();
        viewer.scene.requestRenderMode = false;
        viewer.scene.requestRender();
        onStatusRef.current(
          tilesetRef.current
            ? "Click a point on the external tileset to place ATLAS-01"
            : "Click a point on the map to place ATLAS-01"
        );
        return;
      }

      // Quietly move robot onto tileset when starting normal Walk (not place)
      ensureRobotOnActiveTileset({ snapCamera: false });

      clearUserCameraControl();
      viewer.camera.cancelFlight?.();
      enterWalkCamera(Cesium, viewer, robotPoseRef.current);
      viewer.scene.requestRenderMode = false;
      const canvas = viewer.scene.canvas as HTMLCanvasElement | undefined;
      try {
        canvas?.focus?.({ preventScroll: true });
      } catch {
        canvas?.focus?.();
      }
      onStatusRef.current(
        tilesetRef.current
          ? "Walk — WASD on external tileset · drag orbit · wheel zoom"
          : "Walk — WASD drive robot · drag orbit · wheel zoom"
      );
      return;
    }

    if (walkthroughMode === "first" || walkthroughMode === "third") {
      clearUserCameraControl();
      syncRobotPose(true);
      onStatusRef.current(
        walkthroughMode === "first"
          ? "1st person — following ATLAS-01"
          : "3rd person — chase camera on ATLAS-01"
      );
    }
  }, [
    walkthroughMode,
    tool,
    sceneReadyTick,
    syncRobotPose,
    ensureRobotOnActiveTileset,
  ]);

  // Click-to-move: freeze camera on the layer you're looking at
  useEffect(() => {
    if (!readyRef.current) return;
    const viewer = viewerRef.current;
    if (!viewer) return;

    if (tool !== "robot-waypoints") {
      // Leaving place mode — resume chase if still walking
      if (walkthroughRef.current === "walk") {
        pauseWalkChase(0);
        const Cesium = cesiumRef.current;
        if (Cesium) {
          enterWalkCamera(Cesium, viewer, robotPoseRef.current);
        }
      }
      return;
    }

    // Stay on the layer in view — don't teleport robot onto a tileset yet
    pauseWalkChase(120_000);
    markUserCameraControl(viewer);
    removeWeatherClouds(viewer);
    viewer.scene.requestRenderMode = false;
    viewer.scene.requestRender();
    onStatusRef.current(
      tilesetRef.current
        ? "Click a point on the external tileset to place ATLAS-01"
        : "Click a point on the map to place ATLAS-01"
    );
  }, [tool, sceneReadyTick]);

  useEffect(() => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!Cesium || !viewer || !readyRef.current) return;
    applyBuildingSymbology(
      Cesium,
      layerEntities.current.buildings ?? [],
      symbology
    );
    applySensorSymbology(
      Cesium,
      layerEntities.current.sensors ?? [],
      symbology
    );
    viewer.scene.requestRender();
  }, [symbology]);

  useEffect(() => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!Cesium || !viewer || !readyRef.current) return;
    const alertsLayer = layersRef.current.find((l) => l.builtInKey === "alerts");
    const showAlerts = alertsLayer ? alertsLayer.visible : true;
    for (const e of alertEntities.current) viewer.entities.remove(e);
    alertEntities.current = [];
    if (showAlerts) {
      for (const a of alerts.filter((x) => x.spatial && x.lon != null)) {
        alertEntities.current.push(
          viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(a.lon!, a.lat!, (a.height ?? 0) + 8),
            ellipsoid: {
              radii: new Cesium.Cartesian3(5, 5, 5),
              material: Cesium.Color.fromCssColorString(
                a.severity === "critical" ? "#e57373" : "#e2b15a"
              ).withAlpha(0.28),
              outline: true,
              outlineColor: Cesium.Color.fromCssColorString(
                a.severity === "critical" ? "#e57373" : "#e2b15a"
              ).withAlpha(0.7),
            },
            label: {
              text: a.severity === "critical" ? "ALERT" : "WARN",
              font: "600 10px DM Sans, sans-serif",
              fillColor: Cesium.Color.WHITE,
              showBackground: true,
              backgroundColor: Cesium.Color.fromCssColorString("#0f172a").withAlpha(
                0.75
              ),
              backgroundPadding: new Cesium.Cartesian2(6, 3),
              pixelOffset: new Cesium.Cartesian2(0, -18),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          })
        );
      }
    }
    viewer.scene.requestRender();
  }, [alerts]);

  useEffect(() => {
    const clear = () => clearMeasureGraphics();
    window.addEventListener("twin-clear-measure", clear);
    return () => window.removeEventListener("twin-clear-measure", clear);
  }, [clearMeasureGraphics]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-0 h-full w-full [&_canvas]:outline-none"
    />
  );
}


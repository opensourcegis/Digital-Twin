"use client";

import { useEffect, useRef, useCallback } from "react";
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
} from "@/lib/twin/keyboard-walk";
import {
  attachCameraControls,
  clearUserCameraControl,
  isUserControllingCamera,
} from "@/lib/twin/camera-controls";
import {
  layerRenderStateChanged,
  toLayerRenderState,
  type LayerRenderState,
} from "@/lib/twin/layer-viewer-state";
import {
  createAtlasRobot,
  pathHeadingRad,
  type AtlasRobotHandle,
} from "@/lib/twin/robot-model";
import type { Alert, WalkthroughMode } from "@/lib/twin/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type CesiumNS = any;

interface ViewerProps {
  config: TwinConfig;
  tool: ActiveTool;
  layers: ViewerLayer[];
  timeOfDay: TimeOfDay;
  poles: PlacedPole[];
  poleLightsOn: boolean;
  robot: RobotState;
  tilesetUrl: string;
  symbology?: Record<string, { color: string; pulse: boolean }>;
  walkthroughMode?: WalkthroughMode;
  alerts?: Alert[];
  onMeasure: (result: MeasureResult | null) => void;
  onPolesChange: (poles: PlacedPole[]) => void;
  onRobotProgress: (progress: number) => void;
  onStatus: (status: string) => void;
  onAssetSelect?: (guid: string | null) => void;
  onWalkActive?: () => void;
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
  poles,
  poleLightsOn,
  robot,
  tilesetUrl,
  symbology = {},
  walkthroughMode = "off",
  alerts = [],
  onMeasure,
  onPolesChange,
  onRobotProgress,
  onStatus,
  onAssetSelect,
  onWalkActive,
}: ViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cesiumRef = useRef<CesiumNS | null>(null);
  const viewerRef = useRef<any>(null);
  const layerEntities = useRef<Record<string, any[]>>({});
  const tilesetRef = useRef<any>(null);
  const measureEntities = useRef<any[]>([]);
  const measurePoints = useRef<any[]>([]);
  const drawLinePoints = useRef<any[]>([]);
  const drawPreview = useRef<any>(null);
  const poleEntities = useRef<Map<string, any>>(new Map());
  const lightHalos = useRef<Map<string, any>>(new Map());
  const robotHandle = useRef<AtlasRobotHandle | null>(null);
  const robotPath = useRef<{ lon: number; lat: number; height: number }[]>([]);
  const handlerRef = useRef<any>(null);
  const animFrame = useRef<number | null>(null);
  const polesRef = useRef(poles);
  const toolRef = useRef(tool);
  const poleLightsRef = useRef(poleLightsOn);
  const onPolesChangeRef = useRef(onPolesChange);
  const onMeasureRef = useRef(onMeasure);
  const onStatusRef = useRef(onStatus);
  const onAssetSelectRef = useRef(onAssetSelect);
  const onWalkActiveRef = useRef(onWalkActive);
  const onRobotProgressRef = useRef(onRobotProgress);
  const walkthroughRef = useRef(walkthroughMode);
  const robotPlayingRef = useRef(robot.playing);
  const robotSpeedRef = useRef(robot.speed);
  const robotProgressRef = useRef(robot.progress);
  const symbologyRef = useRef(symbology);
  const alertEntities = useRef<any[]>([]);
  const customLayerEntities = useRef<Map<string, any[]>>(new Map());
  const layersRef = useRef(layers);
  const readyRef = useRef(false);
  const detachKeyboardWalkRef = useRef<(() => void) | null>(null);
  const detachCameraControlsRef = useRef<(() => void) | null>(null);
  const layerRenderStateRef = useRef<Map<string, LayerRenderState>>(new Map());
  const customLayersLoadedRef = useRef<Set<string>>(new Set());

  polesRef.current = poles;
  toolRef.current = tool;
  poleLightsRef.current = poleLightsOn;
  onPolesChangeRef.current = onPolesChange;
  onMeasureRef.current = onMeasure;
  onStatusRef.current = onStatus;
  onAssetSelectRef.current = onAssetSelect;
  onWalkActiveRef.current = onWalkActive;
  onRobotProgressRef.current = onRobotProgress;
  walkthroughRef.current = walkthroughMode;
  robotPlayingRef.current = robot.playing;
  robotSpeedRef.current = robot.speed;
  robotProgressRef.current = robot.progress;
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

  const applyTimeOfDay = useCallback(
    (Cesium: CesiumNS, viewer: any, mode: TimeOfDay) => {
      const scene = viewer.scene;
      scene.globe.enableLighting = true;
      scene.globe.dynamicAtmosphereLighting = true;
      scene.globe.atmosphereLightIntensity = mode === "day" ? 10 : 3;

      if (mode === "day") {
        viewer.clock.currentTime = Cesium.JulianDate.fromDate(
          new Date(Date.UTC(2024, 5, 21, 20, 0, 0))
        );
        viewer.clock.shouldAnimate = false;
        scene.light = new Cesium.SunLight({ color: Cesium.Color.WHITE });
        scene.globe.baseColor = Cesium.Color.fromCssColorString("#1a2a1f");
        if (scene.skyAtmosphere) {
          scene.skyAtmosphere.hueShift = -0.02;
          scene.skyAtmosphere.saturationShift = 0.05;
          scene.skyAtmosphere.brightnessShift = 0.08;
        }
        scene.fog.enabled = true;
        scene.fog.density = 0.0002;
        scene.backgroundColor = Cesium.Color.fromCssColorString("#87a8c4");
      } else {
        viewer.clock.currentTime = Cesium.JulianDate.fromDate(
          new Date(Date.UTC(2024, 5, 21, 8, 30, 0))
        );
        viewer.clock.shouldAnimate = false;
        scene.light = new Cesium.DirectionalLight({
          direction: new Cesium.Cartesian3(0.15, 0.35, -0.9),
          color: Cesium.Color.fromCssColorString("#6b7cff"),
          intensity: 0.35,
        });
        scene.globe.baseColor = Cesium.Color.fromCssColorString("#060a12");
        if (scene.skyAtmosphere) {
          scene.skyAtmosphere.hueShift = -0.25;
          scene.skyAtmosphere.saturationShift = -0.15;
          scene.skyAtmosphere.brightnessShift = -0.45;
        }
        scene.fog.enabled = true;
        scene.fog.density = 0.00045;
        scene.backgroundColor = Cesium.Color.fromCssColorString("#04060d");
      }
      scene.requestRender();
    },
    []
  );

  const syncPoleEntity = useCallback(
    (Cesium: CesiumNS, viewer: any, pole: PlacedPole) => {
      const lit = pole.lightsOn && poleLightsRef.current;
      const shaftLen = 9;
      const position = Cesium.Cartesian3.fromDegrees(
        pole.lon,
        pole.lat,
        pole.height + shaftLen / 2
      );
      const tip = Cesium.Cartesian3.fromDegrees(
        pole.lon,
        pole.lat,
        pole.height + shaftLen
      );

      let entity = poleEntities.current.get(pole.id);
      if (!entity) {
        entity = viewer.entities.add({
          id: pole.id,
          position,
          name: "Electric pole",
          cylinder: {
            length: shaftLen,
            topRadius: 0.18,
            bottomRadius: 0.28,
            material: Cesium.Color.fromCssColorString("#8b93a7"),
            slices: 12,
          },
          point: {
            pixelSize: lit ? 14 : 6,
            color: lit
              ? Cesium.Color.fromCssColorString("#ffe566")
              : Cesium.Color.fromCssColorString("#c5cad6"),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 1,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          properties: {
            kind: "pole",
            lightsOn: pole.lightsOn,
          },
        });
        poleEntities.current.set(pole.id, entity);
      } else {
        entity.position = new Cesium.ConstantPositionProperty(position);
        if (entity.point) {
          entity.point.pixelSize = new Cesium.ConstantProperty(lit ? 14 : 6);
          entity.point.color = new Cesium.ConstantProperty(
            lit
              ? Cesium.Color.fromCssColorString("#ffe566")
              : Cesium.Color.fromCssColorString("#c5cad6")
          );
        }
      }

      const lampId = `${pole.id}-lamp`;
      let lamp = viewer.entities.getById(lampId);
      if (!lamp) {
        lamp = viewer.entities.add({
          id: lampId,
          position: tip,
          ellipsoid: {
            radii: new Cesium.Cartesian3(0.35, 0.35, 0.28),
            material: new Cesium.ColorMaterialProperty(
              lit
                ? Cesium.Color.fromCssColorString("#fff3a8").withAlpha(0.95)
                : Cesium.Color.fromCssColorString("#9aa3b5")
            ),
          },
        });
      } else {
        lamp.position = new Cesium.ConstantPositionProperty(tip);
        if (lamp.ellipsoid) {
          lamp.ellipsoid.material = new Cesium.ColorMaterialProperty(
            lit
              ? Cesium.Color.fromCssColorString("#fff3a8").withAlpha(0.95)
              : Cesium.Color.fromCssColorString("#9aa3b5")
          );
        }
      }

      const haloId = `${pole.id}-halo`;
      let halo = lightHalos.current.get(pole.id) || viewer.entities.getById(haloId);
      if (!halo) {
        halo = viewer.entities.add({
          id: haloId,
          position: tip,
          ellipsoid: {
            radii: new Cesium.Cartesian3(12, 12, 8),
            material: Cesium.Color.fromCssColorString("#ffd978").withAlpha(
              lit ? 0.18 : 0
            ),
          },
          show: lit,
        });
        lightHalos.current.set(pole.id, halo);
      } else {
        halo.position = new Cesium.ConstantPositionProperty(tip);
        halo.show = lit;
        if (halo.ellipsoid) {
          halo.ellipsoid.material = new Cesium.ColorMaterialProperty(
            Cesium.Color.fromCssColorString("#ffd978").withAlpha(lit ? 0.18 : 0)
          );
        }
      }
    },
    []
  );

  const rebuildPoles = useCallback(() => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!Cesium || !viewer) return;

    const keep = new Set(polesRef.current.map((p) => p.id));
    for (const [id, entity] of poleEntities.current) {
      if (!keep.has(id)) {
        viewer.entities.remove(entity);
        const lamp = viewer.entities.getById(`${id}-lamp`);
        if (lamp) viewer.entities.remove(lamp);
        poleEntities.current.delete(id);
        const halo =
          lightHalos.current.get(id) || viewer.entities.getById(`${id}-halo`);
        if (halo) {
          viewer.entities.remove(halo);
          lightHalos.current.delete(id);
        }
      }
    }
    for (const pole of polesRef.current) {
      syncPoleEntity(Cesium, viewer, pole);
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
      const ray = viewer.camera.getPickRay(windowPosition);
      if (!ray) return undefined;
      const globeHit = viewer.scene.globe.pick(ray, viewer.scene);
      if (globeHit) return globeHit;
      return viewer.scene.pickPosition(windowPosition);
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
        const color =
          f.properties.use === "lab"
            ? "#3d8b8b"
            : f.properties.use === "warehouse"
              ? "#5c6b7a"
              : f.properties.use === "utility"
                ? "#7a6a4f"
                : "#4a6d7c";
        buildingEntities.push(
          viewer.entities.add({
            name: f.properties.name,
            polygon: {
              hierarchy,
              extrudedHeight: height,
              material: Cesium.Color.fromCssColorString(color).withAlpha(0.92),
              outline: true,
              outlineColor: Cesium.Color.fromCssColorString("#d7e3ea"),
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
          ([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat, 0.5)
        );
        roadEntities.push(
          viewer.entities.add({
            name: f.properties.name,
            polyline: {
              positions,
              width: f.properties.class === "primary" ? 8 : 5,
              material: Cesium.Color.fromCssColorString("#e8eef2").withAlpha(0.85),
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
              pixelSize: 10,
              color: Cesium.Color.fromCssColorString("#2dd4bf"),
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 2,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
            label: {
              text: f.properties.name,
              font: "11px DM Sans, sans-serif",
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 3,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              pixelOffset: new Cesium.Cartesian2(0, -12),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
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
      viewer.scene.maximumRenderTimeChange = Infinity;
      if (viewer.scene.postProcessStages?.fxaa) {
        viewer.scene.postProcessStages.fxaa.enabled = true;
      }

      applyTimeOfDay(Cesium, viewer, "day");
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          CAMPUS.lon,
          CAMPUS.lat,
          CAMPUS.height
        ),
        orientation: {
          heading: Cesium.Math.toRadians(35),
          pitch: Cesium.Math.toRadians(-55),
          roll: 0,
        },
        duration: 1.2,
      });

      viewerRef.current = viewer;
      onStatusRef.current("Loading campus twin…");
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
        const res = await fetch("/demo/robot-path.json");
        const data = await res.json();
        robotPath.current = data.waypoints;
        const positions = data.waypoints.map(
          (w: { lon: number; lat: number; height: number }) =>
            Cesium.Cartesian3.fromDegrees(w.lon, w.lat, w.height)
        );
        viewer.entities.add({
          id: "robot-path-line",
          polyline: {
            positions,
            width: 4,
            material: new Cesium.PolylineGlowMaterialProperty({
              glowPower: 0.25,
              color: Cesium.Color.fromCssColorString("#f59e0b"),
            }),
          },
        });
        const start = data.waypoints[0];
        robotHandle.current = createAtlasRobot(Cesium, viewer, start);
      } catch {
        onStatusRef.current("Robot path unavailable");
      }

      const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      handlerRef.current = handler;

      handler.setInputAction((movement: { position: any }) => {
        const t = toolRef.current;
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
            onMeasureRef.current({
              kind: "distance",
              label: "Distance",
              value: formatMeters(pathLength(measurePoints.current)),
              detail: `Last segment ${formatMeters(dist)}`,
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
                polygonArea(Cesium, measurePoints.current)
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
          const min = Math.min(...heights);
          const max = Math.max(...heights);
          onMeasureRef.current({
            kind: "height",
            label: "Elevation profile",
            value: `${formatMeters(carto.height)} here`,
            detail: `Range ${formatMeters(min)} → ${formatMeters(max)} · Δ ${formatMeters(max - min)}`,
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
          const carto = Cesium.Cartographic.fromCartesian(cartesian);
          const origin = Cesium.Cartesian3.fromDegrees(
            Cesium.Math.toDegrees(carto.longitude),
            Cesium.Math.toDegrees(carto.latitude),
            (carto.height || 0) + 12
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
          const radius = 180;
          const rays = 48;
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
        if (
          toolRef.current === "draw-poles" &&
          drawLinePoints.current.length >= 2
        ) {
          const pts = drawLinePoints.current;
          const spacing = 35;
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
      detachCameraControlsRef.current = attachCameraControls(viewer, Cesium);
      detachKeyboardWalkRef.current = attachKeyboardWalk(
        viewer,
        Cesium,
        () => walkthroughRef.current,
        () => onWalkActiveRef.current?.()
      );
      onStatusRef.current("Campus twin ready");
      viewer.scene.requestRender();
    }

    boot().catch((err) => {
      console.error(err);
      onStatusRef.current(`Viewer error: ${String(err)}`);
    });

    return () => {
      destroyed = true;
      detachKeyboardWalkRef.current?.();
      detachKeyboardWalkRef.current = null;
      detachCameraControlsRef.current?.();
      detachCameraControlsRef.current = null;
      if (animFrame.current) cancelAnimationFrame(animFrame.current);
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
    applyTimeOfDay(Cesium, viewer, timeOfDay);
    rebuildPoles();
  }, [timeOfDay, applyTimeOfDay, rebuildPoles]);

  useEffect(() => {
    rebuildPoles();
  }, [poles, poleLightsOn, rebuildPoles]);

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
        const line = viewer.entities.getById("robot-path-line");
        if (line) line.show = layer.visible;
        robotHandle.current?.setShow(layer.visible);
        needsRender = true;
      }
      if (layer.builtInKey === "poles" && delta.visibility) {
        for (const e of poleEntities.current.values()) e.show = layer.visible;
        for (const pole of polesRef.current) {
          const lamp = viewer.entities.getById(`${pole.id}-lamp`);
          if (lamp) lamp.show = layer.visible;
          const halo = viewer.entities.getById(`${pole.id}-halo`);
          if (halo) halo.show = layer.visible && poleLightsRef.current;
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
          onStatusRef.current(
            tilesetUrl.includes("sandcastle-tileset")
              ? "Loading Sandcastle sample tiles…"
              : "Loading 3D Tiles…"
          );
          const tileset = await Cesium.Cesium3DTileset.fromUrl(tilesetUrl.trim());
          if (cancelled) return;
          viewer.scene.primitives.add(tileset);
          tilesetRef.current = tileset;
          await viewer.zoomTo(tileset);
          onStatusRef.current(
            tilesetUrl.includes("sandcastle-tileset")
              ? "Sandcastle sample tiles loaded"
              : "3D Tiles loaded"
          );
        } else if (config.cesiumIonAssetId && config.cesiumIonToken) {
          onStatusRef.current("Loading ion asset…");
          const tileset = await Cesium.Cesium3DTileset.fromIonAssetId(
            Number(config.cesiumIonAssetId)
          );
          if (cancelled) return;
          viewer.scene.primitives.add(tileset);
          tilesetRef.current = tileset;
          await viewer.zoomTo(tileset);
          onStatusRef.current(`Ion asset ${config.cesiumIonAssetId} loaded`);
        } else if (config.cesiumIonAssetId && !config.cesiumIonToken) {
          onStatusRef.current(
            "Ion asset configured but CESIUM_ION_TOKEN is missing — set the token or use Sandcastle/Campus presets"
          );
        }
      } catch (err) {
        onStatusRef.current(`Tileset error: ${String(err)}`);
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

  const syncRobotPose = useCallback(
    (progress: number, followCamera: boolean) => {
      const Cesium = cesiumRef.current;
      const viewer = viewerRef.current;
      const handle = robotHandle.current;
      const path = robotPath.current;
      if (!Cesium || !viewer || !handle || path.length < 2) return;
      const pos = interpolatePath(Cesium, path, progress);
      const heading = pathHeadingRad(path, progress);
      handle.update(pos, heading);
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
          path,
          progress
        );
      }
      viewer.scene.requestRender();
    },
    []
  );

  useEffect(() => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!Cesium || !viewer || !robotHandle.current) return;

    if (animFrame.current) {
      cancelAnimationFrame(animFrame.current);
      animFrame.current = null;
    }

    // Parked / paused: snap once. Do NOT depend on progress while playing —
    // that previously re-started the RAF loop every frame and broke walkthrough.
    if (!robot.playing || robotPath.current.length < 2) {
      syncRobotPose(robot.progress, true);
      return;
    }

    clearUserCameraControl();
    let last = performance.now();
    let progress = robotProgressRef.current;
    let lastEmit = 0;

    const tick = (now: number) => {
      if (!robotPlayingRef.current) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      progress = (progress + dt * robotSpeedRef.current * 0.05) % 1;
      robotProgressRef.current = progress;
      syncRobotPose(progress, true);
      // Throttle React state updates so the loop isn't torn down by re-renders
      if (now - lastEmit > 80) {
        lastEmit = now;
        onRobotProgressRef.current(progress);
      }
      animFrame.current = requestAnimationFrame(tick);
    };
    animFrame.current = requestAnimationFrame(tick);

    return () => {
      if (animFrame.current) cancelAnimationFrame(animFrame.current);
      animFrame.current = null;
      onRobotProgressRef.current(robotProgressRef.current);
    };
  }, [robot.playing, syncRobotPose]);

  // Progress reset / scrub while paused
  useEffect(() => {
    if (robot.playing) return;
    syncRobotPose(robot.progress, true);
  }, [robot.progress, robot.playing, syncRobotPose]);

  useEffect(() => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!Cesium || !viewer || !readyRef.current) return;

    if (walkthroughMode === "walk") {
      clearUserCameraControl();
      enterWalkCamera(Cesium, viewer);
      onStatusRef.current(
        "Walk mode — WASD or arrow keys to move, mouse to look"
      );
      return;
    }

    if (walkthroughMode === "first" || walkthroughMode === "third") {
      clearUserCameraControl();
      syncRobotPose(robotProgressRef.current, true);
      onStatusRef.current(
        walkthroughMode === "first"
          ? "1st person — following ATLAS-01"
          : "3rd person — chase camera on ATLAS-01"
      );
    }
  }, [walkthroughMode, syncRobotPose]);

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
              radii: new Cesium.Cartesian3(6, 6, 6),
              material: Cesium.Color.fromCssColorString(
                a.severity === "critical" ? "#ef4444" : "#fbbf24"
              ).withAlpha(0.35),
              outline: true,
              outlineColor: Cesium.Color.fromCssColorString("#ef4444"),
            },
            label: {
              text: "⚠",
              font: "16px sans-serif",
              fillColor: Cesium.Color.WHITE,
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

function interpolatePath(
  Cesium: CesiumNS,
  path: { lon: number; lat: number; height: number }[],
  t: number
) {
  const total = path.length - 1;
  const x = t * total;
  const i = Math.min(total - 1, Math.floor(x));
  const local = x - i;
  const a = path[i];
  const b = path[i + 1];
  const A = Cesium.Cartesian3.fromDegrees(a.lon, a.lat, a.height);
  const B = Cesium.Cartesian3.fromDegrees(b.lon, b.lat, b.height);
  return Cesium.Cartesian3.lerp(A, B, local, new Cesium.Cartesian3());
}

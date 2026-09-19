import type { SceneWeather } from "./types";
import type { TimeOfDay } from "@/lib/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type CesiumNS = any;

const CLOUD_TAG = "__twinWeatherClouds";

/** Wetness 0–1 derived from rain + precip probability. */
export function weatherWetness(weather: SceneWeather | null): number {
  if (!weather) return 0;
  const rainMm = Math.max(0, weather.rainMm ?? 0);
  const precipPct = Math.max(0, weather.precipProbabilityPct ?? 0);
  return Math.min(1, rainMm / 2.5 + precipPct / 140);
}

function cloudFactor(weather: SceneWeather | null): number {
  if (!weather) return 0;
  const cover = Math.max(0, Math.min(100, weather.cloudCoverPct ?? 0)) / 100;
  const wet = weatherWetness(weather);
  return Math.min(1, cover * 0.85 + wet * 0.25);
}

/** Sync Cesium clock to real UTC so SunLight matches Earth/sun for the site. */
export function syncSolarClock(Cesium: CesiumNS, viewer: any) {
  viewer.clock.currentTime = Cesium.JulianDate.fromDate(new Date());
  viewer.clock.shouldAnimate = true;
  viewer.clock.multiplier = 1;
}

/**
 * Day/night base lighting. Uses live solar time for day (SunLight);
 * night uses a dim cool fill so campus stays readable.
 */
export function applyTimeOfDay(
  Cesium: CesiumNS,
  viewer: any,
  mode: TimeOfDay,
  weather: SceneWeather | null = null
) {
  const scene = viewer.scene;
  scene.globe.enableLighting = true;
  scene.globe.dynamicAtmosphereLighting = true;
  syncSolarClock(Cesium, viewer);

  const clouds = cloudFactor(weather);
  const wet = weatherWetness(weather);

  if (mode === "day") {
    const intensity = Math.max(0.35, 1 - clouds * 0.55 - wet * 0.2);
    scene.light = new Cesium.SunLight({
      color: Cesium.Color.fromCssColorString(
        clouds > 0.55 ? "#d5dde8" : "#ffffff"
      ),
      intensity,
    });
    scene.globe.atmosphereLightIntensity = 12 * (1 - clouds * 0.45);
    scene.globe.baseColor = Cesium.Color.fromCssColorString("#1a2330");
    if (scene.skyAtmosphere) {
      scene.skyAtmosphere.hueShift = -0.04 - clouds * 0.06;
      scene.skyAtmosphere.saturationShift = -0.05 - clouds * 0.45 - wet * 0.2;
      scene.skyAtmosphere.brightnessShift = 0.04 - clouds * 0.35 - wet * 0.2;
    }
    scene.fog.enabled = true;
    scene.fog.density = 0.00016 + clouds * 0.00035;
    scene.fog.minimumBrightness = 0.08;
    scene.backgroundColor = Cesium.Color.fromCssColorString(
      clouds > 0.6 ? "#6b7c8f" : "#87a0b8"
    );
  } else {
    scene.light = new Cesium.DirectionalLight({
      direction: new Cesium.Cartesian3(0.15, 0.35, -0.9),
      color: Cesium.Color.fromCssColorString("#8aa4c4"),
      intensity: 0.35 * (1 - clouds * 0.3),
    });
    scene.globe.atmosphereLightIntensity = 2.5;
    scene.globe.baseColor = Cesium.Color.fromCssColorString("#0a1018");
    if (scene.skyAtmosphere) {
      scene.skyAtmosphere.hueShift = -0.18;
      scene.skyAtmosphere.saturationShift = -0.25 - clouds * 0.1;
      scene.skyAtmosphere.brightnessShift = -0.45 - clouds * 0.1;
    }
    scene.fog.enabled = true;
    scene.fog.density = 0.00045 + clouds * 0.0002;
    scene.fog.minimumBrightness = 0.02;
    scene.backgroundColor = Cesium.Color.fromCssColorString("#05080e");
  }

  scene.requestRender();
}

function ensureCloudCollection(Cesium: CesiumNS, viewer: any) {
  const scene = viewer.scene;
  let clouds = scene.primitives._primitives?.find?.(
    (p: any) => p && p[CLOUD_TAG]
  );
  if (!clouds) {
    for (let i = 0; i < scene.primitives.length; i++) {
      const p = scene.primitives.get(i);
      if (p && p[CLOUD_TAG]) {
        clouds = p;
        break;
      }
    }
  }
  if (!clouds && Cesium.CloudCollection) {
    clouds = new Cesium.CloudCollection();
    clouds[CLOUD_TAG] = true;
    scene.primitives.add(clouds);
  }
  return clouds ?? null;
}

/** Scatter soft volumetric clouds over the campus from cloud cover %. */
function syncWeatherClouds(
  Cesium: CesiumNS,
  viewer: any,
  weather: SceneWeather | null,
  timeOfDay: TimeOfDay
) {
  const collection = ensureCloudCollection(Cesium, viewer);
  if (!collection) return;

  collection.removeAll();
  if (!weather || timeOfDay !== "day") return;

  const cover = Math.max(0, Math.min(100, weather.cloudCoverPct ?? 0));
  if (cover < 12) return;

  const lon = weather.longitude ?? -122.1339;
  const lat = weather.latitude ?? 37.42205;
  const count = Math.min(18, Math.max(3, Math.round(cover / 8)));
  const brightness = Math.max(0.45, 1 - cover / 180);

  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + cover * 0.01;
    const radius = 0.004 + (i % 5) * 0.0015;
    const clat = lat + Math.cos(ang) * radius;
    const clon = lon + Math.sin(ang) * radius * 1.2;
    const height = 900 + (i % 4) * 280 + cover * 4;
    try {
      collection.add({
        position: Cesium.Cartesian3.fromDegrees(clon, clat, height),
        scale: new Cesium.Cartesian2(2200 + cover * 18, 700 + cover * 6),
        maximumSize: new Cesium.Cartesian3(
          40 + cover * 0.25,
          12 + cover * 0.08,
          18 + cover * 0.1
        ),
        slice: 0.25 + (i % 3) * 0.12,
        brightness,
      });
    } catch {
      /* CloudCollection unsupported in this Cesium build */
    }
  }
}

/** Map Open-Meteo fields onto Cesium fog, sky, sun intensity, and clouds. */
export function applyWeatherToScene(
  Cesium: CesiumNS,
  viewer: any,
  weather: SceneWeather | null,
  timeOfDay: TimeOfDay
) {
  const scene = viewer.scene;
  // Re-apply base lighting with weather modulation first
  applyTimeOfDay(Cesium, viewer, timeOfDay, weather);

  if (!weather) {
    syncWeatherClouds(Cesium, viewer, null, timeOfDay);
    scene.requestRender();
    return;
  }

  const visibilityM = weather.visibilityM;
  const rainMm = Math.max(0, weather.rainMm ?? 0);
  const precipPct = Math.max(0, weather.precipProbabilityPct ?? 0);
  const wind = Math.max(0, weather.windSpeedMps ?? 0);
  const clouds = cloudFactor(weather);
  const wet = weatherWetness(weather);

  let fogDensity = timeOfDay === "day" ? 0.00016 : 0.0004;
  fogDensity += clouds * 0.0005;
  if (visibilityM != null && visibilityM > 0) {
    const t = Math.min(1, Math.max(0, 1 - visibilityM / 40000));
    fogDensity = Math.max(fogDensity, 0.00012 + t * 0.0022);
  }
  fogDensity += Math.min(0.0015, rainMm * 0.00035 + precipPct * 0.000008);
  fogDensity += Math.min(0.0006, wind * 0.00002);

  scene.fog.enabled = true;
  scene.fog.density = fogDensity;
  scene.fog.minimumBrightness = timeOfDay === "night" ? 0.02 : 0.07;

  if (typeof scene.globe.atmosphereLightIntensity === "number") {
    const base = timeOfDay === "day" ? 12 : 2.5;
    scene.globe.atmosphereLightIntensity =
      base * (1 - wet * 0.3) * (1 - clouds * 0.4);
  }

  // Soften sunlight under overcast
  if (timeOfDay === "day" && scene.light && "intensity" in scene.light) {
    try {
      scene.light.intensity = Math.max(0.3, 1 - clouds * 0.55 - wet * 0.15);
    } catch {
      /* ignore */
    }
  }

  syncWeatherClouds(Cesium, viewer, weather, timeOfDay);
  scene.requestRender();
}

import type { SceneWeather } from "./types";
import type { TimeOfDay } from "@/lib/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type CesiumNS = any;

const CLOUD_TAG = "__twinWeatherClouds";
const WIND_TAG = "__twinWeatherWind";

/** Wetness 0–1 derived from rain + precip probability. */
export function weatherWetness(weather: SceneWeather | null): number {
  if (!weather) return 0;
  const rainMm = Math.max(0, weather.rainMm ?? 0);
  const precipPct = Math.max(0, weather.precipProbabilityPct ?? 0);
  return Math.min(1, rainMm / 2.5 + precipPct / 140);
}

/** Wind strength 0–1 from m/s (calm → gale). */
export function weatherWindFactor(weather: SceneWeather | null): number {
  if (!weather) return 0;
  return Math.min(1, Math.max(0, (weather.windSpeedMps ?? 0) / 18));
}

/** Meteorological wind direction (from) → screen CSS degrees for streak motion. */
export function weatherWindCssAngle(weather: SceneWeather | null): number {
  const from = weather?.windDirectionDeg ?? 270;
  // Blow toward = from + 180; CSS gradient angle uses that
  return (from + 180) % 360;
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
 * Also toggles a scene brightness post-process so photogrammetry meshes
 * (which ignore lights) still read as night.
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

  const clouds = cloudFactor(weather);
  const wet = weatherWetness(weather);
  const wind = weatherWindFactor(weather);

  if (mode === "day") {
    syncSolarClock(Cesium, viewer);
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
    scene.fog.density = 0.00016 + clouds * 0.00035 + wind * 0.00015;
    scene.fog.minimumBrightness = 0.08;
    scene.backgroundColor = Cesium.Color.fromCssColorString(
      clouds > 0.6 ? "#6b7c8f" : "#87a0b8"
    );
    setNightBrightnessStage(Cesium, viewer, false);
  } else {
    // Keep sun below the horizon so mesh IBL / shadows read as night
    try {
      const nightDate = new Date();
      nightDate.setUTCHours(8, 0, 0, 0); // ~night for US west campus lon
      viewer.clock.currentTime = Cesium.JulianDate.fromDate(nightDate);
      viewer.clock.shouldAnimate = false;
    } catch {
      /* ignore */
    }
    scene.light = new Cesium.DirectionalLight({
      direction: new Cesium.Cartesian3(0.15, 0.35, -0.9),
      color: Cesium.Color.fromCssColorString("#8aa4c4"),
      intensity: 0.28 * (1 - clouds * 0.3),
    });
    scene.globe.atmosphereLightIntensity = 1.2;
    scene.globe.baseColor = Cesium.Color.fromCssColorString("#0a1018");
    if (scene.skyAtmosphere) {
      scene.skyAtmosphere.hueShift = -0.18;
      scene.skyAtmosphere.saturationShift = -0.35 - clouds * 0.1;
      scene.skyAtmosphere.brightnessShift = -0.55 - clouds * 0.1;
    }
    scene.fog.enabled = true;
    scene.fog.density = 0.00055 + clouds * 0.00025 + wind * 0.00012;
    scene.fog.minimumBrightness = 0.015;
    scene.backgroundColor = Cesium.Color.fromCssColorString("#05080e");
    setNightBrightnessStage(Cesium, viewer, true);
  }

  scene.requestRender();
}

const NIGHT_STAGE_TAG = "__twinNightBrightness";

/** Full-frame brightness drop — catches unlit photogrammetry tilesets. */
function setNightBrightnessStage(
  Cesium: CesiumNS,
  viewer: any,
  enabled: boolean
) {
  const scene = viewer?.scene;
  if (!scene?.postProcessStages || !Cesium?.PostProcessStageLibrary) return;
  try {
    let stage = viewer[NIGHT_STAGE_TAG];
    if (!stage) {
      stage = Cesium.PostProcessStageLibrary.createBrightnessStage();
      stage.uniforms.brightness = 0.42;
      scene.postProcessStages.add(stage);
      viewer[NIGHT_STAGE_TAG] = stage;
    }
    stage.enabled = enabled;
    if (enabled) {
      stage.uniforms.brightness = 0.42;
    }
  } catch (err) {
    console.warn("Night brightness stage failed", err);
  }
}

/**
 * Remove any twin weather CloudCollection primitives.
 * CesiumJS CloudCollection emits TRANSLUCENT DrawCommands without boundingVolume,
 * which crashes translucent sort (`distanceSquaredTo` on undefined) and stops rendering.
 */
export function removeWeatherClouds(viewer: any) {
  const scene = viewer?.scene;
  if (!scene?.primitives) return;
  try {
    for (let i = scene.primitives.length - 1; i >= 0; i--) {
      const p = scene.primitives.get(i);
      if (p?.[CLOUD_TAG] || p?.constructor?.name === "CloudCollection") {
        scene.primitives.remove(p);
      }
    }
  } catch {
    /* ignore */
  }
}

/**
 * Cloud cover is represented via fog / skyAtmosphere / sun intensity only.
 * Volumetric CloudCollection is intentionally unused — see removeWeatherClouds.
 */
function syncWeatherClouds(
  _Cesium: CesiumNS,
  viewer: any,
  _weather: SceneWeather | null,
  _timeOfDay: TimeOfDay
) {
  removeWeatherClouds(viewer);
}

/**
 * Wind streaks were a Cesium ParticleSystem. Disabled — particle / translucent
 * draw commands have triggered boundingVolume.distanceSquaredTo crashes under
 * continuous render (Walk / Click-to-move). Wind still affects fog & lighting.
 */
function syncWindParticles(
  _Cesium: CesiumNS,
  viewer: any,
  _weather: SceneWeather | null
) {
  const scene = viewer?.scene;
  if (!scene?.primitives) return;
  try {
    for (let i = scene.primitives.length - 1; i >= 0; i--) {
      const p = scene.primitives.get(i);
      if (p?.[WIND_TAG]) scene.primitives.remove(p);
    }
  } catch {
    /* ignore */
  }
}

/** Map Open-Meteo fields onto Cesium fog, sky, sun, clouds, and wind. */
export function applyWeatherToScene(
  Cesium: CesiumNS,
  viewer: any,
  weather: SceneWeather | null,
  timeOfDay: TimeOfDay
) {
  const scene = viewer.scene;
  applyTimeOfDay(Cesium, viewer, timeOfDay, weather);

  if (!weather) {
    syncWeatherClouds(Cesium, viewer, null, timeOfDay);
    syncWindParticles(Cesium, viewer, null);
    scene.requestRender();
    return;
  }

  const visibilityM = weather.visibilityM;
  const rainMm = Math.max(0, weather.rainMm ?? 0);
  const precipPct = Math.max(0, weather.precipProbabilityPct ?? 0);
  const wind = Math.max(0, weather.windSpeedMps ?? 0);
  const clouds = cloudFactor(weather);
  const wet = weatherWetness(weather);
  const windF = weatherWindFactor(weather);

  let fogDensity = timeOfDay === "day" ? 0.00016 : 0.0004;
  fogDensity += clouds * 0.0005;
  if (visibilityM != null && visibilityM > 0) {
    const t = Math.min(1, Math.max(0, 1 - visibilityM / 40000));
    fogDensity = Math.max(fogDensity, 0.00012 + t * 0.0022);
  }
  fogDensity += Math.min(0.0015, rainMm * 0.00035 + precipPct * 0.000008);
  fogDensity += Math.min(0.0012, wind * 0.00004);

  scene.fog.enabled = true;
  scene.fog.density = fogDensity;
  scene.fog.minimumBrightness = timeOfDay === "night" ? 0.02 : 0.07;

  if (typeof scene.globe.atmosphereLightIntensity === "number") {
    const base = timeOfDay === "day" ? 12 : 2.5;
    scene.globe.atmosphereLightIntensity =
      base * (1 - wet * 0.3) * (1 - clouds * 0.4);
  }

  if (timeOfDay === "day" && scene.light && "intensity" in scene.light) {
    try {
      scene.light.intensity = Math.max(0.3, 1 - clouds * 0.55 - wet * 0.15);
    } catch {
      /* ignore */
    }
  }

  syncWeatherClouds(Cesium, viewer, weather, timeOfDay);
  syncWindParticles(Cesium, viewer, weather);

  // Keep particles animating under wind
  if (windF > 0.08) {
    scene.requestRenderMode = false;
  }

  scene.requestRender();
}

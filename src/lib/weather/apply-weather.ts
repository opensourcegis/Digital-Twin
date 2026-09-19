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
 * Day/night base lighting with an always-on brightness stage so toggling
 * Sun/Moon is unmistakable (day ~1.15, night ~0.38).
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
    scene.light = new Cesium.SunLight({
      color: Cesium.Color.WHITE,
      intensity: Math.max(1.0, 1.35 - clouds * 0.25 - wet * 0.1),
    });
    scene.globe.atmosphereLightIntensity = 16 * (1 - clouds * 0.2);
    scene.globe.baseColor = Cesium.Color.fromCssColorString("#3a4a58");
    if (scene.skyAtmosphere) {
      scene.skyAtmosphere.hueShift = 0;
      scene.skyAtmosphere.saturationShift = -clouds * 0.15;
      scene.skyAtmosphere.brightnessShift = 0.12 - clouds * 0.12;
    }
    scene.fog.enabled = clouds > 0.5 || wet > 0.2;
    scene.fog.density = 0.00008 + clouds * 0.00015 + wind * 0.00006;
    scene.fog.minimumBrightness = 0.18;
    scene.backgroundColor = Cesium.Color.fromCssColorString("#8eb4d4");
    // Always-on stage: day is bright
    setSceneBrightnessStage(Cesium, viewer, 1.18);
  } else {
    try {
      const nightDate = new Date();
      nightDate.setUTCHours(7, 0, 0, 0);
      viewer.clock.currentTime = Cesium.JulianDate.fromDate(nightDate);
      viewer.clock.shouldAnimate = false;
    } catch {
      /* ignore */
    }
    scene.light = new Cesium.DirectionalLight({
      direction: new Cesium.Cartesian3(0.25, 0.45, -0.8),
      color: Cesium.Color.fromCssColorString("#6a7f9a"),
      intensity: 0.2,
    });
    scene.globe.atmosphereLightIntensity = 0.6;
    scene.globe.baseColor = Cesium.Color.fromCssColorString("#05080e");
    if (scene.skyAtmosphere) {
      scene.skyAtmosphere.hueShift = -0.2;
      scene.skyAtmosphere.saturationShift = -0.4;
      scene.skyAtmosphere.brightnessShift = -0.65;
    }
    scene.fog.enabled = true;
    scene.fog.density = 0.0007 + clouds * 0.0003;
    scene.fog.minimumBrightness = 0.01;
    scene.backgroundColor = Cesium.Color.fromCssColorString("#02040a");
    // Always-on stage: night is dark — big contrast vs day 1.18
    setSceneBrightnessStage(Cesium, viewer, 0.36);
  }

  scene.requestRender();
}

const SCENE_BRIGHTNESS_TAG = "__twinSceneBrightness";

/** Always enabled — value is the exposure knob (day > 1, night << 1). */
function setSceneBrightnessStage(
  Cesium: CesiumNS,
  viewer: any,
  brightness: number
) {
  const scene = viewer?.scene;
  if (!scene?.postProcessStages || !Cesium?.PostProcessStageLibrary) return;
  try {
    let stage = viewer[SCENE_BRIGHTNESS_TAG] ?? viewer.__twinNightBrightness;
    if (!stage || stage.isDestroyed?.()) {
      stage = Cesium.PostProcessStageLibrary.createBrightnessStage();
      scene.postProcessStages.add(stage);
      viewer[SCENE_BRIGHTNESS_TAG] = stage;
    }
    if (viewer.__twinNightBrightness && viewer.__twinNightBrightness !== stage) {
      try {
        viewer.__twinNightBrightness.enabled = false;
      } catch {
        /* ignore */
      }
    }
    stage.enabled = true;
    stage.uniforms.brightness = brightness;
  } catch (err) {
    console.warn("Scene brightness stage failed", err);
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
    const base = timeOfDay === "day" ? 16 : 0.8;
    scene.globe.atmosphereLightIntensity =
      base * (1 - wet * 0.2) * (1 - clouds * 0.25);
  }

  // Do NOT crush day sun intensity — brightness stage handles exposure
  if (timeOfDay === "day" && scene.light && "intensity" in scene.light) {
    try {
      scene.light.intensity = Math.max(1.0, 1.35 - clouds * 0.2 - wet * 0.1);
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

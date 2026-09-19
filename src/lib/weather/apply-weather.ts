import type { SceneWeather } from "./types";
import type { TimeOfDay } from "@/lib/types";
import { CAMPUS_WEATHER_LAT, CAMPUS_WEATHER_LON } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type CesiumNS = any;

const CLOUD_TAG = "__twinWeatherClouds";
const WIND_TAG = "__twinWeatherWind";
const SCENE_BRIGHTNESS_TAG = "__twinSceneBrightness";

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
  return (from + 180) % 360;
}

function cloudFactor(weather: SceneWeather | null): number {
  if (!weather) return 0;
  const cover = Math.max(0, Math.min(100, weather.cloudCoverPct ?? 0)) / 100;
  const wet = weatherWetness(weather);
  return Math.min(1, cover * 0.85 + wet * 0.25);
}

/**
 * Pin the Cesium clock so Day always has a high sun at the site,
 * Night always has the sun below the horizon — not wall-clock UTC.
 */
function setSunClock(
  Cesium: CesiumNS,
  viewer: any,
  mode: TimeOfDay,
  siteLon: number
) {
  const d = new Date();
  const localHour = mode === "day" ? 13 : 1;
  const utcHours = (localHour - siteLon / 15 + 24) % 24;
  const h = Math.floor(utcHours);
  const m = Math.round((utcHours - h) * 60) % 60;
  d.setUTCHours(h, m, 0, 0);
  viewer.clock.currentTime = Cesium.JulianDate.fromDate(d);
  viewer.clock.shouldAnimate = false;
  viewer.clock.multiplier = 1;
}

/** Kept for callers that want live UTC; Day/Night toggle does not use this. */
export function syncSolarClock(Cesium: CesiumNS, viewer: any) {
  viewer.clock.currentTime = Cesium.JulianDate.fromDate(new Date());
  viewer.clock.shouldAnimate = true;
  viewer.clock.multiplier = 1;
}

/** Moonlight traveling onto the site (ENU → ECEF). World-fixed vectors miss the campus. */
function moonlightDirection(
  Cesium: CesiumNS,
  lon: number,
  lat: number
) {
  const origin = Cesium.Cartesian3.fromDegrees(lon, lat);
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(origin);
  const local = Cesium.Cartesian3.normalize(
    new Cesium.Cartesian3(-0.42, 0.22, -0.88),
    new Cesium.Cartesian3()
  );
  return Cesium.Matrix4.multiplyByPointAsVector(
    enu,
    local,
    new Cesium.Cartesian3()
  );
}

function disableBrightnessCrush(viewer: any) {
  const stage =
    viewer?.[SCENE_BRIGHTNESS_TAG] ?? viewer?.__twinNightBrightness;
  if (!stage) return;
  try {
    stage.enabled = false;
    if (stage.uniforms) stage.uniforms.brightness = 1;
  } catch {
    /* ignore */
  }
}

/**
 * Day/night via sun position + sky/globe — never a framebuffer exposure crush.
 * Buildings and poles restyle themselves; this only lights the globe/atmosphere.
 */
export function applyTimeOfDay(
  Cesium: CesiumNS,
  viewer: any,
  mode: TimeOfDay,
  weather: SceneWeather | null = null,
  siteLon: number = CAMPUS_WEATHER_LON,
  siteLat: number = CAMPUS_WEATHER_LAT
) {
  const scene = viewer.scene;
  try {
    scene.highDynamicRange = false;
  } catch {
    /* ignore */
  }
  scene.globe.enableLighting = true;
  scene.globe.dynamicAtmosphereLighting = true;
  try {
    if (scene.atmosphere && Cesium.DynamicAtmosphereLightingType) {
      scene.atmosphere.dynamicLighting =
        Cesium.DynamicAtmosphereLightingType.SCENE_LIGHT;
    }
  } catch {
    /* ignore */
  }
  disableBrightnessCrush(viewer);
  setSunClock(Cesium, viewer, mode, siteLon);

  const clouds = cloudFactor(weather);
  const wet = weatherWetness(weather);

  if (mode === "day") {
    try {
      scene.sun.show = true;
    } catch {
      /* ignore */
    }
    try {
      if (scene.moon) scene.moon.show = false;
    } catch {
      /* ignore */
    }
    scene.light = new Cesium.SunLight({
      color: Cesium.Color.fromCssColorString("#fff4dc"),
      intensity: Math.max(1.8, 2.5 - clouds * 0.55 - wet * 0.25),
    });
    scene.globe.atmosphereLightIntensity = 22 * (1 - clouds * 0.22);
    scene.globe.baseColor = Cesium.Color.fromCssColorString("#4a6750");
    if (scene.skyAtmosphere) {
      scene.skyAtmosphere.hueShift = 0;
      scene.skyAtmosphere.saturationShift = 0.08 - clouds * 0.22;
      scene.skyAtmosphere.brightnessShift = 0.28 - clouds * 0.16;
    }
    scene.backgroundColor = Cesium.Color.fromCssColorString("#8ec4ee");
    scene.fog.enabled = false;
    scene.fog.density = 0;
  } else {
    try {
      scene.sun.show = false;
    } catch {
      /* ignore */
    }
    try {
      if (scene.moon) scene.moon.show = true;
    } catch {
      /* ignore */
    }
    scene.light = new Cesium.DirectionalLight({
      direction: moonlightDirection(Cesium, siteLon, siteLat),
      color: Cesium.Color.fromCssColorString("#c5d4f0"),
      intensity: 1.65,
    });
    scene.globe.atmosphereLightIntensity = 4.2;
    scene.globe.baseColor = Cesium.Color.fromCssColorString("#05080f");
    if (scene.skyAtmosphere) {
      scene.skyAtmosphere.hueShift = -0.1;
      scene.skyAtmosphere.saturationShift = -0.12;
      scene.skyAtmosphere.brightnessShift = -0.32;
    }
    scene.backgroundColor = Cesium.Color.fromCssColorString("#070b14");
    scene.fog.enabled = false;
    scene.fog.density = 0;
  }

  scene.requestRender();
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

function syncWeatherClouds(
  _Cesium: CesiumNS,
  viewer: any,
  _weather: SceneWeather | null,
  _timeOfDay: TimeOfDay
) {
  removeWeatherClouds(viewer);
}

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

/** Map Open-Meteo onto fog only when visibility is actually poor. */
export function applyWeatherToScene(
  Cesium: CesiumNS,
  viewer: any,
  weather: SceneWeather | null,
  timeOfDay: TimeOfDay,
  siteLon: number = CAMPUS_WEATHER_LON,
  siteLat: number = CAMPUS_WEATHER_LAT
) {
  const scene = viewer.scene;
  applyTimeOfDay(Cesium, viewer, timeOfDay, weather, siteLon, siteLat);

  if (!weather) {
    syncWeatherClouds(Cesium, viewer, null, timeOfDay);
    syncWindParticles(Cesium, viewer, null);
    scene.requestRender();
    return;
  }

  const visibilityM = weather.visibilityM;
  const rainMm = Math.max(0, weather.rainMm ?? 0);
  const precipPct = Math.max(0, weather.precipProbabilityPct ?? 0);
  const clouds = cloudFactor(weather);
  const wet = weatherWetness(weather);
  const windF = weatherWindFactor(weather);

  const lowVis = visibilityM != null && visibilityM > 0 && visibilityM < 8000;
  const needFog = wet > 0.28 || rainMm > 0.4 || clouds > 0.82 || lowVis;

  if (needFog) {
    let fogDensity = timeOfDay === "day" ? 0.00012 : 0.00022;
    fogDensity += clouds * 0.00025;
    if (lowVis && visibilityM) {
      const t = Math.min(1, Math.max(0, 1 - visibilityM / 40000));
      fogDensity = Math.max(fogDensity, 0.0001 + t * 0.0014);
    }
    fogDensity += Math.min(0.0008, rainMm * 0.0002 + precipPct * 0.000004);
    scene.fog.enabled = true;
    scene.fog.density = fogDensity;
    scene.fog.minimumBrightness = timeOfDay === "night" ? 0.12 : 0.22;
  } else {
    scene.fog.enabled = false;
  }

  if (typeof scene.globe.atmosphereLightIntensity === "number") {
    const base = timeOfDay === "day" ? 22 : 4.2;
    scene.globe.atmosphereLightIntensity =
      base * (1 - wet * 0.15) * (1 - clouds * 0.18);
  }

  if (timeOfDay === "day" && scene.light && "intensity" in scene.light) {
    try {
      scene.light.intensity = Math.max(1.8, 2.5 - clouds * 0.5 - wet * 0.2);
    } catch {
      /* ignore */
    }
  }

  syncWeatherClouds(Cesium, viewer, weather, timeOfDay);
  syncWindParticles(Cesium, viewer, weather);

  if (windF > 0.08) {
    scene.requestRenderMode = false;
  }

  scene.requestRender();
}

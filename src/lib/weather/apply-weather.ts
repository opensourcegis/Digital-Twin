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
  const wind = weatherWindFactor(weather);

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
    scene.fog.density = 0.00016 + clouds * 0.00035 + wind * 0.00015;
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
    scene.fog.density = 0.00045 + clouds * 0.0002 + wind * 0.00012;
    scene.fog.minimumBrightness = 0.02;
    scene.backgroundColor = Cesium.Color.fromCssColorString("#05080e");
  }

  scene.requestRender();
}

function findTaggedPrimitive(scene: any, tag: string) {
  for (let i = 0; i < scene.primitives.length; i++) {
    const p = scene.primitives.get(i);
    if (p && p[tag]) return p;
  }
  return null;
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

function makeWindParticleCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 4;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 16, 0);
  g.addColorStop(0, "rgba(220,235,255,0)");
  g.addColorStop(0.4, "rgba(220,235,255,0.85)");
  g.addColorStop(1, "rgba(220,235,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 4);
  return c;
}

/**
 * Cesium particle wind streaks over campus — emission scales with wind m/s.
 */
function syncWindParticles(
  Cesium: CesiumNS,
  viewer: any,
  weather: SceneWeather | null
) {
  const scene = viewer.scene;
  let system = findTaggedPrimitive(scene, WIND_TAG);

  const wind = weatherWindFactor(weather);
  if (!weather || wind < 0.08 || !Cesium.ParticleSystem) {
    if (system) {
      scene.primitives.remove(system);
    }
    return;
  }

  const lon = weather.longitude ?? -122.1339;
  const lat = weather.latitude ?? 37.42205;
  const fromDeg = weather.windDirectionDeg ?? 270;
  const towardRad = ((fromDeg + 180) * Math.PI) / 180;
  const speed = Math.max(0, weather.windSpeedMps ?? 0);

  // Unit vector in ENU roughly for particle velocity
  const east = Math.sin(towardRad);
  const north = Math.cos(towardRad);
  const mPerDegLat = 110540;
  const mPerDegLon = 111320 * Math.cos((lat * Math.PI) / 180);

  if (system) {
    // Update in place when wind changes — avoid thrashing ParticleSystem
    try {
      system.emissionRate = 8 + speed * 6;
      system.minimumSpeed = 4 + speed * 0.8;
      system.maximumSpeed = 10 + speed * 1.6;
      system.startScale = 1.2 + wind * 2;
      system.endScale = 4 + wind * 6;
      system.startColor = Cesium.Color.WHITE.withAlpha(0.55 * wind);
      system.modelMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(
        Cesium.Cartesian3.fromDegrees(lon, lat, 18)
      );
      system.__twinWindEast = east;
      system.__twinWindNorth = north;
      system.__twinWindSpeed = speed;
      return;
    } catch {
      scene.primitives.remove(system);
      system = null;
    }
  }

  try {
    const origin = Cesium.Cartesian3.fromDegrees(lon, lat, 18);
    const modelMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(origin);
    system = new Cesium.ParticleSystem({
      image: makeWindParticleCanvas(),
      startColor: Cesium.Color.WHITE.withAlpha(0.55 * wind),
      endColor: Cesium.Color.WHITE.withAlpha(0),
      startScale: 1.2 + wind * 2,
      endScale: 4 + wind * 6,
      minimumParticleLife: 1.2,
      maximumParticleLife: 2.8,
      minimumSpeed: 4 + speed * 0.8,
      maximumSpeed: 10 + speed * 1.6,
      emissionRate: 8 + speed * 6,
      emitter: new Cesium.BoxEmitter(new Cesium.Cartesian3(120, 120, 40)),
      modelMatrix,
      emitterModelMatrix: Cesium.Matrix4.IDENTITY,
      updateCallback: (p: any, dt: number) => {
        const e = system.__twinWindEast ?? east;
        const n = system.__twinWindNorth ?? north;
        const s = system.__twinWindSpeed ?? speed;
        const enu = new Cesium.Cartesian3(e * s * dt * 2.5, n * s * dt * 2.5, 0);
        const world = Cesium.Matrix4.multiplyByPointAsVector(
          system.modelMatrix,
          enu,
          new Cesium.Cartesian3()
        );
        Cesium.Cartesian3.add(p.position, world, p.position);
      },
      lifetime: Number.MAX_VALUE,
      sizeInMeters: true,
    });
    system[WIND_TAG] = true;
    system.__twinWindEast = east;
    system.__twinWindNorth = north;
    system.__twinWindSpeed = speed;
    void mPerDegLat;
    void mPerDegLon;
    scene.primitives.add(system);
  } catch (err) {
    console.warn("Wind particles unavailable", err);
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

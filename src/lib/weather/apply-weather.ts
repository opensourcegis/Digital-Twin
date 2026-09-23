import type { SceneWeather } from "./types";
import type { LightingMode, TimeOfDay } from "@/lib/types";
import { CAMPUS_WEATHER_LAT, CAMPUS_WEATHER_LON } from "./types";
import { buildLightRecipe, type LightRecipe } from "@/lib/twin/scene-lighting";

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

export function cloudFactor(weather: SceneWeather | null): number {
  if (!weather) return 0;
  const cover = Math.max(0, Math.min(100, weather.cloudCoverPct ?? 0)) / 100;
  const wet = weatherWetness(weather);
  return Math.min(1, cover * 0.85 + wet * 0.25);
}

/** Kept for callers that want live UTC. Day / Night / Live lighting sets the clock itself. */
export function syncSolarClock(Cesium: CesiumNS, viewer: any) {
  viewer.clock.currentTime = Cesium.JulianDate.fromDate(new Date());
  viewer.clock.shouldAnimate = true;
  viewer.clock.multiplier = 1;
}

function bodyFixed(
  Cesium: CesiumNS,
  julian: any,
  which: "sun" | "moon"
): any | null {
  const pos =
    which === "sun"
      ? Cesium.Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(
          julian,
          new Cesium.Cartesian3()
        )
      : Cesium.Simon1994PlanetaryPositions.computeMoonPositionInEarthInertialFrame(
          julian,
          new Cesium.Cartesian3()
        );
  if (!pos) return null;
  const icrf = Cesium.Transforms.computeIcrfToFixedMatrix(julian);
  if (!icrf) return pos;
  return Cesium.Matrix3.multiplyByVector(icrf, pos, new Cesium.Cartesian3());
}

/** Direction light rays travel, from the moon toward the Earth. */
function moonEmissionDirection(Cesium: CesiumNS, julian: any): any {
  const moon = bodyFixed(Cesium, julian, "moon");
  if (!moon) {
    return new Cesium.Cartesian3(0.2, 0.15, -0.96);
  }
  return Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.negate(moon, new Cesium.Cartesian3()),
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

function paintAtmosphere(Cesium: CesiumNS, viewer: any, recipe: LightRecipe) {
  const scene = viewer.scene;
  const sky = scene.skyAtmosphere;
  if (sky) {
    sky.hueShift = recipe.skyHue;
    sky.saturationShift = recipe.skySaturation;
    sky.brightnessShift = recipe.skyBrightness;
  }
  const atmosphere = scene.atmosphere;
  if (atmosphere) {
    const dynamic = Cesium.DynamicAtmosphereLightingType;
    if (dynamic) {
      atmosphere.dynamicLighting =
        recipe.atmosphereDynamic === "sun" ? dynamic.SUNLIGHT : dynamic.SCENE_LIGHT;
    }
    atmosphere.hueShift = recipe.skyHue;
    atmosphere.saturationShift = recipe.skySaturation;
    atmosphere.brightnessShift = recipe.skyBrightness * 0.35;
    atmosphere.lightIntensity = recipe.atmosphereLightIntensity;
  }
}

/**
 * Sun, moon, and weather lighting for the globe and atmosphere.
 * Meshes read `scene.light` (do not replace it with a flat tileset color).
 * Returns the recipe so tilesets and poles can match.
 */
export function applyTimeOfDay(
  Cesium: CesiumNS,
  viewer: any,
  mode: TimeOfDay,
  weather: SceneWeather | null = null,
  siteLon: number = CAMPUS_WEATHER_LON,
  opts?: {
    lightingMode?: LightingMode;
    siteLat?: number;
    instant?: Date | null;
  }
): LightRecipe {
  const lightingMode: LightingMode =
    opts?.lightingMode ?? (mode === "night" ? "night" : "day");
  const siteLat = opts?.siteLat ?? CAMPUS_WEATHER_LAT;
  const instant = opts?.instant ?? new Date();
  const recipe = buildLightRecipe({
    mode: lightingMode,
    instant,
    lat: siteLat,
    lon: siteLon,
    cloud: cloudFactor(weather),
    wet: weatherWetness(weather),
    rainMm: weather?.rainMm ?? 0,
    precipPct: weather?.precipProbabilityPct ?? 0,
    visibilityM: weather?.visibilityM ?? null,
  });

  const scene = viewer.scene;
  try {
    scene.highDynamicRange = false;
  } catch {
    /* ignore */
  }
  scene.globe.enableLighting = true;
  scene.globe.dynamicAtmosphereLighting = true;
  if ("dynamicAtmosphereLightingFromSun" in scene.globe) {
    scene.globe.dynamicAtmosphereLightingFromSun =
      recipe.atmosphereDynamic === "sun";
  }
  disableBrightnessCrush(viewer);

  viewer.clock.currentTime = Cesium.JulianDate.fromDate(recipe.instant);
  viewer.clock.shouldAnimate = false;
  viewer.clock.multiplier = 1;

  try {
    scene.sun.show = recipe.sunVisible;
  } catch {
    /* ignore */
  }
  try {
    if (scene.moon) scene.moon.show = recipe.moonVisible;
  } catch {
    /* ignore */
  }

  const color = Cesium.Color.fromCssColorString(recipe.colorCss);
  if (recipe.lightKind === "sun") {
    scene.light = new Cesium.SunLight({
      color,
      intensity: recipe.intensity,
    });
  } else {
    const julian = viewer.clock.currentTime;
    scene.light = new Cesium.DirectionalLight({
      direction: moonEmissionDirection(Cesium, julian),
      color,
      intensity: recipe.intensity,
    });
  }

  scene.globe.atmosphereLightIntensity = recipe.globeAtmosphere;
  scene.globe.baseColor = Cesium.Color.fromCssColorString(recipe.globeBaseCss);
  scene.backgroundColor = Cesium.Color.fromCssColorString(recipe.backgroundCss);
  paintAtmosphere(Cesium, viewer, recipe);

  scene.fog.enabled = recipe.fogEnabled;
  scene.fog.density = recipe.fogDensity;
  scene.fog.minimumBrightness = recipe.fogMinimumBrightness;

  viewer.__twinLightRecipe = recipe;
  scene.requestRender();
  return recipe;
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

/** Apply sun, moon, or live weather. Fog and cloud dimming run only in Live. */
export function applyWeatherToScene(
  Cesium: CesiumNS,
  viewer: any,
  weather: SceneWeather | null,
  timeOfDay: TimeOfDay,
  siteLon: number = CAMPUS_WEATHER_LON,
  opts?: {
    lightingMode?: LightingMode;
    siteLat?: number;
    instant?: Date | null;
  }
): LightRecipe {
  const scene = viewer.scene;
  const recipe = applyTimeOfDay(
    Cesium,
    viewer,
    timeOfDay,
    weather,
    siteLon,
    opts
  );

  syncWeatherClouds(Cesium, viewer, weather, recipe.timeOfDay);
  syncWindParticles(Cesium, viewer, weather);

  if (weatherWindFactor(weather) > 0.08 && opts?.lightingMode === "live") {
    scene.requestRenderMode = false;
  }

  scene.requestRender();
  return recipe;
}

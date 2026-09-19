import type { SceneWeather } from "./types";
import type { TimeOfDay } from "@/lib/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type CesiumNS = any;

/** Wetness 0–1 derived from rain + precip probability. */
export function weatherWetness(weather: SceneWeather | null): number {
  if (!weather) return 0;
  const rainMm = Math.max(0, weather.rainMm ?? 0);
  const precipPct = Math.max(0, weather.precipProbabilityPct ?? 0);
  return Math.min(1, rainMm / 2.5 + precipPct / 140);
}

/** Map Open-Meteo fields onto Cesium fog and sky atmosphere. */
export function applyWeatherToScene(
  _Cesium: CesiumNS,
  viewer: any,
  weather: SceneWeather | null,
  timeOfDay: TimeOfDay
) {
  const scene = viewer.scene;
  if (!weather) {
    scene.requestRender();
    return;
  }

  const visibilityM = weather.visibilityM;
  const rainMm = Math.max(0, weather.rainMm ?? 0);
  const precipPct = Math.max(0, weather.precipProbabilityPct ?? 0);
  const wind = Math.max(0, weather.windSpeedMps ?? 0);
  const wet = weatherWetness(weather);

  let fogDensity = timeOfDay === "day" ? 0.00018 : 0.0004;
  if (visibilityM != null && visibilityM > 0) {
    const t = Math.min(1, Math.max(0, 1 - visibilityM / 40000));
    fogDensity = 0.00012 + t * 0.0022;
  }
  fogDensity += Math.min(0.0015, rainMm * 0.00035 + precipPct * 0.000008);
  fogDensity += Math.min(0.0006, wind * 0.00002);

  scene.fog.enabled = true;
  scene.fog.density = fogDensity;
  scene.fog.minimumBrightness = timeOfDay === "night" ? 0.02 : 0.08;

  if (scene.skyAtmosphere) {
    if (timeOfDay === "day") {
      scene.skyAtmosphere.saturationShift = -0.05 - wet * 0.35;
      scene.skyAtmosphere.brightnessShift = 0.02 - wet * 0.28;
      scene.skyAtmosphere.hueShift = -0.04 - wet * 0.05;
    } else {
      scene.skyAtmosphere.saturationShift = -0.2 - wet * 0.15;
      scene.skyAtmosphere.brightnessShift = -0.4 - wet * 0.12;
    }
  }

  // Dimmer globe lighting in heavy rain / low visibility
  if (typeof scene.globe.atmosphereLightIntensity === "number") {
    const base = timeOfDay === "day" ? 10 : 3;
    scene.globe.atmosphereLightIntensity = base * (1 - wet * 0.35);
  }

  scene.requestRender();
}

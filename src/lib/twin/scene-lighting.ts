import type { LightingMode, TimeOfDay } from "@/lib/types";

/** How the globe, meshes, and poles should be lit for one frame. */
export interface LightRecipe {
  timeOfDay: TimeOfDay;
  /** Wall-clock instant the sun and moon are evaluated at. */
  instant: Date;
  lightKind: "sun" | "moon";
  /** Scene light intensity. PBR reads this from the HDR light color. */
  intensity: number;
  colorCss: string;
  sunVisible: boolean;
  moonVisible: boolean;
  /** Sky and tileset atmosphere follow the sun, or the scene light (moon). */
  atmosphereDynamic: "sun" | "scene";
  atmosphereLightIntensity: number;
  globeAtmosphere: number;
  skyHue: number;
  skySaturation: number;
  skyBrightness: number;
  backgroundCss: string;
  globeBaseCss: string;
  envBrightness: number;
  envSaturation: number;
  envScatter: number;
  envGroundCss: string;
  iblDiffuse: number;
  iblSpecular: number;
  /** Extra sun highlight on mesh normals, 0–1. */
  sunGlint: number;
  /** Extra moon highlight on mesh normals, 0–1. */
  moonGlint: number;
  /** Scales street-lamp contribution on the mesh. 0 keeps lamps dark. */
  lampStrength: number;
  /** Multiplier on glTF roughness. Wet weather lowers it so surfaces reflect. */
  roughnessScale: number;
  /**
   * Albedo multiplier. Day keeps textures. Night pulls unlit and baked
   * meshes down so moonlight and lamps read instead of noon photography.
   */
  albedoGain: number;
  /** Faint sky fill so night crevices are not clipped to black. */
  nightFill: number;
  polesLit: boolean;
  fogEnabled: boolean;
  fogDensity: number;
  fogMinimumBrightness: number;
}

const RAD = Math.PI / 180;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Solar elevation in degrees. Positive means the sun is above the horizon. */
export function solarElevationDeg(
  date: Date,
  latDeg: number,
  lonDeg: number
): number {
  const lat = latDeg * RAD;
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = (date.getTime() - yearStart) / 86_400_000;
  const decl = 23.44 * RAD * Math.sin(RAD * (360 / 365) * (dayOfYear - 81));
  const minutesUtc =
    date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const solarMinutes = minutesUtc + 4 * lonDeg;
  const hourAngle = (solarMinutes / 4 - 180) * RAD;
  const sinEl =
    Math.sin(lat) * Math.sin(decl) +
    Math.cos(lat) * Math.cos(decl) * Math.cos(hourAngle);
  return (Math.asin(Math.min(1, Math.max(-1, sinEl))) * 180) / Math.PI;
}

/** 0 at new moon, 0.5 at full moon. */
export function moonPhase01(date: Date): number {
  const knownNew = Date.UTC(2000, 0, 6, 18, 14, 0);
  const synodic = 29.530588853 * 86_400_000;
  let t = (date.getTime() - knownNew) % synodic;
  if (t < 0) t += synodic;
  return t / synodic;
}

/** Approximate lit fraction of the lunar disk, 0–1. */
export function moonIllumination(date: Date): number {
  return 0.5 * (1 - Math.cos(2 * Math.PI * moonPhase01(date)));
}

/**
 * Rough lunar elevation: the moon sits about one phase-day behind the sun.
 * Positive means the moon is above the horizon.
 */
export function moonElevationDeg(
  date: Date,
  latDeg: number,
  lonDeg: number
): number {
  const lagMs = moonPhase01(date) * 24 * 3_600_000;
  return solarElevationDeg(new Date(date.getTime() - lagMs), latDeg, lonDeg);
}

/** Mean-solar hour at the site, expressed as a UTC Date on the same civil day. */
export function dateAtSolarHour(
  hour: number,
  lonDeg: number,
  base: Date = new Date()
): Date {
  const d = new Date(base);
  const utc = (((hour - lonDeg / 15) % 24) + 24) % 24;
  d.setUTCHours(Math.floor(utc), Math.round((utc % 1) * 60), 0, 0);
  return d;
}

/**
 * A night in the next two days when the sun is down and the moon is up.
 * Falls back to local solar midnight when the moon stays below the horizon.
 */
export function bestMoonlitDate(
  latDeg: number,
  lonDeg: number,
  from: Date = new Date()
): Date {
  let best: { date: Date; score: number } | null = null;
  for (let minutes = 0; minutes <= 48 * 60; minutes += 20) {
    const date = new Date(from.getTime() + minutes * 60_000);
    const sunEl = solarElevationDeg(date, latDeg, lonDeg);
    const moonEl = moonElevationDeg(date, latDeg, lonDeg);
    if (sunEl > -7 || moonEl < 10) continue;
    const score = moonEl / 80 + moonIllumination(date);
    if (!best || score > best.score) best = { date, score };
  }
  return best?.date ?? dateAtSolarHour(1, lonDeg, from);
}

function sunGain(elevationDeg: number): number {
  if (elevationDeg <= -2) return 0;
  return Math.pow(Math.min(1, elevationDeg / 48), 0.62);
}

function sunColorCss(elevationDeg: number, cloud: number): string {
  if (cloud > 0.62) return "#d7e0ea";
  if (elevationDeg < 8) return "#ffb066";
  if (elevationDeg < 22) return "#ffe0b0";
  return "#fff6e4";
}

function fogFor(
  timeOfDay: TimeOfDay,
  cloud: number,
  wet: number,
  visibilityM: number | null,
  rainMm: number,
  precipPct: number
): Pick<LightRecipe, "fogEnabled" | "fogDensity" | "fogMinimumBrightness"> {
  const lowVis = visibilityM != null && visibilityM > 0 && visibilityM < 8000;
  const needFog = wet > 0.28 || rainMm > 0.4 || cloud > 0.82 || lowVis;
  if (!needFog) {
    return { fogEnabled: false, fogDensity: 0, fogMinimumBrightness: 0.2 };
  }
  let fogDensity = timeOfDay === "day" ? 0.00012 : 0.00022;
  fogDensity += cloud * 0.00025;
  if (lowVis && visibilityM) {
    const t = Math.min(1, Math.max(0, 1 - visibilityM / 40_000));
    fogDensity = Math.max(fogDensity, 0.0001 + t * 0.0014);
  }
  fogDensity += Math.min(0.0008, rainMm * 0.0002 + precipPct * 0.000004);
  return {
    fogEnabled: true,
    fogDensity,
    fogMinimumBrightness: timeOfDay === "night" ? 0.08 : 0.2,
  };
}

export function buildLightRecipe(input: {
  mode: LightingMode;
  instant: Date;
  lat: number;
  lon: number;
  cloud: number;
  wet: number;
  rainMm: number;
  precipPct: number;
  visibilityM: number | null;
}): LightRecipe {
  const { mode, lat, lon } = input;
  const cloud = mode === "live" ? clamp01(input.cloud) : 0;
  const wet = mode === "live" ? clamp01(input.wet) : 0;
  const rainMm = mode === "live" ? Math.max(0, input.rainMm) : 0;
  const precipPct = mode === "live" ? Math.max(0, input.precipPct) : 0;
  const visibilityM = mode === "live" ? input.visibilityM : null;

  if (mode === "day") {
    const instant = dateAtSolarHour(13, lon, input.instant);
    return {
      timeOfDay: "day",
      instant,
      lightKind: "sun",
      intensity: 2.05,
      colorCss: "#fff6e4",
      sunVisible: true,
      moonVisible: false,
      atmosphereDynamic: "sun",
      atmosphereLightIntensity: 9,
      globeAtmosphere: 18,
      skyHue: 0,
      skySaturation: 0.08,
      skyBrightness: 0.2,
      backgroundCss: "#8ec4ee",
      globeBaseCss: "#4a6750",
      envBrightness: 1.05,
      envSaturation: 1.08,
      envScatter: 2.15,
      envGroundCss: "#4d6a52",
      iblDiffuse: 0.82,
      iblSpecular: 1.28,
      sunGlint: 0.46,
      moonGlint: 0,
      lampStrength: 0,
      roughnessScale: 1,
      albedoGain: 1,
      nightFill: 0,
      polesLit: false,
      fogEnabled: false,
      fogDensity: 0,
      fogMinimumBrightness: 0.22,
    };
  }

  if (mode === "night") {
    const instant = bestMoonlitDate(lat, lon, input.instant);
    const moonEl = moonElevationDeg(instant, lat, lon);
    const illum = moonIllumination(instant);
    const moonUp = smoothstep(-2, 16, moonEl);
    return {
      timeOfDay: "night",
      instant,
      lightKind: "moon",
      intensity: (0.1 + 0.42 * Math.max(illum, 0.28)) * Math.max(moonUp, 0.45),
      colorCss: "#c5d4ee",
      sunVisible: false,
      moonVisible: moonEl > -2,
      atmosphereDynamic: "scene",
      atmosphereLightIntensity: 1.7,
      globeAtmosphere: 3.4,
      skyHue: -0.08,
      skySaturation: -0.18,
      skyBrightness: -0.38,
      backgroundCss: "#070b14",
      globeBaseCss: "#070c12",
      envBrightness: 0.16,
      envSaturation: 0.38,
      envScatter: 0.42,
      envGroundCss: "#141820",
      iblDiffuse: 0.2,
      iblSpecular: 0.82,
      sunGlint: 0,
      moonGlint: 0.22 + 0.38 * illum * Math.max(moonUp, 0.35),
      lampStrength: 1.15,
      roughnessScale: 1,
      albedoGain: 0.4,
      nightFill: 0.035,
      polesLit: true,
      fogEnabled: false,
      fogDensity: 0,
      fogMinimumBrightness: 0.08,
    };
  }

  const instant = input.instant;
  const sunEl = solarElevationDeg(instant, lat, lon);
  const moonEl = moonElevationDeg(instant, lat, lon);
  const illum = moonIllumination(instant);
  const dayWeight = smoothstep(-3.5, 7, sunEl);
  const gain = sunGain(sunEl);
  const moonUp = smoothstep(-2, 18, moonEl);
  const night = sunEl < -0.6;
  const direct =
    (0.42 + 1.75 * gain) * (1 - cloud * 0.64) * (1 - wet * 0.1);
  const moonI =
    (0.06 + 0.4 * illum) * moonUp * (1 - cloud * 0.55) * (1 - dayWeight);
  const polesLit = sunEl < 0.4;
  const fog = fogFor(
    night ? "night" : "day",
    cloud,
    wet,
    visibilityM,
    rainMm,
    precipPct
  );

  if (!night) {
    return {
      timeOfDay: "day",
      instant,
      lightKind: "sun",
      intensity: Math.max(0.55, direct),
      colorCss: sunColorCss(sunEl, cloud),
      sunVisible: sunEl > -4,
      moonVisible: moonEl > 2 && sunEl < 8,
      atmosphereDynamic: "sun",
      atmosphereLightIntensity: 6 + 4 * (1 - cloud),
      globeAtmosphere: 16 * (1 - cloud * 0.35) * (1 - wet * 0.1),
      skyHue: 0,
      skySaturation: 0.08 - cloud * 0.28,
      skyBrightness: 0.2 - cloud * 0.22 - wet * 0.05,
      backgroundCss: cloud > 0.55 ? "#9aafc2" : "#8ec4ee",
      globeBaseCss: cloud > 0.55 ? "#3e5348" : "#4a6750",
      envBrightness: 0.72 + 0.38 * (1 - cloud),
      envSaturation: 0.55 + 0.5 * (1 - cloud),
      envScatter: 1.15 + 1.05 * (1 - cloud * 0.45),
      envGroundCss: "#4d6a52",
      iblDiffuse: 0.78 + cloud * 0.4,
      iblSpecular: 1.2 - cloud * 0.7,
      sunGlint: (0.08 + 0.4 * (1 - cloud)) * Math.max(0.25, gain),
      moonGlint: moonEl > 0 ? 0.05 * (1 - dayWeight) : 0,
      lampStrength: polesLit ? 0.85 * (1 - wet * 0.15) : 0,
      roughnessScale: 1 - wet * 0.42,
      albedoGain: 1 - wet * 0.06,
      nightFill: 0,
      polesLit,
      ...fog,
    };
  }

  return {
    timeOfDay: "night",
    instant,
    lightKind: "moon",
    intensity: Math.max(0.05, moonI),
    colorCss: "#c5d4ee",
    sunVisible: false,
    moonVisible: moonEl > -1,
    atmosphereDynamic: "scene",
    atmosphereLightIntensity: 1.4 * (1 - cloud * 0.3),
    globeAtmosphere: 3.2 * (1 - cloud * 0.25),
    skyHue: -0.08,
    skySaturation: -0.16 - cloud * 0.1,
    skyBrightness: -0.36 - cloud * 0.08,
    backgroundCss: "#070b14",
    globeBaseCss: "#070c12",
    envBrightness: 0.12 + 0.08 * (1 - cloud),
    envSaturation: 0.32,
    envScatter: 0.36 * (1 - cloud * 0.4),
    envGroundCss: "#141820",
    iblDiffuse: 0.16 + cloud * 0.08,
    iblSpecular: 0.7 * (1 - cloud * 0.25),
    sunGlint: 0,
    moonGlint: (0.12 + 0.36 * illum) * Math.max(moonUp, 0.2) * (1 - cloud * 0.45),
    lampStrength: 1.1 * (1 - wet * 0.18),
    roughnessScale: 1 - wet * 0.42,
    albedoGain: 0.36 - cloud * 0.04,
    nightFill: 0.03,
    polesLit: true,
    ...fog,
  };
}

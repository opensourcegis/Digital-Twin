import type { SceneWeather } from "./types";

type OpenMeteoPayload = {
  latitude?: number;
  longitude?: number;
  current?: Record<string, number | null | undefined>;
  hourly?: {
    time?: string[];
    temperature_2m?: (number | null)[];
    precipitation_probability?: (number | null)[];
    rain?: (number | null)[];
    visibility?: (number | null)[];
    wind_speed_10m?: (number | null)[];
    wind_direction_10m?: (number | null)[];
  };
};

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function nearestHourlyIndex(times: string[] | undefined): number {
  if (!times?.length) return 0;
  const now = Date.now();
  let best = 0;
  let bestDelta = Infinity;
  for (let i = 0; i < times.length; i++) {
    const t = Date.parse(times[i]!);
    if (!Number.isFinite(t)) continue;
    const d = Math.abs(t - now);
    if (d < bestDelta) {
      bestDelta = d;
      best = i;
    }
  }
  return best;
}

export function normalizeOpenMeteo(
  payload: unknown,
  sourceUrl: string
): SceneWeather {
  const data = (payload ?? {}) as OpenMeteoPayload;
  const current = data.current ?? {};
  const hourly = data.hourly ?? {};
  const hi = nearestHourlyIndex(hourly.time);

  const temperatureC =
    num(current.temperature_2m) ?? num(hourly.temperature_2m?.[hi]);
  const rainMm = num(current.rain) ?? num(hourly.rain?.[hi]);
  const precipProbabilityPct = num(hourly.precipitation_probability?.[hi]);
  const visibilityM = num(current.visibility) ?? num(hourly.visibility?.[hi]);
  const windSpeedMps =
    num(current.wind_speed_10m) ?? num(hourly.wind_speed_10m?.[hi]);
  const windDirectionDeg =
    num(current.wind_direction_10m) ?? num(hourly.wind_direction_10m?.[hi]);

  let isDay: boolean | null = null;
  if (typeof current.is_day === "number") {
    isDay = current.is_day === 1;
  }

  return {
    temperatureC,
    rainMm,
    precipProbabilityPct,
    visibilityM,
    windSpeedMps,
    windDirectionDeg,
    isDay,
    latitude: num(data.latitude),
    longitude: num(data.longitude),
    fetchedAt: new Date().toISOString(),
    sourceUrl,
  };
}

export async function fetchSceneWeather(
  apiUrl: string,
  signal?: AbortSignal
): Promise<SceneWeather> {
  const res = await fetch(apiUrl, {
    signal,
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Weather upstream ${res.status}`);
  }
  const json = await res.json();
  return normalizeOpenMeteo(json, apiUrl);
}

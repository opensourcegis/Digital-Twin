"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SceneWeather, WeatherApiResponse } from "@/lib/weather/types";

const DEFAULT_POLL_MS = 10 * 60 * 1000;

export function useWeather(enabled = true, pollMs = DEFAULT_POLL_MS) {
  const [weather, setWeather] = useState<SceneWeather | null>(null);
  const [apiUrl, setApiUrl] = useState<string | null>(null);
  const [followDayNight, setFollowDayNight] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch("/api/weather", {
        signal: ac.signal,
        cache: "no-store",
      });
      const data = (await res.json()) as WeatherApiResponse;
      setApiUrl(data.settings.apiUrl);
      setFollowDayNight(data.settings.followDayNight);
      if (data.weather) {
        setWeather(data.weather);
        setUpdatedAt(data.weather.fetchedAt);
        setError(null);
      } else {
        setError(data.error ?? `Weather unavailable (${res.status})`);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    refresh();
    const interval = Math.max(60_000, pollMs);
    const id = window.setInterval(refresh, interval);
    return () => {
      window.clearInterval(id);
      abortRef.current?.abort();
    };
  }, [enabled, refresh, pollMs]);

  return {
    weather,
    apiUrl,
    followDayNight,
    error,
    loading,
    updatedAt,
    refresh,
  };
}

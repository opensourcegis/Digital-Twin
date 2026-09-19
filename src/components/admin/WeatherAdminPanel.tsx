"use client";

import { useCallback, useEffect, useState } from "react";
import { CloudRain, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEFAULT_WEATHER_API_URL } from "@/lib/weather/types";

export function WeatherAdminPanel() {
  const [apiUrl, setApiUrl] = useState("");
  const [followDayNight, setFollowDayNight] = useState(true);
  const [defaultUrl, setDefaultUrl] = useState(DEFAULT_WEATHER_API_URL);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/weather");
      if (res.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      if (!res.ok) throw new Error(`Failed to load weather settings (${res.status})`);
      const data = await res.json();
      setApiUrl(data.settings.apiUrl);
      setFollowDayNight(!!data.settings.followDayNight);
      if (data.defaultApiUrl) setDefaultUrl(data.defaultApiUrl);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/weather", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiUrl: apiUrl.trim(), followDayNight }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Save failed (${res.status})`);
      setApiUrl(data.settings.apiUrl);
      setFollowDayNight(!!data.settings.followDayNight);
      setMessage("Weather API saved. Twin viewer will pick it up on the next poll.");
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-500/15 text-sky-300">
          <CloudRain className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg text-white">Live weather API</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            Open-Meteo (or compatible) forecast URL drives fog, haze, rain overlay,
            and optional day/night on the twin simulation view.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading settings…</p>
      ) : (
        <div className="mt-4 space-y-4">
          <label className="block text-xs text-slate-400">
            Forecast API URL
            <textarea
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              rows={4}
              spellCheck={false}
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#0a1018] px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-200 outline-none focus:border-sky-400/40"
              placeholder={defaultUrl}
            />
          </label>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={followDayNight}
              onChange={(e) => setFollowDayNight(e.target.checked)}
              className="h-4 w-4 accent-sky-400"
            />
            Follow live <code className="text-sky-300">is_day</code> for Day/Night
          </label>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={save} disabled={saving || !apiUrl.trim()}>
              <Save className="h-4 w-4" />
              {saving ? "Saving…" : "Save weather API"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={saving}
              onClick={() => setApiUrl(defaultUrl)}
            >
              <RotateCcw className="h-4 w-4" />
              Reset to default
            </Button>
          </div>

          {message && (
            <p className="text-xs text-emerald-300">{message}</p>
          )}
          {error && <p className="text-xs text-red-300">{error}</p>}

          <p className="text-[11px] leading-relaxed text-slate-500">
            Persists to <code className="text-sky-300/80">data/weather-settings.json</code>.
            Include <code className="text-slate-400">current</code> and{" "}
            <code className="text-slate-400">hourly</code> fields for temperature, rain,
            visibility, and wind.
          </p>
        </div>
      )}
    </section>
  );
}

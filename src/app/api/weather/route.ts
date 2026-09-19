import { NextResponse } from "next/server";
import {
  assertSafeWeatherUrl,
  getWeatherSettings,
} from "@/lib/weather/settings-store";
import { fetchSceneWeather } from "@/lib/weather/fetch-weather";
import type { WeatherApiResponse } from "@/lib/weather/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getWeatherSettings();
  const body: WeatherApiResponse = {
    weather: null,
    settings: {
      apiUrl: settings.apiUrl,
      followDayNight: settings.followDayNight,
    },
  };

  try {
    assertSafeWeatherUrl(settings.apiUrl);
    body.weather = await fetchSceneWeather(settings.apiUrl);
    return NextResponse.json(body);
  } catch (err) {
    body.error = err instanceof Error ? err.message : String(err);
    return NextResponse.json(body, { status: 502 });
  }
}

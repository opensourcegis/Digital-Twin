export const DEFAULT_WEATHER_API_URL =
  "https://api.open-meteo.com/v1/forecast?latitude=18.1795&longitude=79.476&hourly=temperature_2m,precipitation_probability,rain,visibility,wind_speed_10m,wind_direction_10m&current=temperature_2m,rain,is_day,wind_speed_10m";

export interface WeatherSettings {
  apiUrl: string;
  /** When true, live is_day drives Day/Night on the twin. */
  followDayNight: boolean;
  updatedAt: string;
}

/** Normalized snapshot used by the Cesium scene + ops HUD. */
export interface SceneWeather {
  temperatureC: number | null;
  rainMm: number | null;
  precipProbabilityPct: number | null;
  visibilityM: number | null;
  windSpeedMps: number | null;
  windDirectionDeg: number | null;
  isDay: boolean | null;
  latitude: number | null;
  longitude: number | null;
  fetchedAt: string;
  sourceUrl: string;
}

export interface WeatherApiResponse {
  weather: SceneWeather | null;
  settings: Pick<WeatherSettings, "apiUrl" | "followDayNight">;
  error?: string;
}

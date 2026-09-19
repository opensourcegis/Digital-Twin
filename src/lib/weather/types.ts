export const CAMPUS_WEATHER_LAT = 37.42205;
export const CAMPUS_WEATHER_LON = -122.1339;

/** Default Open-Meteo URL centered on the demo campus with cloud cover. */
export const DEFAULT_WEATHER_API_URL =
  `https://api.open-meteo.com/v1/forecast?latitude=${CAMPUS_WEATHER_LAT}&longitude=${CAMPUS_WEATHER_LON}` +
  `&hourly=temperature_2m,precipitation_probability,rain,visibility,wind_speed_10m,wind_direction_10m,cloud_cover,weather_code` +
  `&current=temperature_2m,rain,is_day,wind_speed_10m,cloud_cover,weather_code`;

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
  cloudCoverPct: number | null;
  weatherCode: number | null;
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

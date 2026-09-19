import { promises as fs } from "fs";
import path from "path";
import {
  DEFAULT_WEATHER_API_URL,
  type WeatherSettings,
} from "./types";

const DATA_PATH = path.join(process.cwd(), "data", "weather-settings.json");

function now() {
  return new Date().toISOString();
}

function seed(): WeatherSettings {
  return {
    apiUrl: DEFAULT_WEATHER_API_URL,
    followDayNight: true,
    updatedAt: now(),
  };
}

let cache: WeatherSettings | null = null;

async function readFile(): Promise<WeatherSettings> {
  try {
    const raw = await fs.readFile(DATA_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<WeatherSettings>;
    let apiUrl =
      typeof parsed.apiUrl === "string" && parsed.apiUrl.trim()
        ? parsed.apiUrl.trim()
        : DEFAULT_WEATHER_API_URL;
    // Upgrade legacy Open-Meteo URLs that lack cloud cover / wrong site
    if (
      apiUrl.includes("open-meteo.com") &&
      (!apiUrl.includes("cloud_cover") || apiUrl.includes("18.1795"))
    ) {
      apiUrl = DEFAULT_WEATHER_API_URL;
    }
    return {
      apiUrl,
      followDayNight:
        typeof parsed.followDayNight === "boolean"
          ? parsed.followDayNight
          : true,
      updatedAt:
        typeof parsed.updatedAt === "string" ? parsed.updatedAt : now(),
    };
  } catch {
    const initial = seed();
    await writeFile(initial);
    return initial;
  }
}

async function writeFile(settings: WeatherSettings) {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(settings, null, 2), "utf8");
}

export async function getWeatherSettings(): Promise<WeatherSettings> {
  if (!cache) cache = await readFile();
  return cache;
}

export async function updateWeatherSettings(
  patch: Partial<Pick<WeatherSettings, "apiUrl" | "followDayNight">>
): Promise<WeatherSettings> {
  const current = await getWeatherSettings();
  const next: WeatherSettings = {
    ...current,
    updatedAt: now(),
  };
  if (typeof patch.apiUrl === "string") {
    next.apiUrl = patch.apiUrl.trim();
  }
  if (typeof patch.followDayNight === "boolean") {
    next.followDayNight = patch.followDayNight;
  }
  await writeFile(next);
  cache = next;
  return next;
}

/** Basic SSRF guard for admin-configured weather URLs. */
export function assertSafeWeatherUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Weather API URL must use http or https");
  }
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    throw new Error("Localhost weather API hosts are not allowed");
  }
  // Block obvious private / link-local ranges
  if (
    /^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host)
  ) {
    throw new Error("Private-network weather API hosts are not allowed");
  }
  return url;
}

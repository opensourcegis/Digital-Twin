import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, unauthorized } from "@/lib/admin/session";
import {
  assertSafeWeatherUrl,
  getWeatherSettings,
  updateWeatherSettings,
} from "@/lib/weather/settings-store";
import { DEFAULT_WEATHER_API_URL } from "@/lib/weather/types";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getAdminSession())) return unauthorized();
  const settings = await getWeatherSettings();
  return NextResponse.json({
    settings,
    defaultApiUrl: DEFAULT_WEATHER_API_URL,
  });
}

export async function PUT(req: NextRequest) {
  if (!(await getAdminSession())) return unauthorized();
  let body: { apiUrl?: string; followDayNight?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    if (typeof body.apiUrl === "string") {
      assertSafeWeatherUrl(body.apiUrl.trim());
    }
    const settings = await updateWeatherSettings({
      apiUrl: body.apiUrl,
      followDayNight: body.followDayNight,
    });
    return NextResponse.json({ settings });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}

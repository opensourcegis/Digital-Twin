import { NextResponse } from "next/server";
import { getPlatformSettings } from "@/lib/platform/settings-store";

export const dynamic = "force-dynamic";

/** Public platform design settings for the twin viewer. */
export async function GET() {
  const settings = await getPlatformSettings();
  return NextResponse.json({ settings });
}

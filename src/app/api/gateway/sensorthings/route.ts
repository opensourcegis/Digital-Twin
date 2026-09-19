import { NextRequest, NextResponse } from "next/server";
import { pullSensorThings } from "@/lib/gateway/sensor-gateway";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { limit?: number };
  const result = await pullSensorThings(body.limit ?? 50);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

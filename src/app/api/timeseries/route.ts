import { NextRequest, NextResponse } from "next/server";
import { ensureTwinStoreReady } from "@/lib/twin/twin-store";

export async function GET(req: NextRequest) {
  const store = await ensureTwinStoreReady();
  const sensorGuid = req.nextUrl.searchParams.get("sensorGuid");
  const from = Number(req.nextUrl.searchParams.get("from") ?? Date.now() - 86400000);
  const to = Number(req.nextUrl.searchParams.get("to") ?? Date.now());
  if (!sensorGuid) {
    return NextResponse.json({ error: "sensorGuid required" }, { status: 400 });
  }
  return NextResponse.json({
    points: store.getTimeSeries(sensorGuid, from, to),
  });
}

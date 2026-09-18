import { NextRequest, NextResponse } from "next/server";
import { ensureTwinStoreReady } from "@/lib/twin/twin-store";

export async function GET(req: NextRequest) {
  const store = await ensureTwinStoreReady();
  const at = req.nextUrl.searchParams.get("at");
  const t = at ? Number(at) : undefined;
  const snapshot = store.getSnapshot(t);
  return NextResponse.json({
    ...snapshot,
    symbology: store.getSymbology(t),
    assets: store.getAssets().length,
    sensors: store.getSensors().length,
  });
}

export async function POST(req: NextRequest) {
  const store = await ensureTwinStoreReady();
  const body = await req.json();
  if (typeof body.robotProgress === "number") {
    store.setRobotProgress(body.robotProgress);
  }
  return NextResponse.json({ ok: true });
}

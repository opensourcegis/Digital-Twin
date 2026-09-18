import { NextRequest, NextResponse } from "next/server";
import { ensureTwinStoreReady } from "@/lib/twin/twin-store";

export async function GET(req: NextRequest) {
  const store = await ensureTwinStoreReady();
  const at = req.nextUrl.searchParams.get("at");
  const t = at ? Number(at) : undefined;
  const snap = store.getSnapshot(t);
  return NextResponse.json({ readings: snap.readings, timestamp: snap.timestamp });
}

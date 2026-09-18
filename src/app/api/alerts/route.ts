import { NextRequest, NextResponse } from "next/server";
import { ensureTwinStoreReady } from "@/lib/twin/twin-store";

export async function GET(req: NextRequest) {
  const store = await ensureTwinStoreReady();
  const at = req.nextUrl.searchParams.get("at");
  const t = at ? Number(at) : undefined;
  return NextResponse.json({ alerts: store.getAlerts(t) });
}

export async function PATCH(req: NextRequest) {
  const store = await ensureTwinStoreReady();
  const { id } = await req.json();
  const alert = store.acknowledgeAlert(id);
  if (!alert) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(alert);
}

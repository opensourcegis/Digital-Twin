import { NextRequest, NextResponse } from "next/server";
import { ensureTwinStoreReady } from "@/lib/twin/twin-store";

export async function GET(req: NextRequest) {
  const store = await ensureTwinStoreReady();
  const assetGuid = req.nextUrl.searchParams.get("assetGuid") ?? undefined;
  return NextResponse.json({ workOrders: store.getWorkOrders(assetGuid) });
}

export async function PATCH(req: NextRequest) {
  const store = await ensureTwinStoreReady();
  const { id, ...patch } = await req.json();
  const wo = store.updateWorkOrder(id, patch);
  if (!wo) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(wo);
}

export async function POST(req: NextRequest) {
  const store = await ensureTwinStoreReady();
  const body = await req.json();
  const wo = store.createWorkOrder(body);
  return NextResponse.json(wo, { status: 201 });
}

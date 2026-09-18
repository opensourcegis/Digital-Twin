import { NextRequest, NextResponse } from "next/server";
import { ensureTwinStoreReady } from "@/lib/twin/twin-store";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ guid: string }> }
) {
  const { guid } = await params;
  const store = await ensureTwinStoreReady();
  const asset = store.getAsset(guid);
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    asset,
    relations: store.getRelations(guid),
    sensors: store.getSensors().filter((s) => s.assetGuid === guid),
    workOrders: store.getWorkOrders(guid),
    bms: store.getBmsPoints(guid),
    documents: store.getDocuments(guid),
  });
}

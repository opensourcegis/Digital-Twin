import { NextRequest, NextResponse } from "next/server";
import { ensureTwinStoreReady } from "@/lib/twin/twin-store";

export async function GET() {
  const store = await ensureTwinStoreReady();
  return NextResponse.json({ assets: store.getAssets() });
}

export async function POST(req: NextRequest) {
  const store = await ensureTwinStoreReady();
  const body = await req.json();
  if (body.action === "createWorkOrder") {
    const wo = store.createWorkOrder(body.workOrder);
    return NextResponse.json(wo);
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

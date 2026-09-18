import { NextRequest, NextResponse } from "next/server";
import { ensureTwinStoreReady } from "@/lib/twin/twin-store";

export async function GET(req: NextRequest) {
  const store = await ensureTwinStoreReady();
  const assetGuid = req.nextUrl.searchParams.get("assetGuid") ?? undefined;
  return NextResponse.json({ points: store.getBmsPoints(assetGuid) });
}

export async function PATCH(req: NextRequest) {
  const store = await ensureTwinStoreReady();
  const { guid, value } = await req.json();
  const pt = store.setBmsPoint(guid, value);
  if (!pt) return NextResponse.json({ error: "Not writable or not found" }, { status: 400 });
  return NextResponse.json(pt);
}

import { NextRequest, NextResponse } from "next/server";
import { ensureTwinStoreReady } from "@/lib/twin/twin-store";

export async function GET(req: NextRequest) {
  const store = await ensureTwinStoreReady();
  const assetGuid = req.nextUrl.searchParams.get("assetGuid") ?? undefined;
  return NextResponse.json({ documents: store.getDocuments(assetGuid) });
}

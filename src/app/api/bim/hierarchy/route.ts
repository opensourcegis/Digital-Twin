import { NextResponse } from "next/server";
import { ensureTwinStoreReady } from "@/lib/twin/twin-store";
import {
  buildAssetHierarchy,
  loadAssetsFromDb,
} from "@/lib/bim/ifc-import";

export const dynamic = "force-dynamic";

export async function GET() {
  const fromDb = await loadAssetsFromDb();
  const store = await ensureTwinStoreReady();
  const assets = fromDb ?? store.getAssets();
  const hierarchy = await buildAssetHierarchy(assets);
  return NextResponse.json({
    source: fromDb ? "database" : "memory",
    count: assets.length,
    hierarchy,
  });
}

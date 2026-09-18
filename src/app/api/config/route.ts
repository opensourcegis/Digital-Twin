import { NextResponse } from "next/server";
import type { TwinConfig } from "@/lib/types";
import { SANDCASTLE_TEST_TILESET_URL } from "@/lib/sandcastle-preset";

export const dynamic = "force-dynamic";

export async function GET() {
  const token =
    process.env.CESIUM_ION_TOKEN ||
    process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN ||
    null;
  const assetId =
    process.env.CESIUM_ION_ASSET_ID ||
    process.env.NEXT_PUBLIC_CESIUM_ION_ASSET_ID ||
    null;
  const tilesetUrl =
    process.env.DEFAULT_TILESET_URL ||
    process.env.NEXT_PUBLIC_DEFAULT_TILESET_URL ||
    null;

  const config: TwinConfig = {
    cesiumIonToken: token,
    cesiumIonAssetId: assetId,
    defaultTilesetUrl: tilesetUrl,
    basemap: token ? "ion" : "osm",
    demoScene: "campus",
    sandcastleTilesetUrl: SANDCASTLE_TEST_TILESET_URL,
  };

  return NextResponse.json(config);
}

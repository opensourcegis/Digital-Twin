import { NextRequest, NextResponse } from "next/server";
import { importIfcMapping, type IfcNode } from "@/lib/bim/ifc-import";
import { ensureTwinStoreReady } from "@/lib/twin/twin-store";
import type { TwinAsset } from "@/lib/twin/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    nodes?: IfcNode[];
    projectName?: string;
    siteOrigin?: { lon: number; lat: number };
  };

  if (!body.nodes?.length) {
    return NextResponse.json({ error: "nodes[] required" }, { status: 400 });
  }

  const siteOrigin = body.siteOrigin ?? { lon: -122.1339, lat: 37.42205 };
  const result = await importIfcMapping(body, siteOrigin);

  // Mirror into in-memory twin so the explorer refreshes immediately
  const store = await ensureTwinStoreReady();
  const assets: TwinAsset[] = body.nodes.map((node) => ({
    guid: `ifc-${node.ifcGuid}`,
    name: node.name,
    type: node.type,
    parentGuid: node.parentIfcGuid ? `ifc-${node.parentIfcGuid}` : undefined,
    lon: node.lon ?? siteOrigin.lon,
    lat: node.lat ?? siteOrigin.lat,
    height: node.height ?? (node.floorIndex ?? 0) * 3.5,
    coordinateSystem: "EPSG:4326",
    metadata: {
      source: "ifc",
      ifcGuid: node.ifcGuid,
      project: body.projectName ?? "imported",
      ...(node.floorIndex != null ? { floorIndex: node.floorIndex } : {}),
    },
  }));
  store.upsertAssets(assets);

  return NextResponse.json(result);
}

export async function GET() {
  // Return demo IFC mapping template
  const fs = await import("fs/promises");
  const path = `${process.cwd()}/public/demo/ifc-mapping-sample.json`;
  try {
    const raw = await fs.readFile(path, "utf8");
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json({
      projectName: "Sample Campus IFC",
      nodes: [],
    });
  }
}

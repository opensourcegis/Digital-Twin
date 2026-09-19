/**
 * Phase 3 — BIM/GIS Asset Explorer
 * IFC import → GUID mapping → building/floor/room/equipment hierarchy.
 */
import { getDb, schema } from "@/db";
import { recordEvent } from "@/lib/twin/twin-persist";
import type { AssetType, TwinAsset } from "@/lib/twin/types";

export interface IfcNode {
  ifcGuid: string;
  name: string;
  type: AssetType;
  parentIfcGuid?: string;
  floorIndex?: number;
  lon?: number;
  lat?: number;
  height?: number;
}

export interface HierarchyNode {
  guid: string;
  name: string;
  type: AssetType;
  ifcGuid?: string | null;
  floorIndex?: number | null;
  children: HierarchyNode[];
}

/** Parse a minimal IFC-JSON / mapping payload into hierarchy nodes. */
export function parseIfcMapping(payload: {
  nodes?: IfcNode[];
  projectName?: string;
}): IfcNode[] {
  return payload.nodes ?? [];
}

export async function importIfcMapping(
  payload: { nodes?: IfcNode[]; projectName?: string },
  siteOrigin = { lon: -122.1339, lat: 37.42205 }
) {
  const nodes = parseIfcMapping(payload);
  const db = getDb();
  const created: string[] = [];

  for (const node of nodes) {
    const guid = `ifc-${node.ifcGuid}`;
    const parentGuid = node.parentIfcGuid
      ? `ifc-${node.parentIfcGuid}`
      : undefined;
    const asset: TwinAsset = {
      guid,
      name: node.name,
      type: node.type,
      parentGuid,
      lon: node.lon ?? siteOrigin.lon,
      lat: node.lat ?? siteOrigin.lat,
      height: node.height ?? (node.floorIndex ?? 0) * 3.5,
      coordinateSystem: "EPSG:4326",
      metadata: {
        source: "ifc",
        ifcGuid: node.ifcGuid,
        project: payload.projectName ?? "imported",
      },
    };

    if (db) {
      await db
        .insert(schema.assets)
        .values({
          guid: asset.guid,
          name: asset.name,
          type: asset.type,
          parentGuid: asset.parentGuid ?? null,
          lon: asset.lon ?? null,
          lat: asset.lat ?? null,
          height: asset.height ?? null,
          coordinateSystem: "EPSG:4326",
          metadata: asset.metadata,
          ifcGuid: node.ifcGuid,
          floorIndex: node.floorIndex ?? null,
        })
        .onConflictDoUpdate({
          target: schema.assets.guid,
          set: {
            name: asset.name,
            parentGuid: asset.parentGuid ?? null,
            ifcGuid: node.ifcGuid,
            floorIndex: node.floorIndex ?? null,
            updatedAt: new Date(),
          },
        });
    }
    created.push(guid);
  }

  await recordEvent("bim.ifc.import", {
    count: created.length,
    project: payload.projectName ?? null,
  });

  return { imported: created.length, guids: created };
}

export async function buildAssetHierarchy(
  assets: TwinAsset[]
): Promise<HierarchyNode[]> {
  const map = new Map<string, HierarchyNode>();
  for (const a of assets) {
    map.set(a.guid, {
      guid: a.guid,
      name: a.name,
      type: a.type,
      ifcGuid: (a.metadata?.ifcGuid as string) ?? null,
      floorIndex: typeof a.metadata?.floorIndex === "number" ? a.metadata.floorIndex : null,
      children: [],
    });
  }
  const roots: HierarchyNode[] = [];
  for (const a of assets) {
    const node = map.get(a.guid)!;
    if (a.parentGuid && map.has(a.parentGuid)) {
      map.get(a.parentGuid)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export async function loadAssetsFromDb(): Promise<TwinAsset[] | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db.select().from(schema.assets);
  return rows.map((r) => ({
    guid: r.guid,
    name: r.name,
    type: r.type as AssetType,
    parentGuid: r.parentGuid ?? undefined,
    buildingCode: r.buildingCode ?? undefined,
    lon: r.lon ?? undefined,
    lat: r.lat ?? undefined,
    height: r.height ?? undefined,
    coordinateSystem: "EPSG:4326",
    dimensions: r.dimensions ?? undefined,
    metadata: {
      ...r.metadata,
      ...(r.ifcGuid ? { ifcGuid: r.ifcGuid } : {}),
      ...(r.floorIndex != null ? { floorIndex: r.floorIndex } : {}),
    },
  }));
}

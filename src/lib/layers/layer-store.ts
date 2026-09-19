import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type {
  LayerCatalog,
  LayerConfig,
  LayerCreateInput,
  LayerUpdateInput,
} from "./types";
import { DEFAULT_LAYER_STYLE } from "./types";

const DATA_PATH = path.join(process.cwd(), "data", "layers.json");

function now() {
  return new Date().toISOString();
}

function seedCatalog(): LayerCatalog {
  const t = now();
  const mk = (
    partial: Omit<
      LayerConfig,
      "id" | "createdAt" | "updatedAt" | "style" | "guidBindings" | "dataSource"
    > & {
      style?: Partial<LayerConfig["style"]>;
      guidBindings?: string[];
      dataSource?: string | null;
    }
  ): LayerConfig => {
    const { style: stylePartial, ...rest } = partial;
    return {
      id: randomUUID(),
      guidBindings: partial.guidBindings ?? [],
      dataSource: partial.dataSource ?? null,
      createdAt: t,
      updatedAt: t,
      ...rest,
      style: { ...DEFAULT_LAYER_STYLE, ...(stylePartial ?? {}) },
    };
  };

  const layers: LayerConfig[] = [
    mk({
      name: "Campus terrain DTM",
      description: "Elevation grid footprint",
      category: "terrain-dtm",
      enabled: true,
      visible: true,
      opacity: 0.35,
      zOrder: 10,
      coordinateSystem: "EPSG:4326",
      dataSource: "/demo/campus-terrain.geojson",
      builtInKey: "terrain",
      style: { fillColor: "#1e3a2f", strokeColor: "#334155", lineWidth: 2, pointSize: 8 },
    }),
    mk({
      name: "Campus buildings",
      description: "Extruded BIM-style footprints",
      category: "buildings-bim",
      enabled: true,
      visible: true,
      opacity: 0.92,
      zOrder: 40,
      coordinateSystem: "EPSG:4326",
      dataSource: "/demo/campus-buildings.geojson",
      builtInKey: "buildings",
      guidBindings: ["bldg-hq-8f3a-4c1e-9b2d-ops-hall", "bldg-lab-7e2b-3d0f-8a1c-robotics"],
      style: { fillColor: "#4a6d7c", strokeColor: "#d7e3ea", lineWidth: 2, pointSize: 8 },
    }),
    mk({
      name: "Service roads",
      description: "Campus circulation network",
      category: "roads-infrastructure",
      enabled: true,
      visible: true,
      opacity: 0.85,
      zOrder: 30,
      coordinateSystem: "EPSG:4326",
      dataSource: "/demo/campus-roads.geojson",
      builtInKey: "roads",
      style: { fillColor: "#e8eef2", strokeColor: "#e8eef2", lineWidth: 6, pointSize: 8 },
    }),
    mk({
      name: "Subsurface utilities",
      description: "Steam, storm, electrical feeds",
      category: "subsurface-utilities",
      enabled: true,
      visible: false,
      opacity: 0.4,
      zOrder: 20,
      coordinateSystem: "EPSG:4326",
      dataSource: "/demo/campus-utilities.geojson",
      builtInKey: "utilities",
      guidBindings: ["pipe-steam-1c6d-7e9b-2a0f-main", "pipe-water-0d5c-6d8a-1b9e-storm"],
      style: { fillColor: "#c4845a", strokeColor: "#a89b6a", lineWidth: 2, pointSize: 8 },
    }),
    mk({
      name: "Site POIs",
      description: "Gates, docks, rally points",
      category: "pois",
      enabled: true,
      visible: true,
      opacity: 1,
      zOrder: 50,
      coordinateSystem: "EPSG:4326",
      dataSource: "/demo/campus-pois.geojson",
      builtInKey: "pois",
      style: { fillColor: "#2dd4bf", strokeColor: "#ffffff", lineWidth: 2, pointSize: 10 },
    }),
    mk({
      name: "IoT sensor overlay",
      description: "Live telemetry sensor locations",
      category: "sensors-iot",
      enabled: true,
      visible: true,
      opacity: 1,
      zOrder: 55,
      coordinateSystem: "EPSG:4326",
      dataSource: "/demo/sensors.json",
      builtInKey: "sensors",
      style: { fillColor: "#2dd4bf", strokeColor: "#ffffff", lineWidth: 2, pointSize: 12 },
    }),
    mk({
      name: "Alert symbology",
      description: "Spatial threshold alert markers",
      category: "alert-symbology",
      enabled: true,
      visible: true,
      opacity: 0.85,
      zOrder: 60,
      coordinateSystem: "EPSG:4326",
      dataSource: null,
      builtInKey: "alerts",
      style: { fillColor: "#ef4444", strokeColor: "#fca5a5", lineWidth: 2, pointSize: 14 },
    }),
    mk({
      name: "Electric / lighting poles",
      description: "Placed pole infrastructure",
      category: "infra-custom",
      enabled: true,
      visible: true,
      opacity: 1,
      zOrder: 45,
      coordinateSystem: "EPSG:4326",
      dataSource: null,
      builtInKey: "poles",
      style: { fillColor: "#94a3b8", strokeColor: "#fbbf24", lineWidth: 2, pointSize: 8 },
    }),
    mk({
      name: "ATLAS-01 robot",
      description: "AMR unit — free roam simulation (no fixed route)",
      category: "robot-patrol",
      enabled: true,
      visible: true,
      opacity: 1,
      zOrder: 70,
      coordinateSystem: "EPSG:4326",
      dataSource: null,
      builtInKey: "robot-path",
      guidBindings: ["robot-atlas-01-9f0e-5c7d-3b2a"],
      style: { fillColor: "#fbbf24", strokeColor: "#f59e0b", lineWidth: 4, pointSize: 8 },
    }),
    mk({
      name: "External 3D Tiles",
      description: "Ion or URL tileset mesh",
      category: "tiles-3d",
      enabled: true,
      visible: true,
      opacity: 1,
      zOrder: 80,
      coordinateSystem: "EPSG:4326",
      dataSource: null,
      builtInKey: "tileset",
      style: { fillColor: "#ffffff", strokeColor: "#ffffff", lineWidth: 1, pointSize: 8 },
    }),
  ];

  return { version: 1, updatedAt: t, layers };
}

async function readCatalog(): Promise<LayerCatalog> {
  try {
    const raw = await fs.readFile(DATA_PATH, "utf-8");
    return JSON.parse(raw) as LayerCatalog;
  } catch {
    const seeded = seedCatalog();
    await writeCatalog(seeded);
    return seeded;
  }
}

async function writeCatalog(catalog: LayerCatalog): Promise<void> {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  catalog.updatedAt = now();
  await fs.writeFile(DATA_PATH, JSON.stringify(catalog, null, 2), "utf-8");
}

export async function listLayers(): Promise<LayerConfig[]> {
  const catalog = await readCatalog();
  return [...catalog.layers].sort((a, b) => a.zOrder - b.zOrder);
}

export async function getLayer(id: string): Promise<LayerConfig | null> {
  const catalog = await readCatalog();
  return catalog.layers.find((l) => l.id === id) ?? null;
}

export async function createLayer(input: LayerCreateInput): Promise<LayerConfig> {
  const catalog = await readCatalog();
  const maxZ = catalog.layers.reduce((m, l) => Math.max(m, l.zOrder), 0);
  const layer: LayerConfig = {
    ...input,
    id: randomUUID(),
    zOrder: input.zOrder ?? maxZ + 10,
    style: { ...DEFAULT_LAYER_STYLE, ...input.style },
    guidBindings: input.guidBindings ?? [],
    dataSource: input.dataSource ?? null,
    builtInKey: input.builtInKey ?? null,
    createdAt: now(),
    updatedAt: now(),
  };
  catalog.layers.push(layer);
  await writeCatalog(catalog);
  return layer;
}

export async function updateLayer(
  id: string,
  patch: LayerUpdateInput
): Promise<LayerConfig | null> {
  const catalog = await readCatalog();
  const idx = catalog.layers.findIndex((l) => l.id === id);
  if (idx < 0) return null;
  catalog.layers[idx] = {
    ...catalog.layers[idx],
    ...patch,
    style: patch.style
      ? { ...catalog.layers[idx].style, ...patch.style }
      : catalog.layers[idx].style,
    updatedAt: now(),
  };
  await writeCatalog(catalog);
  return catalog.layers[idx];
}

export async function deleteLayer(id: string): Promise<boolean> {
  const catalog = await readCatalog();
  const before = catalog.layers.length;
  catalog.layers = catalog.layers.filter((l) => l.id !== id);
  if (catalog.layers.length === before) return false;
  await writeCatalog(catalog);
  return true;
}

export async function reorderLayers(ids: string[]): Promise<LayerConfig[]> {
  const catalog = await readCatalog();
  const map = new Map(catalog.layers.map((l) => [l.id, l]));
  const reordered: LayerConfig[] = [];
  ids.forEach((id, i) => {
    const layer = map.get(id);
    if (layer) {
      layer.zOrder = (i + 1) * 10;
      layer.updatedAt = now();
      reordered.push(layer);
    }
  });
  for (const layer of catalog.layers) {
    if (!ids.includes(layer.id)) reordered.push(layer);
  }
  catalog.layers = reordered;
  await writeCatalog(catalog);
  return listLayers();
}

export function layerToViewerState(layer: LayerConfig) {
  return {
    id: layer.builtInKey ?? layer.id,
    configId: layer.id,
    label: layer.name,
    description: layer.description,
    visible: layer.enabled && layer.visible,
    opacity: layer.opacity,
    zOrder: layer.zOrder,
    kind: layer.category,
    builtInKey: layer.builtInKey,
  };
}

/** Persisted spatial layer configuration for TwinBench admin + viewer */

export type LayerCategory =
  | "terrain-dtm"
  | "terrain-dem"
  | "tiles-3d"
  | "buildings-bim"
  | "subsurface-utilities"
  | "roads-infrastructure"
  | "sensors-iot"
  | "robot-patrol"
  | "alert-symbology"
  | "pois"
  | "infra-custom"
  | "custom-vector";

export interface LayerStyle {
  fillColor: string;
  strokeColor: string;
  lineWidth: number;
  pointSize: number;
}

export interface LayerConfig {
  id: string;
  name: string;
  description: string;
  category: LayerCategory;
  enabled: boolean;
  visible: boolean;
  opacity: number;
  zOrder: number;
  coordinateSystem: "EPSG:4326" | "EPSG:3857" | "local";
  dataSource: string | null;
  guidBindings: string[];
  style: LayerStyle;
  /** Maps to CesiumViewer built-in layer bucket when set */
  builtInKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LayerCatalog {
  version: number;
  updatedAt: string;
  layers: LayerConfig[];
}

export type LayerCreateInput = Omit<
  LayerConfig,
  "id" | "createdAt" | "updatedAt" | "zOrder"
> & { zOrder?: number };

export type LayerUpdateInput = Partial<
  Omit<LayerConfig, "id" | "createdAt">
>;

export const LAYER_CATEGORY_LABELS: Record<LayerCategory, string> = {
  "terrain-dtm": "Terrain DTM",
  "terrain-dem": "Terrain DEM",
  "tiles-3d": "3D Tiles / Mesh",
  "buildings-bim": "Buildings / BIM",
  "subsurface-utilities": "Subsurface utilities",
  "roads-infrastructure": "Roads / infrastructure",
  "sensors-iot": "Sensors / IoT overlay",
  "robot-patrol": "Robot patrol route",
  "alert-symbology": "Alert / symbology overlay",
  pois: "Points of interest",
  "infra-custom": "Infrastructure (custom)",
  "custom-vector": "Custom vector",
};

export const DEFAULT_LAYER_STYLE: LayerStyle = {
  fillColor: "#4a6d7c",
  strokeColor: "#d7e3ea",
  lineWidth: 4,
  pointSize: 10,
};

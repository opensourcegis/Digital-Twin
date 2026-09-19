export type ActiveTool =
  | "navigate"
  | "measure-distance"
  | "measure-area"
  | "height-profile"
  | "identify"
  | "viewshed"
  | "place-pole"
  | "draw-poles"
  | "robot-waypoints"
  | "clip-polygon"
  | "clip-hole"
  | "bim-snap";

export type LayerId =
  | "buildings"
  | "roads"
  | "pois"
  | "utilities"
  | "sensors"
  | "terrain"
  | "tileset"
  | "robot-path"
  | "poles";

export type TimeOfDay = "day" | "night";

export interface LayerState {
  id: LayerId;
  label: string;
  description: string;
  visible: boolean;
  kind: "vector" | "tiles" | "sim" | "infra";
}

export type DemoSceneId = "campus" | "sandcastle";

export interface TwinConfig {
  cesiumIonToken: string | null;
  cesiumIonAssetId: string | null;
  defaultTilesetUrl: string | null;
  basemap: "osm" | "ion";
  demoScene: DemoSceneId;
  sandcastleTilesetUrl: string;
}

export interface MeasureResult {
  kind: "distance" | "area" | "height" | "identify" | "viewshed" | "poles";
  label: string;
  value: string;
  detail?: string;
}

export interface RobotState {
  playing: boolean;
  progress: number;
  speed: number;
}

export interface PlacedPole {
  id: string;
  lon: number;
  lat: number;
  height: number;
  lightsOn: boolean;
}

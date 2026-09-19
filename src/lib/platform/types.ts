import type { ActiveTool } from "@/lib/types";
import type { WalkthroughMode } from "@/lib/twin/types";

export interface SimulationSettings {
  /** Display name for the robot unit */
  robotName: string;
  baseSpeedMps: number;
  turnRateRad: number;
  goalTimeoutSec: number;
  alertSlowdownFactor: number;
  batteryDrainPerTick: number;
  batteryChargePerTick: number;
  defaultWalkthroughMode: WalkthroughMode;
  spawn: { lon: number; lat: number; height: number; headingDeg: number };
  bounds: {
    minLon: number;
    maxLon: number;
    minLat: number;
    maxLat: number;
  };
  seedPoles: boolean;
  defaultPoleCount: number;
}

export interface InformaticsSettings {
  showWeather: boolean;
  showBms: boolean;
  showAlerts: boolean;
  showRobotStatus: boolean;
  showTimeSlider: boolean;
  bmsLimit: number;
  alertLimit: number;
  weatherPollMinutes: number;
  copTitle: string;
}

export type GisToolId = Exclude<ActiveTool, "navigate">;

export interface GisAnalysisSettings {
  enabledTools: GisToolId[];
  measureUnits: "metric" | "imperial";
  viewshedRadiusM: number;
  viewshedRays: number;
  viewshedObserverHeightM: number;
  poleSpacingM: number;
  heightSampleCount: number;
}

export interface PlatformSettings {
  simulation: SimulationSettings;
  informatics: InformaticsSettings;
  gis: GisAnalysisSettings;
  updatedAt: string;
}

export const DEFAULT_SIMULATION: SimulationSettings = {
  robotName: "ATLAS-01",
  baseSpeedMps: 2.8,
  turnRateRad: 1.1,
  goalTimeoutSec: 28,
  alertSlowdownFactor: 0.5,
  batteryDrainPerTick: 0.05,
  batteryChargePerTick: 0.02,
  defaultWalkthroughMode: "off",
  spawn: {
    lon: -122.1339,
    lat: 37.42205,
    height: 0.15,
    headingDeg: 35,
  },
  bounds: {
    minLon: -122.1362,
    maxLon: -122.1318,
    minLat: 37.4212,
    maxLat: 37.4236,
  },
  seedPoles: true,
  defaultPoleCount: 4,
};

export const DEFAULT_INFORMATICS: InformaticsSettings = {
  showWeather: true,
  showBms: true,
  showAlerts: true,
  showRobotStatus: true,
  showTimeSlider: true,
  bmsLimit: 4,
  alertLimit: 12,
  weatherPollMinutes: 10,
  copTitle: "Common operating picture",
};

export const DEFAULT_GIS: GisAnalysisSettings = {
  enabledTools: [
    "measure-distance",
    "measure-area",
    "height-profile",
    "identify",
    "viewshed",
    "place-pole",
    "draw-poles",
  ],
  measureUnits: "metric",
  viewshedRadiusM: 180,
  viewshedRays: 48,
  viewshedObserverHeightM: 2,
  poleSpacingM: 35,
  heightSampleCount: 24,
};

export const ALL_GIS_TOOLS: { id: GisToolId; label: string }[] = [
  { id: "measure-distance", label: "Distance" },
  { id: "measure-area", label: "Area" },
  { id: "height-profile", label: "Height profile" },
  { id: "identify", label: "Identify" },
  { id: "viewshed", label: "Viewshed" },
  { id: "place-pole", label: "Place pole" },
  { id: "draw-poles", label: "Draw poles" },
  { id: "robot-waypoints", label: "Robot waypoints" },
];

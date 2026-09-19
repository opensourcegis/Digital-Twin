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
  /** Camera home when twin loads / demo reset */
  cameraHome: {
    lon: number;
    lat: number;
    height: number;
    headingDeg: number;
    pitchDeg: number;
  };
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
  weatherSectionTitle: string;
  bmsSectionTitle: string;
  robotBatteryLabel: string;
  criticalAlertsLabel: string;
  temperatureUnit: "C" | "F";
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

export type DockModuleId =
  | "live"
  | "insight"
  | "sim"
  | "tiles"
  | "layers"
  | "tools";

export interface DockModuleConfig {
  id: DockModuleId;
  enabled: boolean;
  label: string;
  panelTitle: string;
  order: number;
}

export interface BrandingSettings {
  productName: string;
  tagline: string;
  accentFrom: string;
  accentTo: string;
  showBrandChip: boolean;
  showLiveChip: boolean;
  liveLabel: string;
  offlineLabel: string;
  loadingLabel: string;
  readyLabel: string;
}

export interface ShellSettings {
  modules: DockModuleConfig[];
  defaultPanel: DockModuleId | null;
  showDayNightToggle: boolean;
  showZoomControls: boolean;
  showAdminLink: boolean;
  showHeader: boolean;
  showStatusBar: boolean;
  showInsightBim: boolean;
  showInsightScenario: boolean;
  showInsightAnalytics: boolean;
  insightPanelTitle: string;
  footerTemplate: string;
}

export interface PlatformSettings {
  branding: BrandingSettings;
  shell: ShellSettings;
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
  cameraHome: {
    lon: -122.1339,
    lat: 37.42205,
    height: 420,
    headingDeg: 25,
    pitchDeg: -35,
  },
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
  weatherSectionTitle: "Site weather",
  bmsSectionTitle: "BMS / BAS",
  robotBatteryLabel: "Robot battery",
  criticalAlertsLabel: "Critical alerts",
  temperatureUnit: "C",
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

export const DEFAULT_BRANDING: BrandingSettings = {
  productName: "TwinBench",
  tagline: "Operations twin",
  accentFrom: "#94a3b8",
  accentTo: "#64748b",
  showBrandChip: true,
  showLiveChip: true,
  liveLabel: "Live",
  offlineLabel: "Offline",
  loadingLabel: "Opening twin…",
  readyLabel: "Campus twin ready",
};

export const DEFAULT_SHELL: ShellSettings = {
  modules: [
    {
      id: "live",
      enabled: true,
      label: "Live",
      panelTitle: "Live data",
      order: 0,
    },
    {
      id: "insight",
      enabled: true,
      label: "Insight",
      panelTitle: "BIM · Scenario · Analytics",
      order: 1,
    },
    {
      id: "sim",
      enabled: true,
      label: "Sim",
      panelTitle: "Simulation",
      order: 2,
    },
    {
      id: "tiles",
      enabled: true,
      label: "Tiles",
      panelTitle: "3D Tiles",
      order: 3,
    },
    {
      id: "layers",
      enabled: true,
      label: "Layers",
      panelTitle: "Layers",
      order: 4,
    },
    {
      id: "tools",
      enabled: true,
      label: "Tools",
      panelTitle: "Tools",
      order: 5,
    },
  ],
  defaultPanel: null,
  showDayNightToggle: true,
  showZoomControls: true,
  showAdminLink: true,
  showHeader: true,
  showStatusBar: true,
  showInsightBim: true,
  showInsightScenario: true,
  showInsightAnalytics: true,
  insightPanelTitle: "BIM · Scenario · Analytics",
  footerTemplate: "{status} · {tod} · {temp} · {alerts} critical",
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

export const DOCK_MODULE_IDS: DockModuleId[] = [
  "live",
  "insight",
  "sim",
  "tiles",
  "layers",
  "tools",
];

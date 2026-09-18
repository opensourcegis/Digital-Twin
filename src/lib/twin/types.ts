/** Digital twin domain types — asset hierarchy, telemetry, CMMS, BMS, alerts */

export type AssetType =
  | "site"
  | "building"
  | "floor"
  | "space"
  | "equipment"
  | "pipe"
  | "sensor"
  | "utility"
  | "robot";

export type SensorMetric =
  | "temperature"
  | "vibration"
  | "pressure"
  | "energy"
  | "flow"
  | "occupancy"
  | "humidity"
  | "water_level";

export type ReadingQuality = "good" | "interpolated" | "drift" | "timeout";

export interface TwinAsset {
  guid: string;
  name: string;
  type: AssetType;
  parentGuid?: string;
  buildingCode?: string;
  lon?: number;
  lat?: number;
  height?: number;
  coordinateSystem: "EPSG:4326";
  dimensions?: { widthM: number; depthM: number; heightM: number };
  metadata: Record<string, string | number | boolean>;
}

export interface SemanticRelation {
  subjectGuid: string;
  predicate:
    | "hasPart"
    | "isPartOf"
    | "hasPoint"
    | "feeds"
    | "locatedIn"
    | "monitors"
    | "controls";
  objectGuid: string;
  ontology: "Brick" | "RealEstateCore" | "DTDL";
}

export interface SensorDefinition {
  guid: string;
  assetGuid: string;
  name: string;
  metric: SensorMetric;
  unit: string;
  protocol: "mqtt" | "coap" | "websocket" | "rest";
  topic?: string;
  thresholds: { warning: number; critical: number; direction: "high" | "low" };
  lon: number;
  lat: number;
  height: number;
}

export interface SensorReading {
  sensorGuid: string;
  metric: SensorMetric;
  value: number;
  unit: string;
  quality: ReadingQuality;
  timestamp: string;
}

export interface Alert {
  id: string;
  severity: "info" | "warning" | "critical";
  message: string;
  assetGuid: string;
  sensorGuid?: string;
  metric?: SensorMetric;
  value?: number;
  threshold?: number;
  lon?: number;
  lat?: number;
  height?: number;
  timestamp: string;
  acknowledged: boolean;
  spatial: boolean;
}

export interface WorkOrder {
  id: string;
  assetGuid: string;
  title: string;
  description: string;
  status: "open" | "in_progress" | "completed";
  priority: "low" | "medium" | "high";
  type: "inspection" | "repair" | "preventive";
  assetAgeYears?: number;
  createdAt: string;
  dueDate: string;
}

export interface BmsPoint {
  guid: string;
  assetGuid: string;
  system: "hvac" | "lighting" | "access";
  name: string;
  value: number | boolean | string;
  unit?: string;
  protocol: "bacnet" | "modbus";
  writable: boolean;
}

export interface TwinDocument {
  id: string;
  assetGuid: string;
  title: string;
  type: "spec" | "om" | "warranty" | "drawing";
  summary: string;
  url: string;
}

export interface TimeSeriesPoint {
  timestamp: string;
  sensorGuid: string;
  metric: SensorMetric;
  value: number;
  quality: ReadingQuality;
}

export interface TwinSnapshot {
  timestamp: string;
  readings: SensorReading[];
  alerts: Alert[];
  bms: BmsPoint[];
  robot: { progress: number; batteryPct: number; activeAlerts: number };
}

export interface AssetSymbology {
  guid: string;
  color: string;
  pulse: boolean;
  label?: string;
}

export type WalkthroughMode = "off" | "first" | "third" | "walk";

export interface RobotTelemetry {
  progress: number;
  batteryPct: number;
  speed: number;
  nearestSensorGuid: string | null;
  activeAlerts: number;
  status: "patrol" | "investigating" | "hold" | "charging";
}

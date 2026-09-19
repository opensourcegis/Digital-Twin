import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

/** Phase 1 — persistent digital twin schema (PostGIS/Timescale-ready). */

export const sites = pgTable("sites", {
  guid: varchar("guid", { length: 128 }).primaryKey(),
  name: text("name").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const assets = pgTable(
  "assets",
  {
    guid: varchar("guid", { length: 128 }).primaryKey(),
    name: text("name").notNull(),
    type: varchar("type", { length: 64 }).notNull(),
    parentGuid: varchar("parent_guid", { length: 128 }),
    buildingCode: varchar("building_code", { length: 64 }),
    lon: doublePrecision("lon"),
    lat: doublePrecision("lat"),
    height: doublePrecision("height"),
    coordinateSystem: varchar("coordinate_system", { length: 32 })
      .notNull()
      .default("EPSG:4326"),
    dimensions: jsonb("dimensions").$type<{
      widthM: number;
      depthM: number;
      heightM: number;
    } | null>(),
    metadata: jsonb("metadata")
      .$type<Record<string, string | number | boolean>>()
      .notNull()
      .default({}),
    // BIM hierarchy (Phase 3)
    ifcGuid: varchar("ifc_guid", { length: 128 }),
    floorIndex: integer("floor_index"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("assets_parent_idx").on(t.parentGuid), index("assets_type_idx").on(t.type)]
);

export const semanticRelations = pgTable(
  "semantic_relations",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    subjectGuid: varchar("subject_guid", { length: 128 }).notNull(),
    predicate: varchar("predicate", { length: 64 }).notNull(),
    objectGuid: varchar("object_guid", { length: 128 }).notNull(),
    ontology: varchar("ontology", { length: 64 }).notNull(),
  },
  (t) => [index("sem_subj_idx").on(t.subjectGuid), index("sem_obj_idx").on(t.objectGuid)]
);

export const sensors = pgTable(
  "sensors",
  {
    guid: varchar("guid", { length: 128 }).primaryKey(),
    assetGuid: varchar("asset_guid", { length: 128 }).notNull(),
    name: text("name").notNull(),
    metric: varchar("metric", { length: 64 }).notNull(),
    unit: varchar("unit", { length: 32 }).notNull(),
    protocol: varchar("protocol", { length: 32 }).notNull(),
    topic: text("topic"),
    thresholds: jsonb("thresholds")
      .$type<{ warning: number; critical: number; direction: "high" | "low" }>()
      .notNull(),
    lon: doublePrecision("lon").notNull(),
    lat: doublePrecision("lat").notNull(),
    height: doublePrecision("height").notNull().default(0),
    // Phase 2 SensorThings
    thingsId: varchar("things_id", { length: 128 }),
    datastreamId: varchar("datastream_id", { length: 128 }),
    sourceMode: varchar("source_mode", { length: 16 }).notNull().default("simulator"),
  },
  (t) => [index("sensors_asset_idx").on(t.assetGuid)]
);

/** Timeseries hypertable candidate — created by migration when Timescale is available. */
export const sensorReadings = pgTable(
  "sensor_readings",
  {
    time: timestamp("time", { withTimezone: true }).notNull(),
    sensorGuid: varchar("sensor_guid", { length: 128 }).notNull(),
    metric: varchar("metric", { length: 64 }).notNull(),
    value: doublePrecision("value").notNull(),
    unit: varchar("unit", { length: 32 }).notNull(),
    quality: varchar("quality", { length: 32 }).notNull().default("good"),
    source: varchar("source", { length: 32 }).notNull().default("simulator"),
  },
  (t) => [
    primaryKey({ columns: [t.time, t.sensorGuid] }),
    index("readings_sensor_time_idx").on(t.sensorGuid, t.time),
  ]
);

export const alerts = pgTable(
  "alerts",
  {
    id: varchar("id", { length: 160 }).primaryKey(),
    severity: varchar("severity", { length: 32 }).notNull(),
    message: text("message").notNull(),
    assetGuid: varchar("asset_guid", { length: 128 }).notNull(),
    sensorGuid: varchar("sensor_guid", { length: 128 }),
    metric: varchar("metric", { length: 64 }),
    value: doublePrecision("value"),
    threshold: doublePrecision("threshold"),
    lon: doublePrecision("lon"),
    lat: doublePrecision("lat"),
    height: doublePrecision("height"),
    acknowledged: boolean("acknowledged").notNull().default(false),
    spatial: boolean("spatial").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    clearedAt: timestamp("cleared_at", { withTimezone: true }),
  },
  (t) => [
    index("alerts_active_idx").on(t.acknowledged, t.createdAt),
    index("alerts_asset_idx").on(t.assetGuid),
  ]
);

export const twinEvents = pgTable(
  "twin_events",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    time: timestamp("time", { withTimezone: true }).notNull().defaultNow(),
    kind: varchar("kind", { length: 64 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    scenarioId: varchar("scenario_id", { length: 128 }),
  },
  (t) => [index("events_time_idx").on(t.time), index("events_kind_idx").on(t.kind)]
);

export const bmsPoints = pgTable("bms_points", {
  guid: varchar("guid", { length: 128 }).primaryKey(),
  assetGuid: varchar("asset_guid", { length: 128 }).notNull(),
  system: varchar("system", { length: 32 }).notNull(),
  name: text("name").notNull(),
  value: jsonb("value").$type<number | boolean | string>().notNull(),
  unit: varchar("unit", { length: 32 }),
  protocol: varchar("protocol", { length: 32 }).notNull(),
  writable: boolean("writable").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const workOrders = pgTable("work_orders", {
  id: varchar("id", { length: 64 }).primaryKey(),
  assetGuid: varchar("asset_guid", { length: 128 }).notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  priority: varchar("priority", { length: 32 }).notNull(),
  type: varchar("type", { length: 32 }).notNull(),
  assetAgeYears: doublePrecision("asset_age_years"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
});

export const documents = pgTable("documents", {
  id: varchar("id", { length: 64 }).primaryKey(),
  assetGuid: varchar("asset_guid", { length: 128 }).notNull(),
  title: text("title").notNull(),
  type: varchar("type", { length: 32 }).notNull(),
  summary: text("summary").notNull(),
  url: text("url").notNull(),
});

export const robotState = pgTable("robot_state", {
  id: integer("id").primaryKey().default(1),
  progress: doublePrecision("progress").notNull().default(0),
  batteryPct: doublePrecision("battery_pct").notNull().default(92),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Phase 2 — gateway mode */
export const gatewayConfig = pgTable("gateway_config", {
  id: integer("id").primaryKey().default(1),
  mode: varchar("mode", { length: 16 }).notNull().default("simulator"),
  mqttUrl: text("mqtt_url"),
  sensorThingsUrl: text("sensor_things_url"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Phase 4 — scenarios */
export const scenarios = pgTable("scenarios", {
  id: varchar("id", { length: 128 }).primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  clonedAt: timestamp("cloned_at", { withTimezone: true }).notNull(),
  variables: jsonb("variables").$type<Record<string, unknown>>().notNull().default({}),
  status: varchar("status", { length: 32 }).notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const scenarioReadings = pgTable(
  "scenario_readings",
  {
    time: timestamp("time", { withTimezone: true }).notNull(),
    scenarioId: varchar("scenario_id", { length: 128 }).notNull(),
    sensorGuid: varchar("sensor_guid", { length: 128 }).notNull(),
    metric: varchar("metric", { length: 64 }).notNull(),
    value: doublePrecision("value").notNull(),
    unit: varchar("unit", { length: 32 }).notNull(),
    quality: varchar("quality", { length: 32 }).notNull().default("good"),
  },
  (t) => [
    primaryKey({ columns: [t.time, t.scenarioId, t.sensorGuid] }),
    index("scenario_readings_idx").on(t.scenarioId, t.sensorGuid, t.time),
  ]
);

/** Phase 5 — analytics outputs */
export const analyticsFindings = pgTable(
  "analytics_findings",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    kind: varchar("kind", { length: 64 }).notNull(),
    assetGuid: varchar("asset_guid", { length: 128 }),
    sensorGuid: varchar("sensor_guid", { length: 128 }),
    score: doublePrecision("score"),
    summary: text("summary").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("analytics_kind_idx").on(t.kind, t.createdAt)]
);

-- Phase 1: PostGIS + TimescaleDB (optional) + twin tables
CREATE EXTENSION IF NOT EXISTS postgis;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'timescaledb not available — using plain Postgres indexes';
END $$;

CREATE TABLE IF NOT EXISTS sites (
  guid varchar(128) PRIMARY KEY,
  name text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assets (
  guid varchar(128) PRIMARY KEY,
  name text NOT NULL,
  type varchar(64) NOT NULL,
  parent_guid varchar(128),
  building_code varchar(64),
  lon double precision,
  lat double precision,
  height double precision,
  coordinate_system varchar(32) NOT NULL DEFAULT 'EPSG:4326',
  dimensions jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ifc_guid varchar(128),
  floor_index integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assets_parent_idx ON assets(parent_guid);
CREATE INDEX IF NOT EXISTS assets_type_idx ON assets(type);

CREATE TABLE IF NOT EXISTS semantic_relations (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subject_guid varchar(128) NOT NULL,
  predicate varchar(64) NOT NULL,
  object_guid varchar(128) NOT NULL,
  ontology varchar(64) NOT NULL
);
CREATE INDEX IF NOT EXISTS sem_subj_idx ON semantic_relations(subject_guid);
CREATE INDEX IF NOT EXISTS sem_obj_idx ON semantic_relations(object_guid);

CREATE TABLE IF NOT EXISTS sensors (
  guid varchar(128) PRIMARY KEY,
  asset_guid varchar(128) NOT NULL,
  name text NOT NULL,
  metric varchar(64) NOT NULL,
  unit varchar(32) NOT NULL,
  protocol varchar(32) NOT NULL,
  topic text,
  thresholds jsonb NOT NULL,
  lon double precision NOT NULL,
  lat double precision NOT NULL,
  height double precision NOT NULL DEFAULT 0,
  things_id varchar(128),
  datastream_id varchar(128),
  source_mode varchar(16) NOT NULL DEFAULT 'simulator'
);
CREATE INDEX IF NOT EXISTS sensors_asset_idx ON sensors(asset_guid);

CREATE TABLE IF NOT EXISTS sensor_readings (
  time timestamptz NOT NULL,
  sensor_guid varchar(128) NOT NULL,
  metric varchar(64) NOT NULL,
  value double precision NOT NULL,
  unit varchar(32) NOT NULL,
  quality varchar(32) NOT NULL DEFAULT 'good',
  source varchar(32) NOT NULL DEFAULT 'simulator',
  PRIMARY KEY (time, sensor_guid)
);
CREATE INDEX IF NOT EXISTS readings_sensor_time_idx ON sensor_readings(sensor_guid, time DESC);

DO $$
BEGIN
  PERFORM create_hypertable('sensor_readings', 'time', if_not_exists => TRUE, migrate_data => TRUE);
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'hypertable skipped: %', SQLERRM;
END $$;

CREATE TABLE IF NOT EXISTS alerts (
  id varchar(160) PRIMARY KEY,
  severity varchar(32) NOT NULL,
  message text NOT NULL,
  asset_guid varchar(128) NOT NULL,
  sensor_guid varchar(128),
  metric varchar(64),
  value double precision,
  threshold double precision,
  lon double precision,
  lat double precision,
  height double precision,
  acknowledged boolean NOT NULL DEFAULT false,
  spatial boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  cleared_at timestamptz
);
CREATE INDEX IF NOT EXISTS alerts_active_idx ON alerts(acknowledged, created_at DESC);
CREATE INDEX IF NOT EXISTS alerts_asset_idx ON alerts(asset_guid);

CREATE TABLE IF NOT EXISTS twin_events (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  time timestamptz NOT NULL DEFAULT now(),
  kind varchar(64) NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  scenario_id varchar(128)
);
CREATE INDEX IF NOT EXISTS events_time_idx ON twin_events(time DESC);
CREATE INDEX IF NOT EXISTS events_kind_idx ON twin_events(kind);

CREATE TABLE IF NOT EXISTS bms_points (
  guid varchar(128) PRIMARY KEY,
  asset_guid varchar(128) NOT NULL,
  system varchar(32) NOT NULL,
  name text NOT NULL,
  value jsonb NOT NULL,
  unit varchar(32),
  protocol varchar(32) NOT NULL,
  writable boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS work_orders (
  id varchar(64) PRIMARY KEY,
  asset_guid varchar(128) NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  status varchar(32) NOT NULL,
  priority varchar(32) NOT NULL,
  type varchar(32) NOT NULL,
  asset_age_years double precision,
  created_at timestamptz NOT NULL,
  due_date timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id varchar(64) PRIMARY KEY,
  asset_guid varchar(128) NOT NULL,
  title text NOT NULL,
  type varchar(32) NOT NULL,
  summary text NOT NULL,
  url text NOT NULL
);

CREATE TABLE IF NOT EXISTS robot_state (
  id integer PRIMARY KEY DEFAULT 1,
  progress double precision NOT NULL DEFAULT 0,
  battery_pct double precision NOT NULL DEFAULT 92,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO robot_state (id, progress, battery_pct)
VALUES (1, 0, 92)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS gateway_config (
  id integer PRIMARY KEY DEFAULT 1,
  mode varchar(16) NOT NULL DEFAULT 'simulator',
  mqtt_url text,
  sensor_things_url text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO gateway_config (id, mode)
VALUES (1, 'simulator')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS scenarios (
  id varchar(128) PRIMARY KEY,
  name text NOT NULL,
  description text,
  cloned_at timestamptz NOT NULL,
  variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(32) NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scenario_readings (
  time timestamptz NOT NULL,
  scenario_id varchar(128) NOT NULL,
  sensor_guid varchar(128) NOT NULL,
  metric varchar(64) NOT NULL,
  value double precision NOT NULL,
  unit varchar(32) NOT NULL,
  quality varchar(32) NOT NULL DEFAULT 'good',
  PRIMARY KEY (time, scenario_id, sensor_guid)
);
CREATE INDEX IF NOT EXISTS scenario_readings_idx ON scenario_readings(scenario_id, sensor_guid, time DESC);

CREATE TABLE IF NOT EXISTS analytics_findings (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind varchar(64) NOT NULL,
  asset_guid varchar(128),
  sensor_guid varchar(128),
  score double precision,
  summary text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_kind_idx ON analytics_findings(kind, created_at DESC);

-- Optional geography columns for PostGIS queries
DO $$
BEGIN
  ALTER TABLE assets ADD COLUMN IF NOT EXISTS geom geography(Point, 4326);
  UPDATE assets
  SET geom = ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography
  WHERE lon IS NOT NULL AND lat IS NOT NULL AND geom IS NULL;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'postgis geom skipped: %', SQLERRM;
END $$;

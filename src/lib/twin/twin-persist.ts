import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb, isDatabaseConfigured, schema } from "@/db";
import type { Alert, SensorReading, TimeSeriesPoint } from "@/lib/twin/types";

const { sensorReadings, alerts, twinEvents, robotState, bmsPoints } = schema;

export function twinDbEnabled() {
  return isDatabaseConfigured() && Boolean(getDb());
}

export async function persistReadings(
  readings: SensorReading[],
  source = "simulator"
) {
  const db = getDb();
  if (!db || !readings.length) return;
  await db
    .insert(sensorReadings)
    .values(
      readings.map((r) => ({
        time: new Date(r.timestamp),
        sensorGuid: r.sensorGuid,
        metric: r.metric,
        value: r.value,
        unit: r.unit,
        quality: r.quality,
        source,
      }))
    )
    .onConflictDoNothing();
}

export async function persistAlerts(list: Alert[]) {
  const db = getDb();
  if (!db) return;
  for (const a of list) {
    await db
      .insert(alerts)
      .values({
        id: a.id,
        severity: a.severity,
        message: a.message,
        assetGuid: a.assetGuid,
        sensorGuid: a.sensorGuid ?? null,
        metric: a.metric ?? null,
        value: a.value ?? null,
        threshold: a.threshold ?? null,
        lon: a.lon ?? null,
        lat: a.lat ?? null,
        height: a.height ?? null,
        acknowledged: a.acknowledged,
        spatial: a.spatial,
        createdAt: new Date(a.timestamp),
        clearedAt: null,
      })
      .onConflictDoUpdate({
        target: alerts.id,
        set: {
          acknowledged: a.acknowledged,
          value: a.value ?? null,
          message: a.message,
        },
      });
  }
}

export async function persistAlertAck(id: string) {
  const db = getDb();
  if (!db) return;
  await db
    .update(alerts)
    .set({ acknowledged: true })
    .where(eq(alerts.id, id));
  await db.insert(twinEvents).values({
    kind: "alert.acknowledged",
    payload: { id },
  });
}

export async function persistRobotState(progress: number, batteryPct: number) {
  const db = getDb();
  if (!db) return;
  await db
    .insert(robotState)
    .values({
      id: 1,
      progress,
      batteryPct,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: robotState.id,
      set: { progress, batteryPct, updatedAt: new Date() },
    });
}

export async function persistBmsValue(
  guid: string,
  value: number | boolean | string
) {
  const db = getDb();
  if (!db) return;
  await db
    .update(bmsPoints)
    .set({ value, updatedAt: new Date() })
    .where(eq(bmsPoints.guid, guid));
}

export async function recordEvent(
  kind: string,
  payload: Record<string, unknown> = {},
  scenarioId?: string
) {
  const db = getDb();
  if (!db) return;
  await db.insert(twinEvents).values({
    kind,
    payload,
    scenarioId: scenarioId ?? null,
  });
}

export async function queryTimeSeries(
  sensorGuid: string,
  from: number,
  to: number
): Promise<TimeSeriesPoint[] | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(sensorReadings)
    .where(
      and(
        eq(sensorReadings.sensorGuid, sensorGuid),
        gte(sensorReadings.time, new Date(from)),
        lte(sensorReadings.time, new Date(to))
      )
    )
    .orderBy(sensorReadings.time);
  return rows.map((r) => ({
    timestamp: r.time.toISOString(),
    sensorGuid: r.sensorGuid,
    metric: r.metric as TimeSeriesPoint["metric"],
    value: r.value,
    quality: r.quality as TimeSeriesPoint["quality"],
  }));
}

export async function latestReadingsAt(
  _at: Date
): Promise<SensorReading[] | null> {
  // Phase 1: time-travel still uses in-memory history; DB powers live writes + timeseries.
  return null;
}

export async function loadActiveAlertsFromDb(): Promise<Alert[] | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(alerts)
    .where(eq(alerts.acknowledged, false))
    .orderBy(desc(alerts.createdAt))
    .limit(40);
  return rows.map((a) => ({
    id: a.id,
    severity: a.severity as Alert["severity"],
    message: a.message,
    assetGuid: a.assetGuid,
    sensorGuid: a.sensorGuid ?? undefined,
    metric: (a.metric as Alert["metric"]) ?? undefined,
    value: a.value ?? undefined,
    threshold: a.threshold ?? undefined,
    lon: a.lon ?? undefined,
    lat: a.lat ?? undefined,
    height: a.height ?? undefined,
    timestamp: a.createdAt.toISOString(),
    acknowledged: a.acknowledged,
    spatial: a.spatial,
  }));
}

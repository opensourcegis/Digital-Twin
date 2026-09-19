/**
 * Phase 4 — Scenario Engine
 * Clone live state → modify variables → simulate → compare Live vs Scenario.
 */
import { getDb, schema } from "@/db";
import { eq } from "drizzle-orm";
import { recordEvent } from "@/lib/twin/twin-persist";
import type { SensorReading, TwinSnapshot } from "@/lib/twin/types";
import { randomUUID } from "crypto";

export interface ScenarioVariables {
  temperatureOffsetC?: number;
  energyMultiplier?: number;
  occupancyMultiplier?: number;
  rainMm?: number;
  durationMinutes?: number;
}

export interface ScenarioSummary {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  variables: ScenarioVariables;
  clonedAt: string;
}

interface MemoryScenario {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  variables: ScenarioVariables;
  clonedAt: Date;
  readings: Array<{
    time: Date;
    sensorGuid: string;
    metric: string;
    value: number;
    unit: string;
    quality: string;
  }>;
}

const memoryScenarios = new Map<string, MemoryScenario>();

export async function listScenarios(): Promise<ScenarioSummary[]> {
  const db = getDb();
  if (db) {
    const rows = await db.select().from(schema.scenarios);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      status: r.status,
      variables: r.variables as ScenarioVariables,
      clonedAt: r.clonedAt.toISOString(),
    }));
  }
  return [...memoryScenarios.values()].map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    status: r.status,
    variables: r.variables,
    clonedAt: r.clonedAt.toISOString(),
  }));
}

export async function cloneLiveToScenario(
  name: string,
  live: TwinSnapshot,
  variables: ScenarioVariables = {},
  description?: string
) {
  const id = `scn-${randomUUID().slice(0, 8)}`;
  const db = getDb();
  const clonedAt = new Date();
  const readings = live.readings.map((r) => ({
    time: new Date(r.timestamp),
    sensorGuid: r.sensorGuid,
    metric: r.metric,
    value: applyVariable(r, variables),
    unit: r.unit,
    quality: r.quality,
  }));

  if (db) {
    await db.insert(schema.scenarios).values({
      id,
      name,
      description: description ?? null,
      clonedAt,
      variables: { ...variables } as Record<string, unknown>,
      status: "ready",
    });
    if (readings.length) {
      await db.insert(schema.scenarioReadings).values(
        readings.map((r) => ({
          time: r.time,
          scenarioId: id,
          sensorGuid: r.sensorGuid,
          metric: r.metric,
          value: r.value,
          unit: r.unit,
          quality: r.quality,
        }))
      );
    }
  } else {
    memoryScenarios.set(id, {
      id,
      name,
      description: description ?? null,
      status: "ready",
      variables,
      clonedAt,
      readings,
    });
  }

  await recordEvent("scenario.cloned", { id, name, variables }, id);
  return { id, name, variables, clonedAt: clonedAt.toISOString() };
}

function applyVariable(r: SensorReading, v: ScenarioVariables): number {
  let value = r.value;
  if (r.metric === "temperature" && v.temperatureOffsetC) {
    value += v.temperatureOffsetC;
  }
  if (r.metric === "energy" && v.energyMultiplier) {
    value *= v.energyMultiplier;
  }
  if (r.metric === "occupancy" && v.occupancyMultiplier) {
    value *= v.occupancyMultiplier;
  }
  if (r.metric === "water_level" && v.rainMm != null) {
    value += v.rainMm * 0.4;
  }
  return Math.round(value * 100) / 100;
}

/** Run a short forward simulation from cloned baseline. */
export async function simulateScenario(
  scenarioId: string,
  steps = 12,
  stepMinutes = 5
) {
  const db = getDb();
  let vars: ScenarioVariables;
  let baseline: Array<{
    sensorGuid: string;
    metric: string;
    value: number;
    unit: string;
  }> = [];

  if (db) {
    const scn = await db
      .select()
      .from(schema.scenarios)
      .where(eq(schema.scenarios.id, scenarioId))
      .limit(1);
    if (!scn[0]) return { ok: false, error: "Scenario not found", points: 0 };
    vars = scn[0].variables as ScenarioVariables;
    baseline = await db
      .select()
      .from(schema.scenarioReadings)
      .where(eq(schema.scenarioReadings.scenarioId, scenarioId))
      .limit(50);
  } else {
    const mem = memoryScenarios.get(scenarioId);
    if (!mem) return { ok: false, error: "Scenario not found", points: 0 };
    vars = mem.variables;
    baseline = mem.readings.slice(0, 50);
  }

  let points = 0;
  const t0 = Date.now();
  for (let i = 1; i <= steps; i++) {
    const t = new Date(t0 + i * stepMinutes * 60_000);
    for (const b of baseline) {
      const drift = (Math.random() - 0.5) * 0.8;
      const reading: SensorReading = {
        sensorGuid: b.sensorGuid,
        metric: b.metric as SensorReading["metric"],
        value: b.value,
        unit: b.unit,
        quality: "good",
        timestamp: t.toISOString(),
      };
      const value = applyVariable(reading, vars) + drift;
      const row = {
        time: t,
        sensorGuid: b.sensorGuid,
        metric: b.metric,
        value: Math.round(value * 100) / 100,
        unit: b.unit,
        quality: "good",
      };
      if (db) {
        await db.insert(schema.scenarioReadings).values({
          ...row,
          scenarioId,
        });
      } else {
        memoryScenarios.get(scenarioId)?.readings.push(row);
      }
      points += 1;
    }
  }

  if (db) {
    await db
      .update(schema.scenarios)
      .set({ status: "simulated" })
      .where(eq(schema.scenarios.id, scenarioId));
  } else {
    const mem = memoryScenarios.get(scenarioId);
    if (mem) mem.status = "simulated";
  }
  await recordEvent("scenario.simulated", { scenarioId, points }, scenarioId);
  return { ok: true, points };
}

export async function compareLiveVsScenario(
  scenarioId: string,
  liveReadings: SensorReading[]
) {
  const db = getDb();
  const comparison: Array<{
    sensorGuid: string;
    metric: string;
    live: number | null;
    scenario: number | null;
    delta: number | null;
  }> = [];

  let scenarioLatest: Array<{
    sensorGuid: string;
    metric: string;
    value: number;
  }> = [];

  const rows = db
    ? await db
        .select()
        .from(schema.scenarioReadings)
        .where(eq(schema.scenarioReadings.scenarioId, scenarioId))
    : (memoryScenarios.get(scenarioId)?.readings ?? []).map((r) => ({
        sensorGuid: r.sensorGuid,
        metric: r.metric,
        value: r.value,
        time: r.time,
      }));

  const bySensor = new Map<
    string,
    { metric: string; value: number; time: number }
  >();
  for (const r of rows) {
    const prev = bySensor.get(r.sensorGuid);
    const t = r.time.getTime();
    if (!prev || t > prev.time) {
      bySensor.set(r.sensorGuid, {
        metric: r.metric,
        value: r.value,
        time: t,
      });
    }
  }
  scenarioLatest = [...bySensor.entries()].map(([sensorGuid, v]) => ({
    sensorGuid,
    metric: v.metric,
    value: v.value,
  }));

  const liveMap = new Map(liveReadings.map((r) => [r.sensorGuid, r]));
  const keys = new Set([
    ...liveMap.keys(),
    ...scenarioLatest.map((s) => s.sensorGuid),
  ]);
  for (const guid of keys) {
    const live = liveMap.get(guid)?.value ?? null;
    const scn = scenarioLatest.find((s) => s.sensorGuid === guid)?.value ?? null;
    comparison.push({
      sensorGuid: guid,
      metric:
        liveMap.get(guid)?.metric ??
        scenarioLatest.find((s) => s.sensorGuid === guid)?.metric ??
        "",
      live,
      scenario: scn,
      delta: live != null && scn != null ? Math.round((scn - live) * 100) / 100 : null,
    });
  }

  return { scenarioId, comparison };
}

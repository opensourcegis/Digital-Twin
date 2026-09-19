/**
 * Phase 5 — Analytics
 * Anomaly detection, predictive maintenance hints, energy/water forecasting.
 */
import { getDb, schema } from "@/db";
import { desc } from "drizzle-orm";
import { recordEvent } from "@/lib/twin/twin-persist";
import type { SensorReading, SensorDefinition } from "@/lib/twin/types";

export interface AnalyticsFinding {
  kind: "anomaly" | "predictive_maintenance" | "forecast";
  assetGuid?: string;
  sensorGuid?: string;
  score?: number;
  summary: string;
  payload?: Record<string, unknown>;
}

export function detectAnomalies(
  readings: SensorReading[],
  sensors: SensorDefinition[]
): AnalyticsFinding[] {
  const findings: AnalyticsFinding[] = [];
  const byGuid = new Map(sensors.map((s) => [s.guid, s]));
  for (const r of readings) {
    const s = byGuid.get(r.sensorGuid);
    if (!s) continue;
    const { warning, critical, direction } = s.thresholds;
    const ratio =
      direction === "high"
        ? (r.value - warning) / Math.max(critical - warning, 1e-6)
        : (warning - r.value) / Math.max(warning - critical, 1e-6);
    if (ratio >= 1) {
      findings.push({
        kind: "anomaly",
        assetGuid: s.assetGuid,
        sensorGuid: r.sensorGuid,
        score: Math.min(1, 0.7 + ratio * 0.2),
        summary: `${s.name}: ${r.metric} ${r.value}${r.unit} beyond critical`,
        payload: { value: r.value, critical, quality: r.quality },
      });
    } else if (ratio >= 0.5) {
      findings.push({
        kind: "anomaly",
        assetGuid: s.assetGuid,
        sensorGuid: r.sensorGuid,
        score: 0.4 + ratio * 0.3,
        summary: `${s.name}: elevated ${r.metric} approaching threshold`,
        payload: { value: r.value, warning },
      });
    }
    if (r.quality === "drift") {
      findings.push({
        kind: "anomaly",
        assetGuid: s.assetGuid,
        sensorGuid: r.sensorGuid,
        score: 0.55,
        summary: `${s.name}: signal drift detected`,
        payload: { quality: r.quality },
      });
    }
  }
  return findings;
}

export function predictiveMaintenance(
  readings: SensorReading[],
  sensors: SensorDefinition[]
): AnalyticsFinding[] {
  const findings: AnalyticsFinding[] = [];
  for (const s of sensors.filter((x) => x.metric === "vibration")) {
    const r = readings.find((x) => x.sensorGuid === s.guid);
    if (!r) continue;
    if (r.value >= s.thresholds.warning) {
      const hoursToRisk = Math.max(
        4,
        Math.round((s.thresholds.critical - r.value) * 18)
      );
      findings.push({
        kind: "predictive_maintenance",
        assetGuid: s.assetGuid,
        sensorGuid: s.guid,
        score: Math.min(0.95, r.value / s.thresholds.critical),
        summary: `${s.name}: recommend inspection within ~${hoursToRisk}h`,
        payload: { vibration: r.value, etaHours: hoursToRisk },
      });
    }
  }
  return findings;
}

/** Naive linear forecast from recent window (demo-grade). */
export function forecastMetric(
  history: Array<{ t: number; v: number }>,
  horizonHours: number,
  label: string
): AnalyticsFinding {
  if (history.length < 2) {
    return {
      kind: "forecast",
      summary: `Insufficient history for ${label} forecast`,
      score: 0,
      payload: { horizonHours },
    };
  }
  const n = history.length;
  const xs = history.map((_, i) => i);
  const ys = history.map((h) => h.v);
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - xMean) * (ys[i]! - yMean);
    den += (xs[i]! - xMean) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;
  const steps = Math.max(1, Math.round((horizonHours * 60) / 5));
  const forecast = intercept + slope * (n - 1 + steps);
  return {
    kind: "forecast",
    summary: `${label} ≈ ${forecast.toFixed(1)} in ${horizonHours}h (trend ${(slope >= 0 ? "+" : "")}${slope.toFixed(3)}/step)`,
    score: Math.min(1, Math.abs(slope) * 10),
    payload: { forecast, slope, intercept, horizonHours },
  };
}

export async function runAnalyticsPass(
  readings: SensorReading[],
  sensors: SensorDefinition[],
  historyByMetric: Record<string, Array<{ t: number; v: number }>> = {}
) {
  const findings = [
    ...detectAnomalies(readings, sensors),
    ...predictiveMaintenance(readings, sensors),
    forecastMetric(historyByMetric.energy ?? [], 6, "Campus energy kW"),
    forecastMetric(historyByMetric.water_level ?? [], 6, "Storm water level"),
  ];

  const db = getDb();
  if (db) {
    for (const f of findings) {
      await db.insert(schema.analyticsFindings).values({
        kind: f.kind,
        assetGuid: f.assetGuid ?? null,
        sensorGuid: f.sensorGuid ?? null,
        score: f.score ?? null,
        summary: f.summary,
        payload: f.payload ?? {},
      });
    }
  }
  await recordEvent("analytics.pass", { count: findings.length });
  return findings;
}

export async function listRecentFindings(limit = 40) {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(schema.analyticsFindings)
    .orderBy(desc(schema.analyticsFindings.createdAt))
    .limit(limit);
}

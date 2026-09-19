import { NextRequest, NextResponse } from "next/server";
import { ensureTwinStoreReady } from "@/lib/twin/twin-store";
import {
  listRecentFindings,
  runAnalyticsPass,
} from "@/lib/analytics/engine";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 40);
  const findings = await listRecentFindings(limit);
  if (findings.length) {
    return NextResponse.json({ source: "database", findings });
  }
  // Compute live without requiring DB
  const store = await ensureTwinStoreReady();
  const snap = store.getSnapshot();
  const sensors = store.getSensors();
  const historyByMetric: Record<string, Array<{ t: number; v: number }>> = {};
  for (const r of snap.readings) {
    const key = r.metric;
    if (!historyByMetric[key]) historyByMetric[key] = [];
    historyByMetric[key]!.push({
      t: new Date(r.timestamp).getTime(),
      v: r.value,
    });
  }
  // Use ring-buffer history for better forecasts
  const series = store.getTimeSeries(
    sensors.find((s) => s.metric === "energy")?.guid ?? "",
    Date.now() - 6 * 3600_000,
    Date.now()
  );
  if (series.length) {
    historyByMetric.energy = series.map((p) => ({
      t: new Date(p.timestamp).getTime(),
      v: p.value,
    }));
  }
  const waterSensor = sensors.find((s) => s.metric === "water_level");
  if (waterSensor) {
    const w = store.getTimeSeries(
      waterSensor.guid,
      Date.now() - 6 * 3600_000,
      Date.now()
    );
    historyByMetric.water_level = w.map((p) => ({
      t: new Date(p.timestamp).getTime(),
      v: p.value,
    }));
  }
  const live = await runAnalyticsPass(snap.readings, sensors, historyByMetric);
  return NextResponse.json({ source: "live", findings: live });
}

export async function POST() {
  const store = await ensureTwinStoreReady();
  const snap = store.getSnapshot();
  const sensors = store.getSensors();
  const historyByMetric: Record<string, Array<{ t: number; v: number }>> = {};
  for (const s of sensors.filter(
    (x) => x.metric === "energy" || x.metric === "water_level"
  )) {
    const pts = store.getTimeSeries(
      s.guid,
      Date.now() - 12 * 3600_000,
      Date.now()
    );
    historyByMetric[s.metric] = pts.map((p) => ({
      t: new Date(p.timestamp).getTime(),
      v: p.value,
    }));
  }
  const findings = await runAnalyticsPass(
    snap.readings,
    sensors,
    historyByMetric
  );
  return NextResponse.json({ count: findings.length, findings });
}

import type {
  Alert,
  BmsPoint,
  SensorDefinition,
  SensorReading,
  SemanticRelation,
  TimeSeriesPoint,
  TwinAsset,
  TwinDocument,
  TwinSnapshot,
  WorkOrder,
} from "./types";

/** In-process twin store with mock MQTT/BACnet/CMMS backends and time-series ring buffer */

const HISTORY_INTERVAL_MS = 5 * 60 * 1000;
const HISTORY_HOURS = 24;

interface StoreSeed {
  assets: TwinAsset[];
  relations: SemanticRelation[];
  sensors: SensorDefinition[];
  workOrders: WorkOrder[];
  bmsPoints: BmsPoint[];
  documents: TwinDocument[];
}

let store: TwinStore | null = null;

export function getTwinStore(): TwinStore {
  if (!store) store = new TwinStore();
  return store;
}

export class TwinStore {
  private assets = new Map<string, TwinAsset>();
  private relations: SemanticRelation[] = [];
  private sensors = new Map<string, SensorDefinition>();
  private sensorByAsset = new Map<string, SensorDefinition[]>();
  private workOrders: WorkOrder[] = [];
  private bmsPoints: BmsPoint[] = [];
  private documents: TwinDocument[] = [];
  private currentReadings = new Map<string, SensorReading>();
  private alerts: Alert[] = [];
  private history: TwinSnapshot[] = [];
  private simStart: number;
  private lastTick: number;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private subscribers = new Set<(snapshot: TwinSnapshot) => void>();
  private robotProgress = 0;
  private robotBattery = 92;
  private driftCounter = 0;

  constructor() {
    this.simStart = Date.now() - HISTORY_HOURS * 3600 * 1000;
    this.lastTick = Date.now();
  }

  async init() {
    const [registry, semantic, sensors, cmms, bms, docs] = await Promise.all([
      fetchSeed<{ assets: TwinAsset[]; site: unknown }>("/demo/asset-registry.json"),
      fetchSeed<{ relations: SemanticRelation[] }>("/demo/semantic-model.json"),
      fetchSeed<{ sensors: SensorDefinition[] }>("/demo/sensors.json"),
      fetchSeed<{ workOrders: WorkOrder[] }>("/demo/cmms-work-orders.json"),
      fetchSeed<{ points: BmsPoint[] }>("/demo/bms-points.json"),
      fetchSeed<{ documents: TwinDocument[] }>("/demo/documents.json"),
    ]);

    for (const a of registry.assets) {
      this.assets.set(a.guid, a);
    }
    this.relations = semantic.relations;
    for (const s of sensors.sensors) {
      this.sensors.set(s.guid, s);
      const list = this.sensorByAsset.get(s.assetGuid) ?? [];
      list.push(s);
      this.sensorByAsset.set(s.assetGuid, list);
    }
    this.workOrders = cmms.workOrders;
    this.bmsPoints = bms.points.map((p) => ({ ...p }));
    this.documents = docs.documents;

    this.seedHistory();
    this.tick(Date.now());
    this.tickInterval = setInterval(() => this.tick(Date.now()), 2000);
  }

  subscribe(cb: (snapshot: TwinSnapshot) => void) {
    this.subscribers.add(cb);
    return () => this.subscribers.delete(cb);
  }

  setRobotProgress(progress: number) {
    this.robotProgress = progress;
  }

  getSnapshot(at?: number): TwinSnapshot {
    const t = at ?? Date.now();
    if (!at || Math.abs(t - Date.now()) < 3000) {
      return this.buildSnapshot(t);
    }
    const snap = this.history.find(
      (h) => Math.abs(new Date(h.timestamp).getTime() - t) < HISTORY_INTERVAL_MS / 2
    );
    return snap ?? this.interpolateSnapshot(t);
  }

  getAssets() {
    return [...this.assets.values()];
  }

  getAsset(guid: string) {
    return this.assets.get(guid);
  }

  /** Merge/upsert assets (Phase 3 IFC import into memory twin). */
  upsertAssets(list: TwinAsset[]) {
    for (const a of list) {
      this.assets.set(a.guid, a);
    }
  }

  getRelations(guid?: string) {
    if (!guid) return this.relations;
    return this.relations.filter(
      (r) => r.subjectGuid === guid || r.objectGuid === guid
    );
  }

  getSensors() {
    return [...this.sensors.values()];
  }

  getWorkOrders(assetGuid?: string) {
    return assetGuid
      ? this.workOrders.filter((w) => w.assetGuid === assetGuid)
      : this.workOrders;
  }

  createWorkOrder(wo: Omit<WorkOrder, "id" | "createdAt">) {
    const order: WorkOrder = {
      ...wo,
      id: `WO-${Date.now().toString(36).toUpperCase()}`,
      createdAt: new Date().toISOString(),
    };
    this.workOrders.unshift(order);
    return order;
  }

  updateWorkOrder(id: string, patch: Partial<WorkOrder>) {
    const idx = this.workOrders.findIndex((w) => w.id === id);
    if (idx < 0) return null;
    this.workOrders[idx] = { ...this.workOrders[idx], ...patch };
    return this.workOrders[idx];
  }

  getBmsPoints(assetGuid?: string) {
    return assetGuid
      ? this.bmsPoints.filter((p) => p.assetGuid === assetGuid)
      : this.bmsPoints;
  }

  setBmsPoint(guid: string, value: number | boolean | string) {
    const pt = this.bmsPoints.find((p) => p.guid === guid);
    if (!pt || !pt.writable) return null;
    pt.value = value;
    void import("./twin-persist")
      .then((m) => m.persistBmsValue(guid, value))
      .catch(() => {});
    return pt;
  }

  getDocuments(assetGuid?: string) {
    return assetGuid
      ? this.documents.filter((d) => d.assetGuid === assetGuid)
      : this.documents;
  }

  getAlerts(at?: number) {
    const snap = this.getSnapshot(at);
    return snap.alerts;
  }

  acknowledgeAlert(id: string) {
    const a = this.alerts.find((x) => x.id === id);
    if (a) a.acknowledged = true;
    void import("./twin-persist").then((m) => m.persistAlertAck(id)).catch(() => {});
    return a;
  }

  getTimeSeries(sensorGuid: string, from: number, to: number): TimeSeriesPoint[] {
    // Prefer DB when available (async callers use getTimeSeriesAsync)
    const points: TimeSeriesPoint[] = [];
    for (const snap of this.history) {
      const ts = new Date(snap.timestamp).getTime();
      if (ts < from || ts > to) continue;
      const r = snap.readings.find((x) => x.sensorGuid === sensorGuid);
      if (r) {
        points.push({
          timestamp: snap.timestamp,
          sensorGuid: r.sensorGuid,
          metric: r.metric,
          value: r.value,
          quality: r.quality,
        });
      }
    }
    return points;
  }

  async getTimeSeriesAsync(
    sensorGuid: string,
    from: number,
    to: number
  ): Promise<TimeSeriesPoint[]> {
    try {
      const { queryTimeSeries, twinDbEnabled } = await import("./twin-persist");
      if (twinDbEnabled()) {
        const rows = await queryTimeSeries(sensorGuid, from, to);
        if (rows && rows.length) return rows;
      }
    } catch {
      /* fall through */
    }
    return this.getTimeSeries(sensorGuid, from, to);
  }

  getSymbology(at?: number) {
    const snap = this.getSnapshot(at);
    const sym: Record<string, { color: string; pulse: boolean }> = {};
    for (const r of snap.readings) {
      const sensor = this.sensors.get(r.sensorGuid);
      if (!sensor) continue;
      const asset = this.assets.get(sensor.assetGuid);
      if (!asset) continue;
      const { warning, critical, direction } = sensor.thresholds;
      let color = "#94a3b8";
      let pulse = false;
      const over =
        direction === "high"
          ? r.value >= critical
            ? "critical"
            : r.value >= warning
              ? "warning"
              : "ok"
          : r.value <= critical
            ? "critical"
            : r.value <= warning
              ? "warning"
              : "ok";
      if (over === "warning") color = "#e2b15a";
      if (over === "critical") {
        color = "#e57373";
        pulse = true;
      }
      // Healthy assets keep architectural finish — only paint buildings on alert
      sym[r.sensorGuid] = { color, pulse };
      if (over !== "ok") {
        sym[asset.guid] = { color, pulse };
      }
    }
    for (const a of snap.alerts.filter((x) => x.severity === "critical")) {
      sym[a.assetGuid] = { color: "#ef4444", pulse: true };
    }
    return sym;
  }

  private async fetchSeedLocal(path: string) {
    const fs = await import("fs/promises");
    const p = `${process.cwd()}/public${path}`;
    const raw = await fs.readFile(p, "utf-8");
    return JSON.parse(raw);
  }

  private seedHistory() {
    const now = Date.now();
    const steps = (HISTORY_HOURS * 3600 * 1000) / HISTORY_INTERVAL_MS;
    for (let i = steps; i >= 0; i--) {
      const t = now - i * HISTORY_INTERVAL_MS;
      this.simulateReadings(t, i / steps);
      const snap = this.buildSnapshot(t);
      this.history.push(snap);
    }
  }

  private tick(now: number) {
    this.driftCounter++;
    this.simulateReadings(now, 1);
    this.evaluateAlerts(now);
    this.simulateBms(now);
    this.updateRobotTelemetry(now);

    const snap = this.buildSnapshot(now);
    this.history.push(snap);
    if (this.history.length > stepsCount() + 2) {
      this.history.shift();
    }
    for (const cb of this.subscribers) cb(snap);
    this.lastTick = now;

    // Phase 1: persist asynchronously when DATABASE_URL is configured
    void this.persistTick(snap);
  }

  private async persistTick(snap: TwinSnapshot) {
    try {
      const {
        twinDbEnabled,
        persistReadings,
        persistAlerts,
        persistRobotState,
        recordEvent,
      } = await import("./twin-persist");
      if (!twinDbEnabled()) return;
      // Downsample writes: every ~5 minutes worth of ticks (~150 at 2s) is heavy;
      // persist every tick for readings but that's ok for demo scale (7 sensors).
      await persistReadings(snap.readings);
      await persistAlerts(this.alerts.slice(0, 20));
      await persistRobotState(snap.robot.progress, snap.robot.batteryPct);
      if (this.driftCounter % 30 === 0) {
        await recordEvent("twin.heartbeat", {
          readings: snap.readings.length,
          alerts: snap.alerts.length,
        });
      }
    } catch (err) {
      console.warn("twin persist failed", err);
    }
  }

  private simulateReadings(now: number, phase: number) {
    const hour = new Date(now).getHours();
    const rush = hour >= 8 && hour <= 18 ? 1 : 0.4;
    const stormPulse = Math.sin(phase * Math.PI * 4) * 0.5 + 0.5;

    for (const sensor of this.sensors.values()) {
      let base = 0;
      let noise = (Math.random() - 0.5) * 2;
      let quality: SensorReading["quality"] = "good";

      switch (sensor.metric) {
        case "temperature":
          base = 22 + rush * 4 + Math.sin(phase * Math.PI * 2) * 2;
          break;
        case "vibration":
          base = 2.2 + rush * 0.8 + (phase > 0.7 ? 2.5 : 0);
          break;
        case "pressure":
          base = 8.2 + Math.sin(phase * Math.PI) * 0.6;
          break;
        case "energy":
          base = 120 + rush * 50 + Math.random() * 20;
          break;
        case "flow":
          base = 40 + stormPulse * 60 + rush * 15;
          break;
        case "occupancy":
          base = Math.round(12 + rush * 28 + Math.random() * 8);
          break;
        case "water_level":
          base = 8 + stormPulse * 18 + (phase > 0.85 ? 12 : 0);
          break;
      }

      if (this.driftCounter % 47 === 0 && sensor.guid === "sens-vib-util-pump") {
        quality = "drift";
        base += 1.5;
      }
      if (this.driftCounter % 83 === 0 && sensor.guid === "sens-flow-storm-b") {
        quality = "timeout";
        base = NaN;
      }

      const value = quality === "timeout" ? this.currentReadings.get(sensor.guid)?.value ?? base : base + noise;

      this.currentReadings.set(sensor.guid, {
        sensorGuid: sensor.guid,
        metric: sensor.metric,
        value: Math.round(value * 100) / 100,
        unit: sensor.unit,
        quality: Number.isNaN(value) ? "timeout" : quality === "good" && Math.abs(noise) > 1.5 ? "interpolated" : quality,
        timestamp: new Date(now).toISOString(),
      });
    }
  }

  private evaluateAlerts(now: number) {
    const activeIds = new Set<string>();
    for (const sensor of this.sensors.values()) {
      const r = this.currentReadings.get(sensor.guid);
      if (!r || r.quality === "timeout") continue;
      const { warning, critical, direction } = sensor.thresholds;
      const asset = this.assets.get(sensor.assetGuid);
      const level =
        direction === "high"
          ? r.value >= critical
            ? "critical"
            : r.value >= warning
              ? "warning"
              : null
          : r.value <= critical
            ? "critical"
            : r.value <= warning
              ? "warning"
              : null;
      if (!level) continue;
      const id = `alert-${sensor.guid}-${level}`;
      activeIds.add(id);
      if (!this.alerts.find((a) => a.id === id && !a.acknowledged)) {
        const spatial = sensor.metric === "water_level" && r.value >= warning;
        this.alerts.unshift({
          id,
          severity: level,
          message: spatial
            ? `${sensor.name}: water ${r.value}${r.unit} above grade threshold`
            : `${sensor.name} ${r.metric} ${r.value}${r.unit} exceeds ${level} threshold`,
          assetGuid: sensor.assetGuid,
          sensorGuid: sensor.guid,
          metric: sensor.metric,
          value: r.value,
          threshold: level === "critical" ? critical : warning,
          lon: sensor.lon,
          lat: sensor.lat,
          height: sensor.height,
          timestamp: new Date(now).toISOString(),
          acknowledged: false,
          spatial: spatial || level === "critical",
        });
      }
    }
    this.alerts = this.alerts.filter((a) => a.acknowledged || activeIds.has(a.id)).slice(0, 40);
  }

  private simulateBms(now: number) {
    const hour = new Date(now).getHours();
    for (const pt of this.bmsPoints) {
      if (pt.system === "hvac" && typeof pt.value === "number") {
        pt.value = Math.round((21 + (hour >= 8 && hour <= 18 ? 3 : 0) + Math.random()) * 10) / 10;
      }
      if (pt.system === "lighting" && typeof pt.value === "boolean") {
        pt.value = hour >= 6 && hour <= 22;
      }
    }
  }

  private async updateRobotTelemetry(_now: number) {
    const criticalNear = this.alerts.filter(
      (a) => a.severity === "critical" && !a.acknowledged
    ).length;
    let drain = 0.05;
    let charge = 0.02;
    try {
      const { getPlatformSettings } = await import(
        "@/lib/platform/settings-store"
      );
      const settings = await getPlatformSettings();
      drain = settings.simulation.batteryDrainPerTick;
      charge = settings.simulation.batteryChargePerTick;
    } catch {
      /* defaults */
    }
    if (criticalNear > 0) {
      this.robotBattery = Math.max(15, this.robotBattery - drain);
    } else {
      this.robotBattery = Math.min(100, this.robotBattery + charge);
    }
  }

  private buildSnapshot(t: number): TwinSnapshot {
    return {
      timestamp: new Date(t).toISOString(),
      readings: [...this.currentReadings.values()],
      alerts: this.alerts.filter((a) => !a.acknowledged),
      bms: this.bmsPoints.map((p) => ({ ...p })),
      robot: {
        progress: this.robotProgress,
        batteryPct: Math.round(this.robotBattery * 10) / 10,
        activeAlerts: this.alerts.filter((a) => !a.acknowledged && a.severity === "critical").length,
      },
    };
  }

  private interpolateSnapshot(t: number): TwinSnapshot {
    const before = [...this.history].reverse().find((h) => new Date(h.timestamp).getTime() <= t);
    const after = this.history.find((h) => new Date(h.timestamp).getTime() >= t);
    return before ?? after ?? this.buildSnapshot(t);
  }
}

function stepsCount() {
  return (HISTORY_HOURS * 3600 * 1000) / HISTORY_INTERVAL_MS;
}

async function fetchSeed<T>(path: string): Promise<T> {
  if (typeof window === "undefined") {
    const fs = await import("fs/promises");
    const raw = await fs.readFile(`${process.cwd()}/public${path}`, "utf-8");
    return JSON.parse(raw) as T;
  }
  const res = await fetch(path);
  return res.json() as Promise<T>;
}

// Server-side init helper
let initPromise: Promise<void> | null = null;
export function ensureTwinStoreReady(): Promise<TwinStore> {
  const s = getTwinStore();
  if (!initPromise) {
    initPromise = s.init();
  }
  return initPromise.then(() => s);
}

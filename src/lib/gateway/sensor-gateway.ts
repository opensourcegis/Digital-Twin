/**
 * Phase 2 — Real Sensor Gateway
 * MQTT ingest + OGC SensorThings adapter with simulator/real switching.
 */
import mqtt, { type MqttClient } from "mqtt";
import { getDb, schema } from "@/db";
import { eq } from "drizzle-orm";
import { persistReadings, recordEvent } from "@/lib/twin/twin-persist";
import type { SensorReading } from "@/lib/twin/types";

export type GatewayMode = "simulator" | "mqtt" | "sensorthings";

export interface GatewayStatus {
  mode: GatewayMode;
  connected: boolean;
  mqttUrl: string | null;
  sensorThingsUrl: string | null;
  lastMessageAt: string | null;
  messagesReceived: number;
}

let client: MqttClient | null = null;
let status: GatewayStatus = {
  mode: (process.env.GATEWAY_MODE as GatewayMode) || "simulator",
  connected: false,
  mqttUrl: process.env.MQTT_URL || null,
  sensorThingsUrl: process.env.SENSOR_THINGS_URL || null,
  lastMessageAt: null,
  messagesReceived: 0,
};

export function getGatewayStatus(): GatewayStatus {
  return { ...status };
}

export async function configureGateway(patch: {
  mode?: GatewayMode;
  mqttUrl?: string | null;
  sensorThingsUrl?: string | null;
}) {
  if (patch.mqttUrl !== undefined) status.mqttUrl = patch.mqttUrl;
  if (patch.sensorThingsUrl !== undefined) {
    status.sensorThingsUrl = patch.sensorThingsUrl;
  }
  if (patch.mode) {
    await setGatewayMode(patch.mode);
    return getGatewayStatus();
  }
  await persistGatewayConfig();
  return getGatewayStatus();
}

async function persistGatewayConfig() {
  const db = getDb();
  if (!db) return;
  await db
    .insert(schema.gatewayConfig)
    .values({
      id: 1,
      mode: status.mode,
      mqttUrl: status.mqttUrl,
      sensorThingsUrl: status.sensorThingsUrl,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.gatewayConfig.id,
      set: {
        mode: status.mode,
        mqttUrl: status.mqttUrl,
        sensorThingsUrl: status.sensorThingsUrl,
        updatedAt: new Date(),
      },
    });
}

export async function setGatewayMode(mode: GatewayMode) {
  status.mode = mode;
  await persistGatewayConfig();
  await recordEvent("gateway.mode", { mode });
  if (mode === "mqtt") await startMqtt();
  else await stopMqtt();
}

export async function startMqtt() {
  if (!status.mqttUrl) {
    status.connected = false;
    return status;
  }
  await stopMqtt();
  client = mqtt.connect(status.mqttUrl, {
    reconnectPeriod: 5000,
    connectTimeout: 10_000,
  });
  client.on("connect", () => {
    status.connected = true;
    client?.subscribe("twinbench/sensors/#");
    void recordEvent("gateway.mqtt.connected", { url: status.mqttUrl });
  });
  client.on("close", () => {
    status.connected = false;
  });
  client.on("message", (_topic, payload) => {
    status.messagesReceived += 1;
    status.lastMessageAt = new Date().toISOString();
    try {
      const msg = JSON.parse(payload.toString()) as Partial<SensorReading> & {
        sensorGuid: string;
        value: number;
        metric: SensorReading["metric"];
      };
      const reading: SensorReading = {
        sensorGuid: msg.sensorGuid,
        metric: msg.metric,
        value: msg.value,
        unit: msg.unit ?? "",
        quality: msg.quality ?? "good",
        timestamp: msg.timestamp ?? new Date().toISOString(),
      };
      void persistReadings([reading], "mqtt");
    } catch (err) {
      console.warn("MQTT payload parse failed", err);
    }
  });
  return status;
}

export async function stopMqtt() {
  if (client) {
    await new Promise<void>((resolve) => {
      client?.end(false, {}, () => resolve());
    });
    client = null;
  }
  status.connected = false;
}

/** OGC SensorThings Observations pull (Phase 2). */
export async function pullSensorThings(limit = 50) {
  if (!status.sensorThingsUrl) {
    return { ok: false, error: "SENSOR_THINGS_URL not configured", count: 0 };
  }
  const url = `${status.sensorThingsUrl.replace(/\/$/, "")}/Observations?$top=${limit}&$orderby=phenomenonTime desc`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    return { ok: false, error: `SensorThings ${res.status}`, count: 0 };
  }
  const data = (await res.json()) as {
    value?: Array<{
      phenomenonTime?: string;
      result?: number;
      "Datastream@iot.navigationLink"?: string;
      Datastream?: { "@iot.id"?: string | number };
    }>;
  };
  const readings: SensorReading[] = [];
  for (const obs of data.value ?? []) {
    const ds = String(obs.Datastream?.["@iot.id"] ?? "unknown");
    readings.push({
      sensorGuid: `sta-${ds}`,
      metric: "temperature",
      value: Number(obs.result ?? 0),
      unit: "",
      quality: "good",
      timestamp: obs.phenomenonTime ?? new Date().toISOString(),
    });
  }
  if (readings.length) await persistReadings(readings, "sensorthings");
  status.lastMessageAt = new Date().toISOString();
  status.messagesReceived += readings.length;
  await recordEvent("gateway.sensorthings.pull", { count: readings.length });
  return { ok: true, count: readings.length };
}

export async function loadGatewayConfigFromDb() {
  const db = getDb();
  if (!db) return;
  const rows = await db
    .select()
    .from(schema.gatewayConfig)
    .where(eq(schema.gatewayConfig.id, 1))
    .limit(1);
  const row = rows[0];
  if (!row) return;
  status.mode = row.mode as GatewayMode;
  status.mqttUrl = row.mqttUrl;
  status.sensorThingsUrl = row.sensorThingsUrl;
}

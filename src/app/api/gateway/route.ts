import { NextRequest, NextResponse } from "next/server";
import {
  configureGateway,
  getGatewayStatus,
  loadGatewayConfigFromDb,
  startMqtt,
  stopMqtt,
  type GatewayMode,
} from "@/lib/gateway/sensor-gateway";

export const dynamic = "force-dynamic";

const MODES: GatewayMode[] = ["simulator", "mqtt", "sensorthings"];

export async function GET() {
  await loadGatewayConfigFromDb().catch(() => {});
  return NextResponse.json({ status: getGatewayStatus() });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    mode?: GatewayMode;
    action?: "start" | "stop";
    mqttUrl?: string | null;
    sensorThingsUrl?: string | null;
  };

  if (body.mode && !MODES.includes(body.mode)) {
    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  }

  await configureGateway({
    mode: body.mode,
    mqttUrl: body.mqttUrl,
    sensorThingsUrl: body.sensorThingsUrl,
  });

  if (body.action === "start") await startMqtt();
  if (body.action === "stop") await stopMqtt();

  return NextResponse.json({ status: getGatewayStatus() });
}

import { NextRequest, NextResponse } from "next/server";
import { ensureTwinStoreReady } from "@/lib/twin/twin-store";
import {
  cloneLiveToScenario,
  listScenarios,
  type ScenarioVariables,
} from "@/lib/scenario/engine";

export const dynamic = "force-dynamic";

export async function GET() {
  const scenarios = await listScenarios();
  return NextResponse.json({ scenarios });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    name?: string;
    description?: string;
    variables?: ScenarioVariables;
  };
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const store = await ensureTwinStoreReady();
  const live = store.getSnapshot();
  const created = await cloneLiveToScenario(
    body.name.trim(),
    live,
    body.variables ?? {},
    body.description
  );
  return NextResponse.json(created);
}

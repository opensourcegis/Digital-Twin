import { NextResponse } from "next/server";
import { ensureTwinStoreReady } from "@/lib/twin/twin-store";
import { compareLiveVsScenario } from "@/lib/scenario/engine";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const store = await ensureTwinStoreReady();
  const live = store.getSnapshot();
  const result = await compareLiveVsScenario(id, live.readings);
  return NextResponse.json(result);
}

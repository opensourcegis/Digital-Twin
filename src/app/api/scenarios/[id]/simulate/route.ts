import { NextRequest, NextResponse } from "next/server";
import { simulateScenario } from "@/lib/scenario/engine";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    steps?: number;
    stepMinutes?: number;
  };
  const result = await simulateScenario(
    id,
    body.steps ?? 12,
    body.stepMinutes ?? 5
  );
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

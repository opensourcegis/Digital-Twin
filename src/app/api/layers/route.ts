import { NextResponse } from "next/server";
import { listLayers } from "@/lib/layers/layer-store";

export async function GET() {
  const layers = await listLayers();
  return NextResponse.json({ layers });
}

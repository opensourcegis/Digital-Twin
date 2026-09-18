import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, unauthorized } from "@/lib/admin/session";
import {
  createLayer,
  deleteLayer,
  listLayers,
  reorderLayers,
  updateLayer,
} from "@/lib/layers/layer-store";
import type { LayerCreateInput, LayerUpdateInput } from "@/lib/layers/types";

export async function GET() {
  if (!(await getAdminSession())) return unauthorized();
  const layers = await listLayers();
  return NextResponse.json({ layers });
}

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) return unauthorized();
  const body = await req.json();
  if (body.action === "reorder" && Array.isArray(body.ids)) {
    const layers = await reorderLayers(body.ids);
    return NextResponse.json({ layers });
  }
  const layer = await createLayer(body as LayerCreateInput);
  return NextResponse.json({ layer }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  if (!(await getAdminSession())) return unauthorized();
  const body = await req.json();
  if (body.action === "reorder" && Array.isArray(body.ids)) {
    const layers = await reorderLayers(body.ids);
    return NextResponse.json({ layers });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

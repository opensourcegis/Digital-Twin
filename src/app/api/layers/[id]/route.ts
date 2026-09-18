import { NextRequest, NextResponse } from "next/server";
import { getLayer, updateLayer } from "@/lib/layers/layer-store";

/** Public visibility toggle for in-viewer layer panel (no auth) */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  if (typeof body.visible !== "boolean") {
    return NextResponse.json({ error: "visible boolean required" }, { status: 400 });
  }
  const existing = await getLayer(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const layer = await updateLayer(id, { visible: body.visible });
  return NextResponse.json({ layer });
}

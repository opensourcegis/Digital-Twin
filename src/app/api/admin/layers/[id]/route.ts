import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, unauthorized } from "@/lib/admin/session";
import { deleteLayer, getLayer, updateLayer } from "@/lib/layers/layer-store";
import type { LayerUpdateInput } from "@/lib/layers/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await getAdminSession())) return unauthorized();
  const { id } = await params;
  const layer = await getLayer(id);
  if (!layer) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ layer });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await getAdminSession())) return unauthorized();
  const { id } = await params;
  const patch = (await req.json()) as LayerUpdateInput;
  const layer = await updateLayer(id, patch);
  if (!layer) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ layer });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await getAdminSession())) return unauthorized();
  const { id } = await params;
  const ok = await deleteLayer(id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

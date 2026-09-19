import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, unauthorized } from "@/lib/admin/session";
import { listLayers, updateLayer } from "@/lib/layers/layer-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads", "tilesets");

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^\.+/, "") || "file";
}

export async function GET() {
  if (!(await getAdminSession())) return unauthorized();
  const layers = await listLayers();
  const tiles = layers.filter(
    (l) => l.category === "tiles-3d" || l.builtInKey === "tileset"
  );
  let uploads: string[] = [];
  try {
    const entries = await fs.readdir(UPLOAD_ROOT, { withFileTypes: true });
    uploads = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    uploads = [];
  }
  return NextResponse.json({ tiles, uploads });
}

/**
 * Upload a local 3D Tiles package:
 * - multipart field `tileset` = tileset.json (required)
 * - multipart field `files` = companion tile files (.b3dm, .i3dm, .pnts, .cmpt, .glb, …)
 * Creates /uploads/tilesets/<id>/ and updates the built-in tileset layer dataSource.
 */
export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) return unauthorized();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart form data" },
      { status: 400 }
    );
  }

  const tilesetEntry = form.get("tileset");
  if (!(tilesetEntry instanceof File)) {
    return NextResponse.json(
      { error: "Missing tileset.json file (field name: tileset)" },
      { status: 400 }
    );
  }

  const nameHint =
    typeof form.get("name") === "string"
      ? String(form.get("name")).trim()
      : "";
  const id = randomUUID().slice(0, 8);
  const dir = path.join(UPLOAD_ROOT, id);
  await ensureDir(dir);

  const tilesetBuf = Buffer.from(await tilesetEntry.arrayBuffer());
  try {
    JSON.parse(tilesetBuf.toString("utf8"));
  } catch {
    return NextResponse.json(
      { error: "tileset field must be valid JSON (tileset.json)" },
      { status: 400 }
    );
  }
  await fs.writeFile(path.join(dir, "tileset.json"), tilesetBuf);

  const companions = form.getAll("files");
  let companionCount = 0;
  for (const entry of companions) {
    if (!(entry instanceof File)) continue;
    if (!entry.name || entry.name.toLowerCase() === "tileset.json") continue;
    const dest = path.join(dir, safeName(entry.name));
    await fs.writeFile(dest, Buffer.from(await entry.arrayBuffer()));
    companionCount += 1;
  }

  const publicUrl = `/uploads/tilesets/${id}/tileset.json`;
  const layers = await listLayers();
  const tilesetLayer =
    layers.find((l) => l.builtInKey === "tileset") ??
    layers.find((l) => l.category === "tiles-3d");

  let layer = tilesetLayer ?? null;
  if (tilesetLayer) {
    layer = await updateLayer(tilesetLayer.id, {
      dataSource: publicUrl,
      visible: true,
      enabled: true,
      name: nameHint || tilesetLayer.name || "Uploaded 3D Tiles",
      description: `Local tileset uploaded ${new Date().toISOString()}`,
    });
  }

  return NextResponse.json(
    {
      url: publicUrl,
      id,
      companionCount,
      layer,
    },
    { status: 201 }
  );
}

/** Point the platform tileset layer at an existing URL without uploading. */
export async function PUT(req: NextRequest) {
  if (!(await getAdminSession())) return unauthorized();
  let body: { url?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const url = body.url?.trim();
  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  const layers = await listLayers();
  const tilesetLayer =
    layers.find((l) => l.builtInKey === "tileset") ??
    layers.find((l) => l.category === "tiles-3d");
  if (!tilesetLayer) {
    return NextResponse.json(
      { error: "No tiles-3d layer configured" },
      { status: 404 }
    );
  }

  const layer = await updateLayer(tilesetLayer.id, {
    dataSource: url,
    visible: true,
    enabled: true,
    ...(body.name ? { name: body.name } : {}),
  });

  return NextResponse.json({ layer, url });
}

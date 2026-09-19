import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 64 * 1024 * 1024; // 64 MiB — large mesh tiles
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Same-origin proxy for external 3D Tiles (tileset.json + tile payloads).
 * Cesium DefaultProxy hits: /api/tiles-proxy?url=<encoded absolute URL>
 * Bypasses hosts that omit Access-Control-Allow-Origin.
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("url");
  if (!raw) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (!ALLOWED_PROTOCOLS.has(target.protocol)) {
    return NextResponse.json({ error: "Only http(s) URLs allowed" }, { status: 400 });
  }

  // Block obvious SSRF to link-local / metadata
  const host = target.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".local") ||
    host.startsWith("169.254.") ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
    host === "metadata.google.internal"
  ) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      headers: {
        Accept: "*/*",
        "User-Agent": "TwinBench-tiles-proxy/1.0",
      },
      redirect: "follow",
      cache: "no-store",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Upstream fetch failed", detail: msg },
      { status: 502 }
    );
  }

  if (!upstream.ok) {
    return NextResponse.json(
      {
        error: `Upstream ${upstream.status}`,
        detail: target.toString(),
      },
      { status: upstream.status === 404 ? 404 : 502 }
    );
  }

  const lenHeader = upstream.headers.get("content-length");
  if (lenHeader && Number(lenHeader) > MAX_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  const buf = Buffer.from(await upstream.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  const contentType =
    upstream.headers.get("content-type") ||
    guessContentType(target.pathname) ||
    "application/octet-stream";

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function guessContentType(pathname: string): string | null {
  const lower = pathname.toLowerCase();
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".b3dm")) return "application/octet-stream";
  if (lower.endsWith(".i3dm")) return "application/octet-stream";
  if (lower.endsWith(".pnts")) return "application/octet-stream";
  if (lower.endsWith(".cmpt")) return "application/octet-stream";
  if (lower.endsWith(".glb")) return "model/gltf-binary";
  if (lower.endsWith(".gltf")) return "model/gltf+json";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return null;
}

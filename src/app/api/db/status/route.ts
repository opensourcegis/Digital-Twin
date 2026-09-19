import { NextResponse } from "next/server";
import { getDatabaseUrl, isDatabaseConfigured, getDb } from "@/db";
import { getGatewayStatus } from "@/lib/gateway/sensor-gateway";

export const dynamic = "force-dynamic";

export async function GET() {
  const configured = isDatabaseConfigured();
  let reachable = false;
  let error: string | null = null;
  if (configured) {
    try {
      const db = getDb();
      if (db) {
        // lightweight ping via raw query through drizzle's client is awkward;
        // attempt a schema select instead
        const { schema } = await import("@/db");
        await db.select().from(schema.sites).limit(1);
        reachable = true;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  const gw = getGatewayStatus();
  return NextResponse.json({
    phase: 1,
    persistence: {
      configured,
      reachable,
      error,
      // never return full credentials
      urlHost: configured
        ? (() => {
            try {
              return new URL(getDatabaseUrl()!).host;
            } catch {
              return "configured";
            }
          })()
        : null,
    },
    gateway: {
      mode: gw.mode,
      connected: gw.connected,
    },
    note: configured
      ? "Postgres/PostGIS persistence active"
      : "Memory twin fallback — set DATABASE_URL for Phase 1 persistence",
  });
}

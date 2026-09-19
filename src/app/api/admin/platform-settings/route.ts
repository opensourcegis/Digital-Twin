import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, unauthorized } from "@/lib/admin/session";
import {
  getPlatformSettings,
  updatePlatformSettings,
} from "@/lib/platform/settings-store";
import type {
  BrandingSettings,
  DockModuleConfig,
  GisAnalysisSettings,
  InformaticsSettings,
  ShellSettings,
  SimulationSettings,
} from "@/lib/platform/types";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getAdminSession())) return unauthorized();
  const settings = await getPlatformSettings();
  return NextResponse.json({ settings });
}

export async function PUT(req: NextRequest) {
  if (!(await getAdminSession())) return unauthorized();
  let body: {
    branding?: Partial<BrandingSettings>;
    shell?: Partial<ShellSettings> & { modules?: DockModuleConfig[] };
    simulation?: Partial<SimulationSettings>;
    informatics?: Partial<InformaticsSettings>;
    gis?: Partial<GisAnalysisSettings>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const settings = await updatePlatformSettings(body);
    return NextResponse.json({ settings });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}

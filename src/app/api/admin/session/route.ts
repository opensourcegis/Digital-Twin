import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_PASSWORD,
  clearAdminSession,
  getAdminSession,
  setAdminSession,
} from "@/lib/admin/session";

export async function GET() {
  const ok = await getAdminSession();
  return NextResponse.json({ authenticated: ok });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (body.action === "logout") {
    await clearAdminSession();
    return NextResponse.json({ ok: true });
  }
  if (body.password === ADMIN_PASSWORD) {
    await setAdminSession();
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Invalid password" }, { status: 401 });
}

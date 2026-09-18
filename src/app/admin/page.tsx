import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin/session";
import { LayerAdminDashboard } from "@/components/admin/LayerAdminDashboard";

export default async function AdminPage() {
  const ok = await getAdminSession();
  if (!ok) redirect("/admin/login");
  return <LayerAdminDashboard />;
}

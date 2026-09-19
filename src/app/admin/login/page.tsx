import { Suspense } from "react";
import AdminLoginForm from "./login-form";

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-[100dvh] place-items-center bg-[#0b1220] text-slate-400">
          Loading…
        </div>
      }
    >
      <AdminLoginForm />
    </Suspense>
  );
}

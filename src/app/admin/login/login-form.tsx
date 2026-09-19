"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

export default function AdminLoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError("Invalid password");
        return;
      }
      const next = search.get("next");
      const dest =
        next && next.startsWith("/admin") && !next.startsWith("/admin/login")
          ? next
          : "/admin";
      router.push(dest);
      router.refresh();
    } catch {
      setError("Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-[100dvh] place-items-center bg-[#0b1220] px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-500/20 text-violet-300">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-xl text-white">Admin sign-in</h1>
            <p className="text-xs text-slate-400">
              Password required to manage TwinBench
            </p>
          </div>
        </div>
        <label className="block text-sm text-slate-400">
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-violet-400/40"
          />
        </label>
        {process.env.NODE_ENV === "development" && (
          <p className="mt-2 text-[10px] text-slate-500">
            Dev default: <code className="text-violet-300">twinbench</code>{" "}
            (set <code>ADMIN_PASSWORD</code> in production)
          </p>
        )}
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        <Button
          className="mt-4 w-full"
          type="submit"
          disabled={loading || !password}
        >
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}

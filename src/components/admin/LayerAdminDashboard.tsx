"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  Layers,
  LogOut,
  Pencil,
  Plus,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { LayerConfig, LayerCategory } from "@/lib/layers/types";
import { LAYER_CATEGORY_LABELS, DEFAULT_LAYER_STYLE } from "@/lib/layers/types";
import { LayerFormDialog } from "@/components/admin/LayerFormDialog";
import { WeatherAdminPanel } from "@/components/admin/WeatherAdminPanel";

export function LayerAdminDashboard() {
  const [layers, setLayers] = useState<LayerConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<LayerConfig | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/layers");
      if (res.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      if (!res.ok) throw new Error(`Failed to load layers (${res.status})`);
      const data = await res.json();
      setLayers(data.layers);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const logout = async () => {
    await fetch("/api/admin/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    window.location.href = "/admin/login";
  };

  const move = async (id: string, dir: -1 | 1) => {
    const idx = layers.findIndex((l) => l.id === id);
    if (idx < 0) return;
    const next = idx + dir;
    if (next < 0 || next >= layers.length) return;
    const ids = layers.map((l) => l.id);
    [ids[idx], ids[next]] = [ids[next], ids[idx]];
    setSaving(true);
    try {
      const res = await fetch("/api/admin/layers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reorder", ids }),
      });
      const data = await res.json();
      setLayers(data.layers);
    } finally {
      setSaving(false);
    }
  };

  const toggleField = async (layer: LayerConfig, field: "enabled" | "visible") => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/layers/${layer.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: !layer[field] }),
      });
      const data = await res.json();
      setLayers((ls) => ls.map((l) => (l.id === layer.id ? data.layer : l)));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this layer?")) return;
    setSaving(true);
    try {
      await fetch(`/api/admin/layers/${id}`, { method: "DELETE" });
      setLayers((ls) => ls.filter((l) => l.id !== id));
    } finally {
      setSaving(false);
    }
  };

  const saveLayer = async (payload: Partial<LayerConfig>, id?: string) => {
    setSaving(true);
    try {
      const res = await fetch(id ? `/api/admin/layers/${id}` : "/api/admin/layers", {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      await load();
      setEditing(null);
      setCreating(false);
    } catch (e) {
      alert(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#0b1220] text-slate-100">
      <header className="border-b border-white/10 bg-[#0b1220]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-6">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-violet-400 to-indigo-600 text-slate-950">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-xl text-white">Admin</h1>
              <p className="text-xs text-slate-400">
                Layers · live weather API · twin settings
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary" size="sm">
              <Link href="/" target="_blank">
                <ExternalLink className="h-4 w-4" />
                Preview globe
              </Link>
            </Button>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              New layer
            </Button>
            <Button size="sm" variant="ghost" onClick={logout}>
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-6 md:px-6">
        <WeatherAdminPanel />

        <div>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-lg text-white">Layer catalog</h2>
              <p className="text-xs text-slate-500">
                Spatial layers for the twin globe
              </p>
            </div>
          </div>

          {loading && (
            <div className="grid place-items-center py-24 text-slate-400">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
              <p className="mt-3 text-sm">Loading layer catalog…</p>
            </div>
          )}

          {!loading && error && (
            <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-red-200">
              <p className="font-medium">Failed to load layers</p>
              <p className="mt-1 text-sm">{error}</p>
              <Button className="mt-3" size="sm" onClick={load}>
                Retry
              </Button>
            </div>
          )}

          {!loading && !error && layers.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
              <p className="text-slate-300">No layers configured yet.</p>
              <Button className="mt-4" onClick={() => setCreating(true)}>
                Create first layer
              </Button>
            </div>
          )}

          {!loading && !error && layers.length > 0 && (
            <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
              <ScrollArea className="h-[min(70vh,720px)] rounded-2xl border border-white/10 bg-white/[0.02]">
                <div className="divide-y divide-white/5">
                  {layers.map((layer, index) => (
                    <div
                      key={layer.id}
                      className={cn(
                        "flex flex-col gap-3 p-4 sm:flex-row sm:items-center",
                        !layer.enabled && "opacity-60"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: layer.style.fillColor }}
                          />
                          <p className="font-medium text-white">{layer.name}</p>
                          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-slate-300">
                            {LAYER_CATEGORY_LABELS[layer.category as LayerCategory]}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-400">{layer.description}</p>
                        <p className="mt-1 text-[10px] text-slate-500">
                          z={layer.zOrder} · {layer.coordinateSystem} · opacity{" "}
                          {Math.round(layer.opacity * 100)}%
                          {layer.builtInKey ? ` · built-in:${layer.builtInKey}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        <Button
                          size="sm"
                          variant={layer.enabled ? "default" : "secondary"}
                          onClick={() => toggleField(layer, "enabled")}
                          disabled={saving}
                        >
                          {layer.enabled ? "Enabled" : "Disabled"}
                        </Button>
                        <Button
                          size="sm"
                          variant={layer.visible ? "secondary" : "ghost"}
                          onClick={() => toggleField(layer, "visible")}
                          disabled={saving || !layer.enabled}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          {layer.visible ? "Visible" : "Hidden"}
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => move(layer.id, -1)} disabled={index === 0 || saving}>
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => move(layer.id, 1)}
                          disabled={index === layers.length - 1 || saving}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setEditing(layer)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => remove(layer.id)}
                          disabled={!!layer.builtInKey && layers.filter((l) => l.builtInKey).length <= 3}
                        >
                          <Trash2 className="h-4 w-4 text-red-400" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <aside className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
                <p className="font-medium text-white">Catalog summary</p>
                <ul className="mt-3 space-y-2 text-xs text-slate-400">
                  <li>{layers.length} total layers</li>
                  <li>{layers.filter((l) => l.enabled).length} enabled</li>
                  <li>{layers.filter((l) => l.visible && l.enabled).length} visible on globe</li>
                  <li>{layers.filter((l) => !l.builtInKey).length} custom layers</li>
                </ul>
                <p className="mt-4 text-xs leading-relaxed text-slate-500">
                  Changes persist to <code className="text-violet-300">data/layers.json</code>.
                  Toggle visibility here, then refresh the main viewer tab if it is already open.
                </p>
              </aside>
            </div>
          )}
        </div>
      </main>

      {(creating || editing) && (
        <LayerFormDialog
          layer={editing ?? undefined}
          open
          saving={saving}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSave={(payload) => saveLayer(payload, editing?.id)}
          defaultStyle={DEFAULT_LAYER_STYLE}
        />
      )}
    </div>
  );
}

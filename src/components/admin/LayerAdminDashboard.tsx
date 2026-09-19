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
  LayoutDashboard,
  Palette,
  Bot,
  Radio,
  CloudRain,
  Box,
  Map,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { LayerConfig, LayerCategory } from "@/lib/layers/types";
import { LAYER_CATEGORY_LABELS, DEFAULT_LAYER_STYLE } from "@/lib/layers/types";
import { LayerFormDialog } from "@/components/admin/LayerFormDialog";
import { WeatherAdminPanel } from "@/components/admin/WeatherAdminPanel";
import { TilesetAdminPanel } from "@/components/admin/TilesetAdminPanel";
import { PlatformDesignAdminPanel } from "@/components/admin/PlatformDesignAdminPanel";
import { PersistentTwinAdminPanel } from "@/components/admin/PersistentTwinAdminPanel";
import { BrandingShellAdminPanel } from "@/components/admin/BrandingShellAdminPanel";

type NavId =
  | "overview"
  | "brand"
  | "platform"
  | "integrations"
  | "weather"
  | "tiles"
  | "layers";

const NAV: Array<{ id: NavId; label: string; icon: typeof LayoutDashboard; blurb: string }> = [
  {
    id: "overview",
    label: "Overview",
    icon: LayoutDashboard,
    blurb: "Commercial control center",
  },
  {
    id: "brand",
    label: "Brand & UI",
    icon: Palette,
    blurb: "Name, dock, chrome",
  },
  {
    id: "platform",
    label: "Platform design",
    icon: Bot,
    blurb: "Sim · COP · GIS",
  },
  {
    id: "integrations",
    label: "Integrations",
    icon: Radio,
    blurb: "DB · MQTT · BIM · analytics",
  },
  {
    id: "weather",
    label: "Weather",
    icon: CloudRain,
    blurb: "Open-Meteo API",
  },
  {
    id: "tiles",
    label: "3D Tiles",
    icon: Box,
    blurb: "Upload / URL",
  },
  {
    id: "layers",
    label: "Layers",
    icon: Map,
    blurb: "Spatial catalog",
  },
];

export function LayerAdminDashboard() {
  const [nav, setNav] = useState<NavId>("overview");
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

  const toggleField = async (
    layer: LayerConfig,
    field: "enabled" | "visible"
  ) => {
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
      const res = await fetch(
        id ? `/api/admin/layers/${id}` : "/api/admin/layers",
        {
          method: id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
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
    <div className="min-h-[100dvh] bg-[#070c14] text-slate-100">
      <div className="flex min-h-[100dvh]">
        <aside className="hidden w-60 shrink-0 flex-col border-r border-white/10 bg-[#0a1018] md:flex">
          <div className="border-b border-white/10 px-4 py-5">
            <p className="font-display text-lg text-white">Control Center</p>
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
              TwinBench platform
            </p>
          </div>
          <nav className="flex-1 space-y-0.5 p-2">
            {NAV.map(({ id, label, icon: Icon, blurb }) => (
              <button
                key={id}
                type="button"
                onClick={() => setNav(id)}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition",
                  nav === id
                    ? "bg-teal-400/12 text-teal-50"
                    : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                )}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="block text-[10px] text-slate-500">
                    {blurb}
                  </span>
                </span>
              </button>
            ))}
          </nav>
          <div className="space-y-2 border-t border-white/10 p-3">
            <Button asChild variant="secondary" size="sm" className="w-full">
              <Link href="/" target="_blank">
                <ExternalLink className="h-4 w-4" />
                Open twin
              </Link>
            </Button>
            <Button size="sm" variant="ghost" className="w-full" onClick={logout}>
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-white/10 bg-[#0b1220]/90 backdrop-blur-xl">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-6">
              <div className="flex items-center gap-3 md:hidden">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-teal-300 to-slate-500 text-slate-950">
                  <Layers className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="font-display text-xl text-white">
                    Control Center
                  </h1>
                  <p className="text-xs text-slate-400">Mobile · pick a section</p>
                </div>
              </div>
              <div className="hidden md:block">
                <h1 className="font-display text-xl text-white">
                  {NAV.find((n) => n.id === nav)?.label}
                </h1>
                <p className="text-xs text-slate-500">
                  {NAV.find((n) => n.id === nav)?.blurb} · changes apply to the
                  live twin
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="secondary" size="sm" className="md:hidden">
                  <Link href="/" target="_blank">
                    <ExternalLink className="h-4 w-4" />
                    Twin
                  </Link>
                </Button>
                {nav === "layers" && (
                  <Button size="sm" onClick={() => setCreating(true)}>
                    <Plus className="h-4 w-4" />
                    New layer
                  </Button>
                )}
              </div>
            </div>
            <div className="flex gap-1 overflow-x-auto px-3 pb-3 md:hidden">
              {NAV.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setNav(id)}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1 text-xs",
                    nav === id
                      ? "bg-teal-400/20 text-teal-100"
                      : "bg-white/5 text-slate-400"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </header>

          <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-6 md:px-6">
            {nav === "overview" && (
              <div className="space-y-4">
                <p className="max-w-2xl text-sm text-slate-400">
                  Configure the commercial twin from one dashboard: branding,
                  dock modules, simulation, COP widgets, GIS tools, sensor
                  gateway, BIM, scenarios, weather, tiles, and layers. Save in
                  each section — the globe reads settings live.
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {NAV.filter((n) => n.id !== "overview").map(
                    ({ id, label, icon: Icon, blurb }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setNav(id)}
                        className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-teal-400/30 hover:bg-teal-400/[0.06]"
                      >
                        <Icon className="mb-2 h-5 w-5 text-teal-300" />
                        <p className="font-medium text-white">{label}</p>
                        <p className="mt-1 text-xs text-slate-500">{blurb}</p>
                      </button>
                    )
                  )}
                </div>
              </div>
            )}

            {nav === "brand" && <BrandingShellAdminPanel embedded />}
            {nav === "platform" && <PlatformDesignAdminPanel />}
            {nav === "integrations" && <PersistentTwinAdminPanel />}
            {nav === "weather" && <WeatherAdminPanel />}
            {nav === "tiles" && <TilesetAdminPanel />}

            {nav === "layers" && (
              <div>
                {loading && (
                  <div className="grid place-items-center py-24 text-slate-400">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-400 border-t-transparent" />
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
                  <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
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
                                  style={{
                                    backgroundColor: layer.style.fillColor,
                                  }}
                                />
                                <p className="font-medium text-white">
                                  {layer.name}
                                </p>
                                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-slate-300">
                                  {
                                    LAYER_CATEGORY_LABELS[
                                      layer.category as LayerCategory
                                    ]
                                  }
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-slate-400">
                                {layer.description}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-1">
                              <Button
                                size="sm"
                                variant={
                                  layer.enabled ? "default" : "secondary"
                                }
                                onClick={() => toggleField(layer, "enabled")}
                                disabled={saving}
                              >
                                {layer.enabled ? "Enabled" : "Disabled"}
                              </Button>
                              <Button
                                size="sm"
                                variant={
                                  layer.visible ? "secondary" : "ghost"
                                }
                                onClick={() => toggleField(layer, "visible")}
                                disabled={saving || !layer.enabled}
                              >
                                <Eye className="h-3.5 w-3.5" />
                                {layer.visible ? "Visible" : "Hidden"}
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => move(layer.id, -1)}
                                disabled={index === 0 || saving}
                              >
                                <ArrowUp className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => move(layer.id, 1)}
                                disabled={
                                  index === layers.length - 1 || saving
                                }
                              >
                                <ArrowDown className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => setEditing(layer)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => remove(layer.id)}
                                disabled={
                                  !!layer.builtInKey &&
                                  layers.filter((l) => l.builtInKey).length <=
                                    3
                                }
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
                        <li>
                          {layers.filter((l) => l.enabled).length} enabled
                        </li>
                        <li>
                          {
                            layers.filter((l) => l.visible && l.enabled)
                              .length
                          }{" "}
                          visible on globe
                        </li>
                      </ul>
                    </aside>
                  </div>
                )}
              </div>
            )}
          </main>
        </div>
      </div>

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

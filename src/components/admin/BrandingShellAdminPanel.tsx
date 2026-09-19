"use client";

import { useCallback, useEffect, useState } from "react";
import { Palette, LayoutGrid, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_BRANDING,
  DEFAULT_SHELL,
  DOCK_MODULE_IDS,
  type BrandingSettings,
  type DockModuleConfig,
  type DockModuleId,
  type PlatformSettings,
  type ShellSettings,
} from "@/lib/platform/types";

const fieldClass =
  "mt-1 w-full rounded-lg border border-white/10 bg-[#0a1018] px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-400/40";

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
      <input
        type="checkbox"
        className="h-4 w-4 accent-teal-400"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

type SubTab = "brand" | "shell";

export function BrandingShellAdminPanel({
  embedded,
}: {
  embedded?: boolean;
}) {
  const [sub, setSub] = useState<SubTab>("brand");
  const [branding, setBranding] = useState<BrandingSettings>(DEFAULT_BRANDING);
  const [shell, setShell] = useState<ShellSettings>(DEFAULT_SHELL);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/platform-settings");
      if (res.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      if (!res.ok) throw new Error(`Load failed (${res.status})`);
      const data = (await res.json()) as { settings: PlatformSettings };
      setBranding(data.settings.branding);
      setShell(data.settings.shell);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/platform-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branding, shell }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { settings: PlatformSettings };
      setBranding(data.settings.branding);
      setShell(data.settings.shell);
      setMessage("Brand & shell saved — open the globe to see changes");
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const updateModule = (id: DockModuleId, patch: Partial<DockModuleConfig>) => {
    setShell((s) => ({
      ...s,
      modules: s.modules.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }));
  };

  const moveModule = (id: DockModuleId, dir: -1 | 1) => {
    setShell((s) => {
      const sorted = [...s.modules].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex((m) => m.id === id);
      const swap = idx + dir;
      if (idx < 0 || swap < 0 || swap >= sorted.length) return s;
      const a = sorted[idx]!;
      const b = sorted[swap]!;
      const next = s.modules.map((m) => {
        if (m.id === a.id) return { ...m, order: b.order };
        if (m.id === b.id) return { ...m, order: a.order };
        return m;
      });
      return { ...s, modules: next };
    });
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-sm text-slate-400">
        Loading brand & shell…
      </div>
    );
  }

  return (
    <section
      className={
        embedded
          ? "space-y-4"
          : "rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5"
      }
    >
      {!embedded && (
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg text-white">Brand & shell</h2>
            <p className="text-xs text-slate-500">
              Product name, dock modules, chrome toggles — drives the live twin UI
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          {(
            [
              { id: "brand" as const, label: "Branding", icon: Palette },
              { id: "shell" as const, label: "Dock & chrome", icon: LayoutGrid },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setSub(id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition ${
                sub === id
                  ? "bg-teal-400/15 text-teal-100"
                  : "text-slate-400 hover:bg-white/5"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={save} disabled={saving}>
          <Save className="h-3.5 w-3.5" />
          {saving ? "Saving…" : "Save UI"}
        </Button>
      </div>

      {message && (
        <p className="rounded-lg border border-teal-400/20 bg-teal-400/10 px-3 py-2 text-xs text-teal-100">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </p>
      )}

      {sub === "brand" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-slate-400 sm:col-span-2">
            Product name
            <input
              className={fieldClass}
              value={branding.productName}
              onChange={(e) =>
                setBranding((b) => ({ ...b, productName: e.target.value }))
              }
            />
          </label>
          <label className="block text-xs text-slate-400 sm:col-span-2">
            Tagline
            <input
              className={fieldClass}
              value={branding.tagline}
              onChange={(e) =>
                setBranding((b) => ({ ...b, tagline: e.target.value }))
              }
            />
          </label>
          <label className="block text-xs text-slate-400">
            Accent from
            <input
              type="color"
              className={`${fieldClass} h-10 p-1`}
              value={branding.accentFrom}
              onChange={(e) =>
                setBranding((b) => ({ ...b, accentFrom: e.target.value }))
              }
            />
          </label>
          <label className="block text-xs text-slate-400">
            Accent to
            <input
              type="color"
              className={`${fieldClass} h-10 p-1`}
              value={branding.accentTo}
              onChange={(e) =>
                setBranding((b) => ({ ...b, accentTo: e.target.value }))
              }
            />
          </label>
          <label className="block text-xs text-slate-400">
            Live label
            <input
              className={fieldClass}
              value={branding.liveLabel}
              onChange={(e) =>
                setBranding((b) => ({ ...b, liveLabel: e.target.value }))
              }
            />
          </label>
          <label className="block text-xs text-slate-400">
            Offline label
            <input
              className={fieldClass}
              value={branding.offlineLabel}
              onChange={(e) =>
                setBranding((b) => ({ ...b, offlineLabel: e.target.value }))
              }
            />
          </label>
          <label className="block text-xs text-slate-400">
            Loading label
            <input
              className={fieldClass}
              value={branding.loadingLabel}
              onChange={(e) =>
                setBranding((b) => ({ ...b, loadingLabel: e.target.value }))
              }
            />
          </label>
          <label className="block text-xs text-slate-400">
            Ready label
            <input
              className={fieldClass}
              value={branding.readyLabel}
              onChange={(e) =>
                setBranding((b) => ({ ...b, readyLabel: e.target.value }))
              }
            />
          </label>
          <Toggle
            label="Show brand chip"
            checked={branding.showBrandChip}
            onChange={(v) => setBranding((b) => ({ ...b, showBrandChip: v }))}
          />
          <Toggle
            label="Show live chip"
            checked={branding.showLiveChip}
            onChange={(v) => setBranding((b) => ({ ...b, showLiveChip: v }))}
          />
        </div>
      )}

      {sub === "shell" && (
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <Toggle
              label="Header"
              checked={shell.showHeader}
              onChange={(v) => setShell((s) => ({ ...s, showHeader: v }))}
            />
            <Toggle
              label="Status bar"
              checked={shell.showStatusBar}
              onChange={(v) => setShell((s) => ({ ...s, showStatusBar: v }))}
            />
            <Toggle
              label="Day / night toggle"
              checked={shell.showDayNightToggle}
              onChange={(v) =>
                setShell((s) => ({ ...s, showDayNightToggle: v }))
              }
            />
            <Toggle
              label="Zoom controls"
              checked={shell.showZoomControls}
              onChange={(v) => setShell((s) => ({ ...s, showZoomControls: v }))}
            />
            <Toggle
              label="Admin link"
              checked={shell.showAdminLink}
              onChange={(v) => setShell((s) => ({ ...s, showAdminLink: v }))}
            />
            <Toggle
              label="Insight · Assets"
              checked={shell.showInsightBim}
              onChange={(v) => setShell((s) => ({ ...s, showInsightBim: v }))}
            />
            <Toggle
              label="Insight · Scenario"
              checked={shell.showInsightScenario}
              onChange={(v) =>
                setShell((s) => ({ ...s, showInsightScenario: v }))
              }
            />
            <Toggle
              label="Insight · Analytics"
              checked={shell.showInsightAnalytics}
              onChange={(v) =>
                setShell((s) => ({ ...s, showInsightAnalytics: v }))
              }
            />
          </div>

          <label className="block text-xs text-slate-400">
            Insight panel title
            <input
              className={fieldClass}
              value={shell.insightPanelTitle}
              onChange={(e) =>
                setShell((s) => ({ ...s, insightPanelTitle: e.target.value }))
              }
            />
          </label>

          <label className="block text-xs text-slate-400">
            Footer template
            <input
              className={fieldClass}
              value={shell.footerTemplate}
              onChange={(e) =>
                setShell((s) => ({ ...s, footerTemplate: e.target.value }))
              }
            />
            <span className="mt-1 block text-[10px] text-slate-500">
              Tokens: {"{status}"} {"{tod}"} {"{temp}"} {"{alerts}"}
            </span>
          </label>

          <label className="block text-xs text-slate-400">
            Default open panel
            <select
              className={fieldClass}
              value={shell.defaultPanel ?? ""}
              onChange={(e) =>
                setShell((s) => ({
                  ...s,
                  defaultPanel: (e.target.value || null) as DockModuleId | null,
                }))
              }
            >
              <option value="">None</option>
              {DOCK_MODULE_IDS.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>

          <div>
            <p className="mb-2 text-xs font-medium text-slate-300">
              Dock modules
            </p>
            <div className="space-y-2">
              {[...shell.modules]
                .sort((a, b) => a.order - b.order)
                .map((m) => (
                  <div
                    key={m.id}
                    className="grid gap-2 rounded-xl border border-white/10 bg-black/20 p-3 sm:grid-cols-[auto_1fr_1fr_auto]"
                  >
                    <Toggle
                      label={m.id}
                      checked={m.enabled}
                      onChange={(v) => updateModule(m.id, { enabled: v })}
                    />
                    <input
                      className={fieldClass}
                      value={m.label}
                      placeholder="Dock label"
                      onChange={(e) =>
                        updateModule(m.id, { label: e.target.value })
                      }
                    />
                    <input
                      className={fieldClass}
                      value={m.panelTitle}
                      placeholder="Panel title"
                      onChange={(e) =>
                        updateModule(m.id, { panelTitle: e.target.value })
                      }
                    />
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => moveModule(m.id, -1)}
                      >
                        ↑
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => moveModule(m.id, 1)}
                      >
                        ↓
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

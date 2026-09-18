"use client";

import { useEffect, useState } from "react";
import type { LayerCategory, LayerConfig, LayerStyle } from "@/lib/layers/types";
import { LAYER_CATEGORY_LABELS } from "@/lib/layers/types";
import { Button } from "@/components/ui/button";

interface LayerFormDialogProps {
  layer?: LayerConfig;
  open: boolean;
  saving: boolean;
  defaultStyle: LayerStyle;
  onClose: () => void;
  onSave: (payload: Partial<LayerConfig>) => void;
}

const empty = (style: LayerStyle): Partial<LayerConfig> => ({
  name: "",
  description: "",
  category: "custom-vector",
  enabled: true,
  visible: true,
  opacity: 0.85,
  coordinateSystem: "EPSG:4326",
  dataSource: "",
  guidBindings: [],
  builtInKey: null,
  style: { ...style },
});

export function LayerFormDialog({
  layer,
  open,
  saving,
  defaultStyle,
  onClose,
  onSave,
}: LayerFormDialogProps) {
  const [form, setForm] = useState<Partial<LayerConfig>>(layer ?? empty(defaultStyle));
  const [guidText, setGuidText] = useState((layer?.guidBindings ?? []).join(", "));

  useEffect(() => {
    setForm(layer ?? empty(defaultStyle));
    setGuidText((layer?.guidBindings ?? []).join(", "));
  }, [layer, defaultStyle]);

  if (!open) return null;

  const setStyle = (key: keyof LayerStyle, value: string | number) => {
    setForm((f) => ({
      ...f,
      style: { ...(f.style ?? defaultStyle), [key]: value },
    }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...form,
      dataSource: form.dataSource?.trim() || null,
      guidBindings: guidText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/60 p-4 sm:place-items-center">
      <form
        onSubmit={submit}
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#0b1220] p-5 shadow-2xl"
      >
        <h2 className="font-display text-xl text-white">
          {layer ? "Edit layer" : "Create layer"}
        </h2>
        <div className="mt-4 space-y-3 text-sm">
          <label className="block">
            <span className="text-slate-400">Name</span>
            <input
              required
              value={form.name ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-violet-400/40"
            />
          </label>
          <label className="block">
            <span className="text-slate-400">Description</span>
            <textarea
              value={form.description ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-violet-400/40"
              rows={2}
            />
          </label>
          <label className="block">
            <span className="text-slate-400">Category</span>
            <select
              value={form.category ?? "custom-vector"}
              onChange={(e) =>
                setForm((f) => ({ ...f, category: e.target.value as LayerCategory }))
              }
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white outline-none"
            >
              {Object.entries(LAYER_CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-slate-400">Opacity</span>
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={form.opacity ?? 1}
                onChange={(e) => setForm((f) => ({ ...f, opacity: Number(e.target.value) }))}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
              />
            </label>
            <label className="block">
              <span className="text-slate-400">Coordinate system</span>
              <select
                value={form.coordinateSystem ?? "EPSG:4326"}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    coordinateSystem: e.target.value as LayerConfig["coordinateSystem"],
                  }))
                }
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
              >
                <option value="EPSG:4326">EPSG:4326</option>
                <option value="EPSG:3857">EPSG:3857</option>
                <option value="local">local</option>
              </select>
            </label>
          </div>
          <label className="block">
            <span className="text-slate-400">Data source URL/path</span>
            <input
              value={form.dataSource ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, dataSource: e.target.value }))}
              placeholder="/demo/campus-roads.geojson"
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-violet-400/40"
            />
          </label>
          <label className="block">
            <span className="text-slate-400">Asset GUID bindings (comma-separated)</span>
            <input
              value={guidText}
              onChange={(e) => setGuidText(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-violet-400/40"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-slate-400">Fill / line color</span>
              <input
                type="color"
                value={form.style?.fillColor ?? defaultStyle.fillColor}
                onChange={(e) => setStyle("fillColor", e.target.value)}
                className="mt-1 h-10 w-full cursor-pointer rounded-lg border border-white/10 bg-black/30"
              />
            </label>
            <label className="block">
              <span className="text-slate-400">Stroke color</span>
              <input
                type="color"
                value={form.style?.strokeColor ?? defaultStyle.strokeColor}
                onChange={(e) => setStyle("strokeColor", e.target.value)}
                className="mt-1 h-10 w-full cursor-pointer rounded-lg border border-white/10 bg-black/30"
              />
            </label>
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-slate-300">
              <input
                type="checkbox"
                checked={form.enabled ?? true}
                onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
              />
              Enabled
            </label>
            <label className="flex items-center gap-2 text-slate-300">
              <input
                type="checkbox"
                checked={form.visible ?? true}
                onChange={(e) => setForm((f) => ({ ...f, visible: e.target.checked }))}
              />
              Visible
            </label>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save layer"}
          </Button>
        </div>
      </form>
    </div>
  );
}

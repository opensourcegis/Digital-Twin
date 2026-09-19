"use client";

import { useCallback, useEffect, useState } from "react";
import { Box, Link2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TilesetAdminPanel() {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [tilesetFile, setTilesetFile] = useState<File | null>(null);
  const [companionFiles, setCompanionFiles] = useState<FileList | null>(null);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/tileset");
      if (res.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const data = await res.json();
      const primary = data.tiles?.[0];
      setCurrentUrl(primary?.dataSource ?? null);
      if (primary?.dataSource) setUrl(primary.dataSource);
      if (primary?.name) setName(primary.name);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const uploadLocal = async () => {
    if (!tilesetFile) {
      setError("Choose a tileset.json file first");
      return;
    }
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const form = new FormData();
      form.append("tileset", tilesetFile);
      if (name.trim()) form.append("name", name.trim());
      if (companionFiles) {
        Array.from(companionFiles).forEach((f) => form.append("files", f));
      }
      const res = await fetch("/api/admin/tileset", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
      setCurrentUrl(data.url);
      setUrl(data.url);
      setMessage(
        `Uploaded. Served at ${data.url}${
          data.companionCount ? ` (+${data.companionCount} tile files)` : ""
        }. Open Tiles on the twin to load.`
      );
      setTilesetFile(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const saveUrl = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/tileset", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), name: name.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Save failed (${res.status})`);
      setCurrentUrl(data.url);
      setMessage("Tileset URL saved to platform layer catalog.");
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-500/15 text-amber-300">
          <Box className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg text-white">3D Tiles</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            Upload a local <code className="text-amber-200/80">tileset.json</code>{" "}
            (and companion .b3dm / .glb files) or point the platform at a URL.
            The twin Tiles panel loads it as the active tile layer.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="mt-4 space-y-5">
          {currentUrl && (
            <p className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 font-mono text-[11px] text-amber-100/90">
              Active: {currentUrl}
            </p>
          )}

          <div className="space-y-3 rounded-xl border border-white/8 bg-black/15 p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Upload local package
            </p>
            <label className="block text-xs text-slate-400">
              Display name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#0a1018] px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-400/40"
                placeholder="Site mesh"
              />
            </label>
            <label className="block text-xs text-slate-400">
              tileset.json
              <input
                type="file"
                accept=".json,application/json"
                className="mt-1 block w-full text-xs text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-amber-500/20 file:px-3 file:py-1.5 file:text-amber-100"
                onChange={(e) => setTilesetFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <label className="block text-xs text-slate-400">
              Companion tile files (optional)
              <input
                type="file"
                multiple
                className="mt-1 block w-full text-xs text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-slate-200"
                onChange={(e) => setCompanionFiles(e.target.files)}
              />
            </label>
            <Button size="sm" onClick={uploadLocal} disabled={saving || !tilesetFile}>
              <Upload className="h-4 w-4" />
              {saving ? "Uploading…" : "Upload & add to platform"}
            </Button>
          </div>

          <div className="space-y-3 rounded-xl border border-white/8 bg-black/15 p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Or set URL
            </p>
            <label className="block text-xs text-slate-400">
              tileset.json URL
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                spellCheck={false}
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#0a1018] px-3 py-2 font-mono text-[11px] text-slate-200 outline-none focus:border-amber-400/40"
                placeholder="/uploads/tilesets/…/tileset.json"
              />
            </label>
            <Button
              size="sm"
              variant="secondary"
              onClick={saveUrl}
              disabled={saving || !url.trim()}
            >
              <Link2 className="h-4 w-4" />
              Save URL to layer
            </Button>
          </div>

          {message && <p className="text-xs text-emerald-300">{message}</p>}
          {error && <p className="text-xs text-red-300">{error}</p>}
        </div>
      )}
    </section>
  );
}

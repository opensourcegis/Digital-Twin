"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Database,
  Radio,
  Building2,
  GitBranch,
  LineChart,
  RefreshCw,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type Tab = "persist" | "gateway" | "bim" | "scenario" | "analytics";

const fieldClass =
  "mt-1 w-full rounded-lg border border-white/10 bg-[#0a1018] px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-400/40";

export function PersistentTwinAdminPanel() {
  const [tab, setTab] = useState<Tab>("persist");
  const [dbStatus, setDbStatus] = useState<Record<string, unknown> | null>(null);
  const [gateway, setGateway] = useState<{
    mode: string;
    connected: boolean;
    mqttUrl: string | null;
    sensorThingsUrl: string | null;
    messagesReceived: number;
  } | null>(null);
  const [mqttUrl, setMqttUrl] = useState("");
  const [staUrl, setStaUrl] = useState("");
  const [hierarchyCount, setHierarchyCount] = useState(0);
  const [scenarios, setScenarios] = useState<
    Array<{ id: string; name: string; status: string }>
  >([]);
  const [findings, setFindings] = useState<
    Array<{ kind: string; summary: string; score?: number | null }>
  >([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [db, gw, bim, scn, an] = await Promise.all([
      fetch("/api/db/status").then((r) => r.json()),
      fetch("/api/gateway").then((r) => r.json()),
      fetch("/api/bim/hierarchy").then((r) => r.json()),
      fetch("/api/scenarios").then((r) => r.json()),
      fetch("/api/analytics").then((r) => r.json()),
    ]);
    setDbStatus(db);
    setGateway(gw.status);
    setMqttUrl(gw.status?.mqttUrl ?? "");
    setStaUrl(gw.status?.sensorThingsUrl ?? "");
    setHierarchyCount(bim.count ?? 0);
    setScenarios(scn.scenarios ?? []);
    setFindings(
      (an.findings ?? []).map(
        (f: { kind: string; summary: string; score?: number | null }) => ({
          kind: f.kind,
          summary: f.summary,
          score: f.score,
        })
      )
    );
  }, []);

  useEffect(() => {
    load().catch((e) => setMsg(String(e)));
  }, [load]);

  const setMode = async (mode: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/gateway", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          mqttUrl: mqttUrl || null,
          sensorThingsUrl: staUrl || null,
        }),
      });
      const data = await res.json();
      setGateway(data.status);
      setMsg(`Gateway mode → ${data.status.mode}`);
    } finally {
      setBusy(false);
    }
  };

  const importSampleIfc = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const sample = await fetch("/api/bim/ifc").then((r) => r.json());
      const res = await fetch("/api/bim/ifc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sample),
      });
      const data = await res.json();
      setMsg(`Imported ${data.imported} IFC nodes`);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const cloneScenario = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Heat +2°C ${new Date().toLocaleTimeString()}`,
          variables: {
            temperatureOffsetC: 2,
            energyMultiplier: 1.15,
            rainMm: 8,
          },
        }),
      });
      const data = await res.json();
      if (data.id) {
        await fetch(`/api/scenarios/${data.id}/simulate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ steps: 8 }),
        });
        setMsg(`Scenario ${data.id} cloned + simulated`);
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const runAnalytics = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/analytics", { method: "POST" });
      const data = await res.json();
      setFindings(data.findings ?? []);
      setMsg(`Analytics pass: ${data.count} findings`);
    } finally {
      setBusy(false);
    }
  };

  const tabs: Array<{ id: Tab; label: string; icon: typeof Database }> = [
    { id: "persist", label: "Persist", icon: Database },
    { id: "gateway", label: "Gateway", icon: Radio },
    { id: "bim", label: "BIM", icon: Building2 },
    { id: "scenario", label: "Scenario", icon: GitBranch },
    { id: "analytics", label: "Analytics", icon: LineChart },
  ];

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg text-white">
            Persistent twin platform
          </h2>
          <p className="text-xs text-slate-500">
            Phases 1–5 · Postgres · MQTT/SensorThings · IFC · scenarios · analytics
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => load()} disabled={busy}>
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-1">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition ${
              tab === id
                ? "bg-teal-400/15 text-teal-100"
                : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {msg && (
        <p className="mb-3 rounded-lg border border-teal-400/20 bg-teal-400/10 px-3 py-2 text-xs text-teal-100">
          {msg}
        </p>
      )}

      {tab === "persist" && (
        <div className="space-y-2 text-sm text-slate-300">
          <p>
            Database:{" "}
            <span className="text-white">
              {(dbStatus?.persistence as { configured?: boolean })?.configured
                ? "configured"
                : "memory fallback"}
            </span>
          </p>
          <p className="text-xs text-slate-500">
            {(dbStatus as { note?: string })?.note}
          </p>
          <p className="text-xs text-slate-500">
            Host:{" "}
            {(dbStatus?.persistence as { urlHost?: string | null })?.urlHost ??
              "—"}{" "}
            · reachable{" "}
            {String(
              (dbStatus?.persistence as { reachable?: boolean })?.reachable ??
                false
            )}
          </p>
          <pre className="mt-2 overflow-auto rounded-lg bg-black/30 p-3 text-[10px] text-slate-400">
            {JSON.stringify(dbStatus, null, 2)}
          </pre>
        </div>
      )}

      {tab === "gateway" && (
        <div className="space-y-3">
          <p className="text-sm text-slate-300">
            Mode:{" "}
            <span className="font-medium text-white">
              {gateway?.mode ?? "—"}
            </span>{" "}
            · connected {String(gateway?.connected ?? false)} · msgs{" "}
            {gateway?.messagesReceived ?? 0}
          </p>
          <label className="block text-xs text-slate-400">
            MQTT URL
            <input
              className={fieldClass}
              value={mqttUrl}
              onChange={(e) => setMqttUrl(e.target.value)}
              placeholder="mqtt://localhost:1883"
            />
          </label>
          <label className="block text-xs text-slate-400">
            SensorThings URL
            <input
              className={fieldClass}
              value={staUrl}
              onChange={(e) => setStaUrl(e.target.value)}
              placeholder="https://example/FROST-Server/v1.1"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {(["simulator", "mqtt", "sensorthings"] as const).map((m) => (
              <Button
                key={m}
                size="sm"
                variant={gateway?.mode === m ? "default" : "secondary"}
                disabled={busy}
                onClick={() => setMode(m)}
              >
                {m}
              </Button>
            ))}
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const res = await fetch("/api/gateway/sensorthings", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: "{}",
                  });
                  const data = await res.json();
                  setMsg(
                    data.ok
                      ? `Pulled ${data.count} observations`
                      : data.error || "Pull failed"
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Pull SensorThings
            </Button>
          </div>
        </div>
      )}

      {tab === "bim" && (
        <div className="space-y-3">
          <p className="text-sm text-slate-300">
            Asset hierarchy nodes:{" "}
            <span className="text-white">{hierarchyCount}</span>
          </p>
          <Button size="sm" disabled={busy} onClick={importSampleIfc}>
            <Upload className="h-3.5 w-3.5" />
            Import sample IFC mapping
          </Button>
          <p className="text-xs text-slate-500">
            POST /api/bim/ifc with IFC-JSON nodes (building → floor → space →
            equipment). GUID mapping uses ifc-&#123;IfcGuid&#125;.
          </p>
        </div>
      )}

      {tab === "scenario" && (
        <div className="space-y-3">
          <Button size="sm" disabled={busy} onClick={cloneScenario}>
            Clone live → heatwave scenario
          </Button>
          <ul className="space-y-1 text-xs text-slate-400">
            {scenarios.length === 0 && <li>No scenarios yet</li>}
            {scenarios.map((s) => (
              <li key={s.id} className="rounded-lg bg-black/25 px-2 py-1.5">
                <span className="text-slate-200">{s.name}</span> · {s.status} ·{" "}
                {s.id}
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "analytics" && (
        <div className="space-y-3">
          <Button size="sm" disabled={busy} onClick={runAnalytics}>
            Run analytics pass
          </Button>
          <ul className="max-h-64 space-y-1 overflow-auto text-xs text-slate-400">
            {findings.length === 0 && <li>No findings</li>}
            {findings.slice(0, 20).map((f, i) => (
              <li key={`${f.kind}-${i}`} className="rounded-lg bg-black/25 px-2 py-1.5">
                <span className="uppercase tracking-wide text-teal-300/80">
                  {f.kind}
                </span>
                {f.score != null ? ` · ${Number(f.score).toFixed(2)}` : ""}
                <p className="text-slate-300">{f.summary}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

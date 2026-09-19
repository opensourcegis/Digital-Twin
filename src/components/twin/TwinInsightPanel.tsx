"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  GitBranch,
  LineChart,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { HierarchyNode } from "@/lib/bim/ifc-import";

type Tab = "bim" | "scenario" | "analytics";

function TreeNode({
  node,
  depth,
  onSelect,
}: {
  node: HierarchyNode;
  depth: number;
  onSelect: (guid: string) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const hasKids = node.children.length > 0;
  return (
    <div>
      <button
        type="button"
        className="flex w-full items-center gap-1 rounded px-1 py-1 text-left text-xs hover:bg-white/5"
        style={{ paddingLeft: 4 + depth * 10 }}
        onClick={() => {
          if (hasKids) setOpen((o) => !o);
          onSelect(node.guid);
        }}
      >
        {hasKids ? (
          open ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-slate-500" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-slate-500" />
          )
        ) : (
          <span className="w-3" />
        )}
        <span className="truncate text-slate-200">{node.name}</span>
        <span className="ml-auto shrink-0 text-[9px] uppercase text-slate-500">
          {node.type}
        </span>
      </button>
      {open &&
        node.children.map((c) => (
          <TreeNode
            key={c.guid}
            node={c}
            depth={depth + 1}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
}

interface TwinInsightPanelProps {
  onSelectAsset: (guid: string) => void;
  showBim?: boolean;
  showScenario?: boolean;
  showAnalytics?: boolean;
}

export function TwinInsightPanel({
  onSelectAsset,
  showBim = true,
  showScenario = true,
  showAnalytics = true,
}: TwinInsightPanelProps) {
  const tabs = (
    [
      showBim ? ({ id: "bim" as const, label: "Assets", icon: Building2 }) : null,
      showScenario
        ? ({ id: "scenario" as const, label: "Scenario", icon: GitBranch })
        : null,
      showAnalytics
        ? ({ id: "analytics" as const, label: "Analytics", icon: LineChart })
        : null,
    ] as const
  ).filter(Boolean) as Array<{
    id: Tab;
    label: string;
    icon: typeof Building2;
  }>;

  const [tab, setTab] = useState<Tab>("bim");
  useEffect(() => {
    if (tabs.length && !tabs.some((t) => t.id === tab)) {
      setTab(tabs[0]!.id);
    }
  }, [showBim, showScenario, showAnalytics, tab, tabs.length]);
  const [hierarchy, setHierarchy] = useState<HierarchyNode[]>([]);
  const [scenarios, setScenarios] = useState<
    Array<{ id: string; name: string; status: string }>
  >([]);
  const [compare, setCompare] = useState<
    Array<{
      sensorGuid: string;
      metric: string;
      live: number | null;
      scenario: number | null;
      delta: number | null;
    }>
  >([]);
  const [activeScenario, setActiveScenario] = useState<string | null>(null);
  const [findings, setFindings] = useState<
    Array<{ kind: string; summary: string; score?: number | null }>
  >([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [bim, scn, an] = await Promise.all([
      fetch("/api/bim/hierarchy").then((r) => r.json()),
      fetch("/api/scenarios").then((r) => r.json()),
      fetch("/api/analytics").then((r) => r.json()),
    ]);
    setHierarchy(bim.hierarchy ?? []);
    setScenarios(scn.scenarios ?? []);
    setFindings(an.findings ?? []);
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const cloneAndCompare = async () => {
    setBusy(true);
    try {
      const created = await fetch("/api/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Live vs +2°C",
          variables: { temperatureOffsetC: 2, energyMultiplier: 1.2 },
        }),
      }).then((r) => r.json());
      if (created.id) {
        await fetch(`/api/scenarios/${created.id}/simulate`, {
          method: "POST",
          body: "{}",
        });
        const cmp = await fetch(`/api/scenarios/${created.id}/compare`).then(
          (r) => r.json()
        );
        setActiveScenario(created.id);
        setCompare(cmp.comparison ?? []);
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  const runAnalytics = async () => {
    setBusy(true);
    try {
      const data = await fetch("/api/analytics", { method: "POST" }).then((r) =>
        r.json()
      );
      setFindings(data.findings ?? []);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[10px] transition ${
              tab === id
                ? "bg-teal-400/15 text-teal-100"
                : "text-slate-400 hover:bg-white/5"
            }`}
          >
            <Icon className="h-3 w-3" />
            {label}
          </button>
        ))}
      </div>

      {tabs.length === 0 && (
        <p className="text-xs text-slate-500">
          All insight tabs disabled in Control Center.
        </p>
      )}

      {tab === "bim" && (
        <div className="rounded-lg border border-white/5 bg-white/[0.03] p-2">
          <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-slate-500">
            Building · floor · room · equipment
          </p>
          {hierarchy.length === 0 ? (
            <p className="text-xs text-slate-500">No assets</p>
          ) : (
            hierarchy.map((n) => (
              <TreeNode
                key={n.guid}
                node={n}
                depth={0}
                onSelect={onSelectAsset}
              />
            ))
          )}
        </div>
      )}

      {tab === "scenario" && (
        <div className="space-y-2">
          <Button
            size="sm"
            className="w-full"
            disabled={busy}
            onClick={cloneAndCompare}
          >
            Clone live · simulate · compare
          </Button>
          {activeScenario && (
            <p className="text-[10px] text-slate-500">
              Active: {activeScenario}
            </p>
          )}
          {compare.length > 0 && (
            <div className="max-h-40 space-y-1 overflow-auto text-[10px]">
              {compare.slice(0, 12).map((c) => (
                <div
                  key={c.sensorGuid}
                  className="flex justify-between gap-2 rounded bg-black/25 px-2 py-1 text-slate-400"
                >
                  <span className="truncate text-slate-300">{c.metric}</span>
                  <span>
                    L {c.live ?? "—"} → S {c.scenario ?? "—"}
                    {c.delta != null ? (
                      <span className="text-amber-300"> ({c.delta > 0 ? "+" : ""}
                      {c.delta})
                      </span>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          )}
          {scenarios.length > 0 && (
            <ul className="text-[10px] text-slate-500">
              {scenarios.slice(0, 4).map((s) => (
                <li key={s.id}>
                  {s.name} · {s.status}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "analytics" && (
        <div className="space-y-2">
          <Button
            size="sm"
            className="w-full"
            variant="secondary"
            disabled={busy}
            onClick={runAnalytics}
          >
            Refresh findings
          </Button>
          <ul className="max-h-48 space-y-1.5 overflow-auto">
            {findings.slice(0, 12).map((f, i) => (
              <li
                key={`${f.kind}-${i}`}
                className="rounded-lg border border-white/5 bg-white/[0.03] px-2 py-1.5 text-[11px]"
              >
                <span className="text-[9px] uppercase tracking-wide text-teal-300/80">
                  {f.kind.replace(/_/g, " ")}
                </span>
                <p className="mt-0.5 text-slate-300">{f.summary}</p>
              </li>
            ))}
            {findings.length === 0 && (
              <li className="text-xs text-slate-500">No findings yet</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { X, FileText, Wrench, Cpu, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchAssetDetail, type AssetDetail } from "@/hooks/useTwinPlatform";
import { cn } from "@/lib/utils";

interface AssetDetailDrawerProps {
  assetGuid: string | null;
  onClose: () => void;
}

export function AssetDetailDrawer({ assetGuid, onClose }: AssetDetailDrawerProps) {
  const [detail, setDetail] = useState<AssetDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!assetGuid) {
      setDetail(null);
      return;
    }
    setLoading(true);
    fetchAssetDetail(assetGuid)
      .then(setDetail)
      .finally(() => setLoading(false));
  }, [assetGuid]);

  if (!assetGuid) return null;

  return (
    <div className="pointer-events-auto absolute inset-x-3 bottom-24 z-30 mx-auto max-w-lg md:inset-x-auto md:right-5 md:left-auto md:bottom-28 md:w-96">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b1220]/95 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-teal-400">
              Asset registry
            </p>
            <p className="font-display text-lg text-white">
              {loading ? "Loading…" : detail?.asset.name ?? "Unknown"}
            </p>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <ScrollArea className="max-h-[min(50vh,20rem)]">
          <div className="space-y-4 p-4 text-xs">
            {detail && (
              <>
                <section>
                  <p className="mb-1 flex items-center gap-1 text-slate-500">
                    <Cpu className="h-3 w-3" /> GUID
                  </p>
                  <code className="block break-all rounded bg-black/40 px-2 py-1 text-[10px] text-teal-200">
                    {detail.asset.guid}
                  </code>
                  <p className="mt-2 text-slate-400">
                    Type: {detail.asset.type} · EPSG:4326
                  </p>
                </section>

                {(detail.workOrders as Array<{ id: string; title: string; status: string; priority: string }>).length > 0 && (
                  <section>
                    <p className="mb-2 flex items-center gap-1 font-medium text-slate-300">
                      <Wrench className="h-3.5 w-3.5" /> CMMS work orders
                    </p>
                    {(detail.workOrders as Array<{ id: string; title: string; status: string; priority: string }>).map((wo) => (
                      <div
                        key={wo.id}
                        className="mb-1.5 rounded-lg border border-white/5 bg-white/[0.03] px-2 py-1.5"
                      >
                        <p className="text-slate-200">{wo.title}</p>
                        <p className="text-slate-500">
                          {wo.id} · {wo.status} · {wo.priority}
                        </p>
                      </div>
                    ))}
                  </section>
                )}

                {(detail.documents as Array<{ id: string; title: string; type: string; summary: string }>).length > 0 && (
                  <section>
                    <p className="mb-2 flex items-center gap-1 font-medium text-slate-300">
                      <FileText className="h-3.5 w-3.5" /> Documents
                    </p>
                    {(detail.documents as Array<{ id: string; title: string; type: string; summary: string }>).map((d) => (
                      <div
                        key={d.id}
                        className="mb-1.5 rounded-lg border border-white/5 bg-white/[0.03] px-2 py-1.5"
                      >
                        <p className="text-slate-200">{d.title}</p>
                        <p className="text-slate-500">
                          {d.type.toUpperCase()} · {d.summary}
                        </p>
                      </div>
                    ))}
                  </section>
                )}

                {(detail.relations as Array<{ predicate: string; objectGuid: string }>).length > 0 && (
                  <section>
                    <p className="mb-2 flex items-center gap-1 font-medium text-slate-300">
                      <Link2 className="h-3.5 w-3.5" /> Semantic model
                    </p>
                    {(detail.relations as Array<{ predicate: string; objectGuid: string; ontology: string }>).slice(0, 6).map((r, i) => (
                      <p key={i} className="text-slate-500">
                        <span className={cn("text-teal-300")}>{r.predicate}</span> →{" "}
                        {r.objectGuid.slice(0, 20)}… ({r.ontology})
                      </p>
                    ))}
                  </section>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

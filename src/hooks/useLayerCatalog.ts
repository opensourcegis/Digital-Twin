"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LayerConfig } from "@/lib/layers/types";

export interface ViewerLayer {
  key: string;
  configId: string;
  label: string;
  description: string;
  visible: boolean;
  enabled: boolean;
  opacity: number;
  zOrder: number;
  builtInKey: string | null;
  dataSource: string | null;
  style: LayerConfig["style"];
  category: string;
}

function toViewerLayer(layer: LayerConfig): ViewerLayer {
  return {
    key: layer.builtInKey ?? layer.id,
    configId: layer.id,
    label: layer.name,
    description: layer.description,
    visible: layer.enabled && layer.visible,
    enabled: layer.enabled,
    opacity: layer.opacity,
    zOrder: layer.zOrder,
    builtInKey: layer.builtInKey,
    dataSource: layer.dataSource,
    style: layer.style,
    category: layer.category,
  };
}

function layersEqual(a: ViewerLayer[], b: ViewerLayer[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.configId !== y.configId ||
      x.visible !== y.visible ||
      x.enabled !== y.enabled ||
      x.opacity !== y.opacity ||
      x.zOrder !== y.zOrder ||
      x.dataSource !== y.dataSource ||
      x.label !== y.label
    ) {
      return false;
    }
  }
  return true;
}

type LayerPatch = Partial<
  Pick<ViewerLayer, "visible" | "enabled" | "opacity" | "zOrder">
>;

export function useLayerCatalog(options?: { pollMs?: number | false }) {
  const pollMs = options?.pollMs ?? false;
  const [layers, setLayers] = useState<ViewerLayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const layersRef = useRef<ViewerLayer[]>([]);
  layersRef.current = layers;

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/layers", { cache: "no-store" });
      if (!res.ok) throw new Error(`layers ${res.status}`);
      const data = await res.json();
      const next = (data.layers as LayerConfig[]).map(toViewerLayer);
      setLayers((prev) => (layersEqual(prev, next) ? prev : next));
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const patchLayer = useCallback((configId: string, patch: LayerPatch) => {
    setLayers((prev) =>
      prev.map((layer) =>
        layer.configId === configId ? { ...layer, ...patch } : layer
      )
    );
  }, []);

  useEffect(() => {
    refresh();
    if (pollMs === false) return;
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  return { layers, loading, error, refresh, patchLayer };
}

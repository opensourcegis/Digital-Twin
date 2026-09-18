import type { ViewerLayer } from "@/hooks/useLayerCatalog";

export interface LayerRenderState {
  visible: boolean;
  opacity: number;
  enabled: boolean;
  dataSource: string | null;
  styleKey: string;
}

export function layerStyleKey(layer: ViewerLayer): string {
  return JSON.stringify(layer.style ?? {});
}

export function toLayerRenderState(layer: ViewerLayer): LayerRenderState {
  return {
    visible: layer.visible,
    opacity: layer.opacity,
    enabled: layer.enabled,
    dataSource: layer.dataSource,
    styleKey: layerStyleKey(layer),
  };
}

export function layerRenderStateChanged(
  prev: LayerRenderState | undefined,
  next: LayerRenderState
): {
  visibility: boolean;
  opacity: boolean;
  reload: boolean;
} {
  if (!prev) {
    return { visibility: true, opacity: true, reload: true };
  }
  return {
    visibility: prev.visible !== next.visible,
    opacity: prev.opacity !== next.opacity,
    reload:
      prev.enabled !== next.enabled ||
      prev.dataSource !== next.dataSource ||
      prev.styleKey !== next.styleKey,
  };
}

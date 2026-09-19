/* eslint-disable @typescript-eslint/no-explicit-any */
import type { TimeOfDay } from "@/lib/types";
import { TWIN_LOOK, buildingLook } from "./visual-theme";

type CesiumNS = any;

/**
 * Day/night for campus vectors is a material change only.
 * No fake windows, gold eaves, or roof discs.
 */
export function applyCampusTimeOfDay(
  Cesium: CesiumNS,
  viewer: any,
  mode: TimeOfDay,
  layerEntities: Record<string, any[]>
) {
  stripCampusDecorations(viewer);
  const night = mode === "night";

  for (const ent of layerEntities.buildings ?? []) {
    if (!ent?.polygon) continue;
    if (ent._twinAlert) continue;
    const props = ent.properties;
    const use = props?.use?.getValue?.() ?? props?.use;
    const look = buildingLook(typeof use === "string" ? use : undefined, night);
    ent.polygon.material = Cesium.Color.fromCssColorString(look.fill).withAlpha(
      look.alpha
    );
    ent.polygon.outlineColor = Cesium.Color.fromCssColorString(
      look.outline
    ).withAlpha(look.outlineAlpha);
  }

  for (const ent of layerEntities.roads ?? []) {
    if (!ent?.polyline) continue;
    const props = ent.properties;
    const cls = props?.class?.getValue?.() ?? props?.class;
    const primary = cls === "primary";
    const color = night
      ? primary
        ? TWIN_LOOK.roads.night.primary
        : TWIN_LOOK.roads.night.secondary
      : primary
        ? TWIN_LOOK.roads.primary
        : TWIN_LOOK.roads.secondary;
    const alpha = night ? TWIN_LOOK.roads.night.alpha : TWIN_LOOK.roads.alpha;
    ent.polyline.material = Cesium.Color.fromCssColorString(color).withAlpha(
      alpha
    );
  }

  viewer.scene?.requestRender?.();
}

function stripCampusDecorations(viewer: any) {
  const list = viewer?.entities?.values;
  if (!list?.length) return;
  const remove: any[] = [];
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    const id = String(e?.id ?? "");
    if (
      id.includes("-roof-cap") ||
      id.includes("-cornice") ||
      id.includes("-win-")
    ) {
      remove.push(e);
    }
  }
  for (const e of remove) viewer.entities.remove(e);
}

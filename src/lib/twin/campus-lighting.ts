/* eslint-disable @typescript-eslint/no-explicit-any */
import type { TimeOfDay } from "@/lib/types";
import { TWIN_LOOK, buildingLook } from "./visual-theme";

type CesiumNS = any;

export type CampusLightExtras = {
  roofs: Map<string, any>;
  cornices: Map<string, any>;
  windows: Map<string, any[]>;
};

export function emptyCampusLightExtras(): CampusLightExtras {
  return {
    roofs: new Map(),
    cornices: new Map(),
    windows: new Map(),
  };
}

/**
 * Day/night is a material change — not a post-process crush.
 * Night: dark opaque facades, warm roof cap, lit windows, gold eave.
 */
export function applyCampusTimeOfDay(
  Cesium: CesiumNS,
  viewer: any,
  mode: TimeOfDay,
  layerEntities: Record<string, any[]>,
  extras: CampusLightExtras
) {
  const night = mode === "night";

  for (const ent of layerEntities.buildings ?? []) {
    if (!ent?.polygon) continue;
    const props = ent.properties;
    const use = props?.use?.getValue?.() ?? props?.use;
    const look = buildingLook(typeof use === "string" ? use : undefined, night);
    const isAlert = isAlertBuilding(ent);
    if (!isAlert) {
      ent.polygon.material = Cesium.Color.fromCssColorString(look.fill).withAlpha(
        look.alpha
      );
      ent.polygon.outlineColor = Cesium.Color.fromCssColorString(
        look.outline
      ).withAlpha(look.outlineAlpha);
    }
    syncRoofCap(Cesium, viewer, ent, night, extras);
    syncCornice(Cesium, viewer, ent, night, extras);
    syncWindows(Cesium, viewer, ent, night, extras);
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

function isAlertBuilding(ent: any): boolean {
  return Boolean(ent._twinAlert);
}

function buildingId(ent: any): string {
  return String(ent.id ?? ent.entityCollection?.values?.indexOf?.(ent) ?? "b");
}

function polygonRing(ent: any): any[] {
  const h =
    ent.polygon?.hierarchy?.getValue?.() ?? ent.polygon?.hierarchy;
  if (!h) return [];
  if (Array.isArray(h)) return h;
  if (Array.isArray(h.positions)) return h.positions;
  return [];
}

function extrudedHeightM(ent: any): number {
  const h =
    ent.polygon?.extrudedHeight?.getValue?.() ?? ent.polygon?.extrudedHeight;
  return typeof h === "number" && Number.isFinite(h) ? h : 18;
}

function syncRoofCap(
  Cesium: CesiumNS,
  viewer: any,
  ent: any,
  night: boolean,
  extras: CampusLightExtras
) {
  const id = buildingId(ent);
  const ring = polygonRing(ent);
  const height = extrudedHeightM(ent);
  if (ring.length < 3) return;

  let roof = extras.roofs.get(id);
  if (!roof) {
    roof = viewer.entities.add({
      id: `${id}-roof-cap`,
      polygon: {
        hierarchy: ring,
        height: height + 0.12,
        material: Cesium.Color.fromCssColorString("#2a241c"),
        outline: false,
      },
      show: false,
    });
    extras.roofs.set(id, roof);
  } else if (roof.polygon) {
    roof.polygon.hierarchy = new Cesium.ConstantProperty(ring);
    roof.polygon.height = height + 0.12;
  }
  roof.show = night;
  if (roof.polygon) {
    roof.polygon.material = Cesium.Color.fromCssColorString("#2c261c");
  }
}

function syncCornice(
  Cesium: CesiumNS,
  viewer: any,
  ent: any,
  night: boolean,
  extras: CampusLightExtras
) {
  const id = buildingId(ent);
  const ring = polygonRing(ent);
  const height = extrudedHeightM(ent);
  if (ring.length < 2) return;

  const positions = ring.map((p: any) => {
    const c = Cesium.Cartographic.fromCartesian(p);
    return Cesium.Cartesian3.fromRadians(
      c.longitude,
      c.latitude,
      height + 0.35
    );
  });

  let cornice = extras.cornices.get(id);
  if (!cornice) {
    cornice = viewer.entities.add({
      id: `${id}-cornice`,
      polyline: {
        positions,
        width: 2.5,
        material: Cesium.Color.fromCssColorString("#f0d080").withAlpha(0.95),
        clampToGround: false,
      },
      show: false,
    });
    extras.cornices.set(id, cornice);
  } else if (cornice.polyline) {
    cornice.polyline.positions = new Cesium.ConstantProperty(positions);
  }
  cornice.show = night;
}

function syncWindows(
  Cesium: CesiumNS,
  viewer: any,
  ent: any,
  night: boolean,
  extras: CampusLightExtras
) {
  const id = buildingId(ent);
  let windows = extras.windows.get(id);
  if (!windows) {
    windows = createWindows(Cesium, viewer, id, polygonRing(ent), extrudedHeightM(ent));
    extras.windows.set(id, windows);
  }
  for (const w of windows) w.show = night;
}

function createWindows(
  Cesium: CesiumNS,
  viewer: any,
  buildingKey: string,
  ring: any[],
  height: number
): any[] {
  const windows: any[] = [];
  if (ring.length < 2) return windows;

  const spacing = 9;
  const winW = 1.7;
  const winH = 1.25;
  const floors = height >= 28 ? [0.38, 0.62] : [0.48];
  const lit = Cesium.Color.fromCssColorString("#ffe7a0");

  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i];
    const b = ring[i + 1];
    const len = Cesium.Cartesian3.distance(a, b);
    if (!(len > 12)) continue;
    const n = Math.max(1, Math.floor(len / spacing));
    for (let k = 1; k < n; k++) {
      const t = k / n;
      const p = Cesium.Cartesian3.lerp(a, b, t, new Cesium.Cartesian3());
      const c = Cesium.Cartographic.fromCartesian(p);
      const lon = Cesium.Math.toDegrees(c.longitude);
      const lat = Cesium.Math.toDegrees(c.latitude);
      const heading = edgeHeading(Cesium, a, b, p);
      for (const frac of floors) {
        const pos = Cesium.Cartesian3.fromDegrees(lon, lat, height * frac);
        windows.push(
          viewer.entities.add({
            id: `${buildingKey}-win-${i}-${k}-${frac}`,
            position: pos,
            orientation: Cesium.Transforms.headingPitchRollQuaternion(
              pos,
              new Cesium.HeadingPitchRoll(heading, 0, 0)
            ),
            box: {
              dimensions: new Cesium.Cartesian3(winW, 0.16, winH),
              material: lit,
            },
            show: false,
          })
        );
      }
    }
  }
  return windows;
}

function edgeHeading(Cesium: CesiumNS, a: any, b: any, at: any): number {
  try {
    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(at);
    const inv = Cesium.Matrix4.inverseTransformation(
      enu,
      new Cesium.Matrix4()
    );
    const la = Cesium.Matrix4.multiplyByPoint(inv, a, new Cesium.Cartesian3());
    const lb = Cesium.Matrix4.multiplyByPoint(inv, b, new Cesium.Cartesian3());
    return Math.atan2(lb.x - la.x, lb.y - la.y);
  } catch {
    return 0;
  }
}

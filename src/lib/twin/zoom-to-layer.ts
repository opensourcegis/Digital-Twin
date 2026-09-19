/* eslint-disable @typescript-eslint/no-explicit-any */

export type ZoomLayerTarget = {
  builtInKey?: string | null;
  configId: string;
  key: string;
};

export function zoomCameraToLayer(
  Cesium: any,
  viewer: any,
  target: ZoomLayerTarget,
  opts: {
    layerEntities: Record<string, any[]>;
    customLayerEntities: Map<string, any[]>;
    tileset: any | null;
    poles: Map<string, any>;
    robotRoot?: any | null;
  }
): boolean {
  const bucket = target.builtInKey ?? target.key;

  if (target.builtInKey === "tileset" && opts.tileset) {
    void viewer.zoomTo(opts.tileset);
    return true;
  }

  if (target.builtInKey === "poles") {
    const positions: any[] = [];
    for (const ent of opts.poles.values()) {
      const p = ent?.position?.getValue?.(viewer.clock.currentTime) ?? ent?.position;
      if (p) positions.push(p);
    }
    if (positions.length) {
      flyToPositions(Cesium, viewer, positions);
      return true;
    }
  }

  if (target.builtInKey === "robot-path" && opts.robotRoot) {
    const p =
      opts.robotRoot.position?.getValue?.(viewer.clock.currentTime) ??
      opts.robotRoot.position;
    if (p) {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.add(
          p,
          new Cesium.Cartesian3(0, 0, 80),
          new Cesium.Cartesian3()
        ),
        duration: 1.1,
      });
      return true;
    }
  }

  const ents =
    opts.layerEntities[bucket] ??
    opts.customLayerEntities.get(target.configId) ??
    [];

  const positions: any[] = [];
  for (const e of ents) {
    if (!e) continue;
    const pos =
      e.position?.getValue?.(viewer.clock.currentTime) ?? e.position;
    if (pos) {
      positions.push(pos);
      continue;
    }
    const hierarchy =
      e.polygon?.hierarchy?.getValue?.(viewer.clock.currentTime) ??
      e.polygon?.hierarchy;
    const ring = hierarchy?.positions ?? hierarchy;
    if (Array.isArray(ring)) positions.push(...ring);
    const polyline =
      e.polyline?.positions?.getValue?.(viewer.clock.currentTime) ??
      e.polyline?.positions;
    if (Array.isArray(polyline)) positions.push(...polyline);
  }

  if (!positions.length) return false;
  flyToPositions(Cesium, viewer, positions);
  return true;
}

function flyToPositions(Cesium: any, viewer: any, positions: any[]) {
  if (positions.length === 1) {
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.add(
        positions[0],
        new Cesium.Cartesian3(0, 0, 120),
        new Cesium.Cartesian3()
      ),
      duration: 1.2,
    });
    return;
  }
  const bs = Cesium.BoundingSphere.fromPoints(positions);
  viewer.camera.flyToBoundingSphere(bs, {
    duration: 1.25,
    offset: new Cesium.HeadingPitchRange(
      0,
      Cesium.Math.toRadians(-45),
      Math.max(bs.radius * 2.4, 80)
    ),
  });
}

export function requestZoomToLayer(target: ZoomLayerTarget) {
  window.dispatchEvent(
    new CustomEvent("twin-zoom-layer", { detail: target })
  );
}

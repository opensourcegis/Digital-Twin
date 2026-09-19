/* eslint-disable @typescript-eslint/no-explicit-any */

export type ZoomLayerTarget = {
  builtInKey?: string | null;
  configId: string;
  key: string;
};

const TILESET_READY_MS = 15_000;

async function waitForTilesetReady(
  Cesium: any,
  tileset: any,
  timeoutMs = TILESET_READY_MS
): Promise<{ ok: boolean; reason?: string }> {
  if (!tileset) {
    return { ok: false, reason: "No tileset instance" };
  }

  // Prefer readyPromise (Cesium 1.104+)
  if (tileset.readyPromise && typeof tileset.readyPromise.then === "function") {
    try {
      await Promise.race([
        tileset.readyPromise,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Tileset ready timed out")),
            timeoutMs
          )
        ),
      ]);
    } catch (err) {
      return {
        ok: false,
        reason: `Tileset not ready: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // Wait until WGS84 bounding sphere is valid (georeferenced ECEF center)
  const deadline = Date.now() + Math.min(timeoutMs, 10_000);
  while (Date.now() < deadline) {
    const bs = tileset.boundingSphere;
    if (
      bs &&
      Number.isFinite(bs.radius) &&
      bs.radius > 1 &&
      bs.center &&
      !Cesium.Cartesian3.equals(bs.center, Cesium.Cartesian3.ZERO)
    ) {
      // Confirm center is a plausible ECEF point (not local-only)
      const mag = Cesium.Cartesian3.magnitude(bs.center);
      if (mag > 1_000_000) {
        return { ok: true };
      }
      // Local/RTC tileset — still zoomable via model matrix
      if (tileset.modelMatrix || tileset.root) {
        return { ok: true };
      }
    }
    // Kick a render so tileset can resolve BV
    try {
      tileset.show = true;
    } catch {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  const bs = tileset.boundingSphere;
  if (bs && Number.isFinite(bs.radius) && bs.radius > 0) {
    return { ok: true };
  }
  return {
    ok: false,
    reason:
      "Tileset bounding sphere not available — check URL / CRS (expects WGS84 georeferenced 3D Tiles)",
  };
}

/**
 * Zoom camera to tileset using WGS84 ECEF bounding sphere.
 * Instant view first (so Walk chase can't steal the frame), then ease.
 */
async function flyToTileset(
  Cesium: any,
  viewer: any,
  tileset: any
): Promise<void> {
  tileset.show = true;
  viewer.scene.requestRenderMode = false;
  viewer.scene.requestRender();

  const ready = await waitForTilesetReady(Cesium, tileset);
  if (!ready.ok) {
    throw new Error(ready.reason ?? "Tileset not ready");
  }

  // Give content a moment to refine geometric error / root transform
  await new Promise((r) => setTimeout(r, 200));
  viewer.scene.requestRender();

  const bs = tileset.boundingSphere;
  if (!bs || !(bs.radius > 0)) {
    throw new Error("Tileset has no bounding sphere (bad CRS or empty tileset)");
  }

  const range = Math.max(bs.radius * 2.2, 80);
  const offset = new Cesium.HeadingPitchRange(
    0,
    Cesium.Math.toRadians(-38),
    range
  );

  viewer.camera.cancelFlight?.();

  // Instant snap — survives Walk chase / requestRenderMode races
  if (typeof viewer.camera.viewBoundingSphere === "function") {
    viewer.camera.viewBoundingSphere(bs, offset);
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  } else {
    viewer.camera.flyToBoundingSphere(bs, { duration: 0, offset });
  }
  viewer.scene.requestRender();

  // Soft ease for polish (non-fatal if interrupted)
  try {
    await viewer.camera.flyToBoundingSphere(bs, {
      duration: 1.15,
      offset,
    });
  } catch {
    /* already at destination */
  }
  viewer.scene.requestRender();
}

export async function zoomCameraToLayer(
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
): Promise<{ ok: boolean; reason?: string }> {
  const bucket = target.builtInKey ?? target.key;

  if (target.builtInKey === "tileset" || target.key === "tileset") {
    if (!opts.tileset) {
      return {
        ok: false,
        reason:
          "External tileset not loaded yet. Open Tiles → Sample or Load a tileset.json URL, then Focus again.",
      };
    }
    try {
      await flyToTileset(Cesium, viewer, opts.tileset);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        reason: `Cannot zoom into external layer: ${
          err instanceof Error ? err.message : String(err)
        }`,
      };
    }
  }

  if (target.builtInKey === "poles") {
    const positions: any[] = [];
    for (const ent of opts.poles.values()) {
      const p = ent?.position?.getValue?.(viewer.clock.currentTime) ?? ent?.position;
      if (p) positions.push(p);
    }
    if (positions.length) {
      flyToPositions(Cesium, viewer, positions);
      return { ok: true };
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
      return { ok: true };
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

  if (!positions.length) {
    return { ok: false, reason: "No geometry to zoom for that layer" };
  }
  flyToPositions(Cesium, viewer, positions);
  return { ok: true };
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

/** Fired by CesiumViewer when an external tileset finishes loading. */
export function notifyTilesetReady(url: string) {
  window.dispatchEvent(
    new CustomEvent("twin-tileset-ready", { detail: { url } })
  );
}

export type TwinErrorEvent = {
  id: string;
  message: string;
  detail?: string;
  source: string;
};

export function reportTwinError(error: Omit<TwinErrorEvent, "id"> & { id?: string }) {
  const payload: TwinErrorEvent = {
    id:
      error.id ??
      `err-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    message: error.message,
    detail: error.detail,
    source: error.source,
  };
  window.dispatchEvent(
    new CustomEvent("twin-error", { detail: payload })
  );
  return payload;
}

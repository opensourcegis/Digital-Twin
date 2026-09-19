/* eslint-disable @typescript-eslint/no-explicit-any */
type CesiumNS = any;

export type SurfaceHit = {
  cartesian: any;
  lon: number;
  lat: number;
  height: number;
};

/**
 * Pick a point on the loaded tileset / globe under the cursor.
 * Rejects sky and near-camera depth artifacts that launch the robot upward.
 */
export function pickSurfaceCartesian(
  Cesium: CesiumNS,
  viewer: any,
  windowPosition: any,
  opts?: { tileset?: any | null; exclude?: any[] }
): SurfaceHit | null {
  const exclude = opts?.exclude?.filter(Boolean) ?? [];
  const tileset = opts?.tileset ?? null;
  const camPos = viewer.camera.positionWC;
  const bs = tileset?.boundingSphere ?? null;

  const candidates: any[] = [];

  const push = (p: any) => {
    if (p && Cesium.defined(p)) candidates.push(p);
  };

  // Prefer a real object hit first
  const pickedObj = viewer.scene.pick(windowPosition);
  if (pickedObj && viewer.scene.pickPositionSupported) {
    push(viewer.scene.pickPosition(windowPosition));
  }

  try {
    const ray = viewer.camera.getPickRay(windowPosition);
    if (ray && viewer.scene.pickFromRay) {
      const hit = viewer.scene.pickFromRay(ray, exclude);
      if (hit?.position) push(hit.position);
    }
  } catch {
    /* ignore */
  }

  if (viewer.scene.pickPositionSupported) {
    push(viewer.scene.pickPosition(windowPosition));
  }

  // Only use globe if no tileset is loaded — globe under a tileset is wrong
  if (!tileset) {
    try {
      const ray = viewer.camera.getPickRay(windowPosition);
      if (ray) push(viewer.scene.globe.pick(ray, viewer.scene));
    } catch {
      /* ignore */
    }
  }

  const camCarto = Cesium.Cartographic.fromCartesian(camPos);
  const camH =
    camCarto && Number.isFinite(camCarto.height) ? camCarto.height : 0;

  let best: (SurfaceHit & { score: number }) | null = null;

  for (const cartesian of candidates) {
    if (!cartesian || !Cesium.defined(cartesian)) continue;

    const distCam = Cesium.Cartesian3.distance(cartesian, camPos);
    if (!(distCam > 5 && distCam < 2_000_000)) continue;

    // When a tileset is active, require the hit to be inside its bounds
    if (bs) {
      const dBs = Cesium.Cartesian3.distance(cartesian, bs.center);
      const r = Math.max(bs.radius || 1, 1);
      if (dBs > r * 1.35) continue;
    }

    const carto = Cesium.Cartographic.fromCartesian(cartesian);
    if (!carto || !Number.isFinite(carto.height)) continue;
    const height = carto.height;

    // Sky / camera-plane junk
    if (distCam < 120 && Math.abs(height - camH) < 15) continue;
    if (height > camH - 1 && distCam < 250) continue;

    // Prefer closer to tileset center, then closer to camera
    let score = distCam;
    if (bs) {
      score =
        Cesium.Cartesian3.distance(cartesian, bs.center) + distCam * 0.05;
    }

    if (!best || score < best.score) {
      best = {
        cartesian,
        lon: Cesium.Math.toDegrees(carto.longitude),
        lat: Cesium.Math.toDegrees(carto.latitude),
        height,
        score,
      };
    }
  }

  if (!best) return null;

  let height = best.height;

  // Clamp down onto the mesh from just above the hit
  try {
    if (viewer.scene.clampToHeightSupported) {
      const probe = Cesium.Cartesian3.fromDegrees(
        best.lon,
        best.lat,
        height + 30
      );
      const clamped = viewer.scene.clampToHeight(probe, exclude);
      if (clamped) {
        const c = Cesium.Cartographic.fromCartesian(clamped);
        if (
          c &&
          Number.isFinite(c.height) &&
          Math.abs(c.height - height) < 80
        ) {
          height = c.height;
        }
      }
    }
  } catch {
    /* keep */
  }

  // If tileset known, keep height inside a sane band around the sphere
  if (bs) {
    const centerCarto = Cesium.Cartographic.fromCartesian(bs.center);
    if (centerCarto && Number.isFinite(centerCarto.height)) {
      const mid = centerCarto.height;
      const span = Math.max(bs.radius || 50, 50);
      height = Math.min(mid + span, Math.max(mid - span, height));
    }
  }

  height += 0.4; // sit chassis on surface

  return {
    cartesian: Cesium.Cartesian3.fromDegrees(best.lon, best.lat, height),
    lon: best.lon,
    lat: best.lat,
    height,
  };
}

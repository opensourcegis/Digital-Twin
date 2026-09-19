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
 * Lon/lat are EPSG:4326 degrees; height is WGS84 ellipsoidal meters.
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
  const ellipsoid = Cesium.Ellipsoid.WGS84;

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

  // Only use globe if no tileset — unless we need a fallback hit inside the tileset BV
  try {
    const ray = viewer.camera.getPickRay(windowPosition);
    if (ray) {
      const globeHit = viewer.scene.globe.pick(ray, viewer.scene);
      if (!tileset) {
        push(globeHit);
      } else if (globeHit && bs) {
        // Fallback when mesh depth pick fails but ray still hits near the tileset
        const dBs = Cesium.Cartesian3.distance(globeHit, bs.center);
        if (dBs <= Math.max(bs.radius, 1) * 1.5) push(globeHit);
      }
    }
  } catch {
    /* ignore */
  }

  // drillPick — collect several depth hits (tileset + overlays)
  try {
    if (viewer.scene.drillPick && viewer.scene.pickPositionSupported) {
      const drilled = viewer.scene.drillPick(windowPosition, 8);
      if (Array.isArray(drilled) && drilled.length) {
        push(viewer.scene.pickPosition(windowPosition));
      }
    }
  } catch {
    /* ignore */
  }

  const camCarto = Cesium.Cartographic.fromCartesian(camPos, ellipsoid);
  const camH =
    camCarto && Number.isFinite(camCarto.height) ? camCarto.height : 0;

  let best: (SurfaceHit & { score: number }) | null = null;

  for (const cartesian of candidates) {
    if (!cartesian || !Cesium.defined(cartesian)) continue;

    const distCam = Cesium.Cartesian3.distance(cartesian, camPos);
    if (!(distCam > 5 && distCam < 2_000_000)) continue;

    // When a tileset is active, require the hit to be inside its ECEF bounds
    if (bs) {
      const dBs = Cesium.Cartesian3.distance(cartesian, bs.center);
      const r = Math.max(bs.radius || 1, 1);
      if (dBs > r * 1.35) continue;
    }

    const carto = Cesium.Cartographic.fromCartesian(cartesian, ellipsoid);
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

  // Clamp down onto the mesh from just above the hit (WGS84)
  try {
    if (viewer.scene.clampToHeightSupported) {
      const probe = Cesium.Cartesian3.fromDegrees(
        best.lon,
        best.lat,
        height + 30,
        ellipsoid
      );
      const clamped = viewer.scene.clampToHeight(probe, exclude);
      if (clamped) {
        const c = Cesium.Cartographic.fromCartesian(clamped, ellipsoid);
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

  // Keep height inside tileset ECEF → WGS84 band
  if (bs) {
    const centerCarto = Cesium.Cartographic.fromCartesian(bs.center, ellipsoid);
    if (centerCarto && Number.isFinite(centerCarto.height)) {
      const mid = centerCarto.height;
      const span = Math.max(bs.radius || 50, 50);
      height = Math.min(mid + span * 0.55, Math.max(mid - span, height));
    }
  }

  height += 0.35; // sit chassis on surface

  return {
    cartesian: Cesium.Cartesian3.fromDegrees(
      best.lon,
      best.lat,
      height,
      ellipsoid
    ),
    lon: best.lon,
    lat: best.lat,
    height,
  };
}

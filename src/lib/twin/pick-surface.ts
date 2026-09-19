/* eslint-disable @typescript-eslint/no-explicit-any */
type CesiumNS = any;

/**
 * Pick a surface point under the cursor for robot placement.
 * Prefers real mesh hits (3D Tiles / globe); rejects sky / near-camera junk
 * that would send the unit into the air.
 */
export function pickSurfaceCartesian(
  Cesium: CesiumNS,
  viewer: any,
  windowPosition: any,
  opts?: { tileset?: any | null; exclude?: any[] }
): { cartesian: any; lon: number; lat: number; height: number } | null {
  const exclude = opts?.exclude?.filter(Boolean) ?? [];
  const tileset = opts?.tileset ?? null;
  const camPos = viewer.camera.positionWC;

  const candidates: any[] = [];

  // 1) Explicit object under cursor → depth pick
  const pickedObj = viewer.scene.pick(windowPosition);
  if (pickedObj && viewer.scene.pickPositionSupported) {
    const depthPos = viewer.scene.pickPosition(windowPosition);
    if (depthPos && Cesium.defined(depthPos)) candidates.push(depthPos);
  }

  // 2) Ray pick (tileset / entities)
  try {
    const ray = viewer.camera.getPickRay(windowPosition);
    if (ray && viewer.scene.pickFromRay) {
      const hit = viewer.scene.pickFromRay(ray, exclude);
      if (hit?.position) candidates.push(hit.position);
    }
  } catch {
    /* ignore */
  }

  // 3) Generic pickPosition
  if (viewer.scene.pickPositionSupported) {
    const p = viewer.scene.pickPosition(windowPosition);
    if (p && Cesium.defined(p)) candidates.push(p);
  }

  // 4) Globe ellipsoid
  try {
    const ray = viewer.camera.getPickRay(windowPosition);
    if (ray) {
      const g = viewer.scene.globe.pick(ray, viewer.scene);
      if (g) candidates.push(g);
    }
  } catch {
    /* ignore */
  }

  const camCarto = Cesium.Cartographic.fromCartesian(camPos);
  const camH =
    camCarto && Number.isFinite(camCarto.height) ? camCarto.height : 0;

  let best: {
    cartesian: any;
    lon: number;
    lat: number;
    height: number;
    score: number;
  } | null = null;

  for (const cartesian of candidates) {
    if (!cartesian || !Cesium.defined(cartesian)) continue;
    const dist = Cesium.Cartesian3.distance(cartesian, camPos);
    // Near-camera depth artifacts look like "sky" points
    if (!(dist > 3 && dist < 5_000_000)) continue;

    const carto = Cesium.Cartographic.fromCartesian(cartesian);
    if (!carto || !Number.isFinite(carto.height)) continue;
    const height = carto.height;
    // Reject points basically at the camera (sky click)
    if (Math.abs(height - camH) < 2 && dist < 80) continue;

    let score = dist;
    // Prefer hits near the loaded tileset
    if (tileset?.boundingSphere) {
      const dBs = Cesium.Cartesian3.distance(
        cartesian,
        tileset.boundingSphere.center
      );
      const r = tileset.boundingSphere.radius || 1;
      if (dBs > r * 2.5) score += 1e9; // far outside tileset — deprioritize
      else score = dBs;
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

  // Snap height onto mesh when supported
  let height = best.height;
  try {
    if (viewer.scene.clampToHeightSupported) {
      const probe = Cesium.Cartesian3.fromDegrees(
        best.lon,
        best.lat,
        height + 200
      );
      const clamped = viewer.scene.clampToHeight(probe, exclude);
      if (clamped) {
        const c = Cesium.Cartographic.fromCartesian(clamped);
        if (c && Number.isFinite(c.height)) height = c.height;
      }
    } else if (viewer.scene.sampleHeightSupported) {
      const carto = Cesium.Cartographic.fromDegrees(best.lon, best.lat);
      const h = viewer.scene.sampleHeight(carto, exclude);
      if (typeof h === "number" && Number.isFinite(h)) height = h;
    }
  } catch {
    /* keep best.height */
  }

  // Foot offset so chassis sits on surface
  height = Math.max(-500, height) + 0.35;

  return {
    cartesian: Cesium.Cartesian3.fromDegrees(best.lon, best.lat, height),
    lon: best.lon,
    lat: best.lat,
    height,
  };
}

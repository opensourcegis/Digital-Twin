/**
 * WGS84 / EPSG:4326 helpers for twin motion & height.
 * Cesium cartographics use the WGS84 ellipsoid; lon/lat are degrees in app state,
 * radians inside Cesium Cartographic. Heights are ellipsoidal (not orthometric/MSL).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

type CesiumNS = any;

/** WGS84 mean meters-per-degree approximations (fallback only). */
export function metersToLonLatDelta(
  eastM: number,
  northM: number,
  latDeg: number
) {
  const mPerDegLat = 110540;
  const mPerDegLon = 111320 * Math.cos((latDeg * Math.PI) / 180);
  return {
    dLon: eastM / Math.max(mPerDegLon, 1e-6),
    dLat: northM / Math.max(mPerDegLat, 1e-6),
  };
}

/**
 * Move along the local ENU tangent plane (easting/northing meters) on WGS84.
 * Returns new lon/lat/height (height from ellipsoid at the offset point —
 * caller should re-sample surface height afterward).
 */
export function offsetPoseEnu(
  Cesium: CesiumNS,
  pose: { lon: number; lat: number; height: number },
  eastM: number,
  northM: number,
  upM = 0
): { lon: number; lat: number; height: number } {
  const origin = Cesium.Cartesian3.fromDegrees(
    pose.lon,
    pose.lat,
    Math.max(0, pose.height),
    Cesium.Ellipsoid.WGS84
  );
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(
    origin,
    Cesium.Ellipsoid.WGS84
  );
  const local = new Cesium.Cartesian3(eastM, northM, upM);
  const next = Cesium.Matrix4.multiplyByPoint(
    enu,
    local,
    new Cesium.Cartesian3()
  );
  const carto = Cesium.Cartographic.fromCartesian(
    next,
    Cesium.Ellipsoid.WGS84
  );
  if (!carto) {
    const approx = metersToLonLatDelta(eastM, northM, pose.lat);
    return {
      lon: pose.lon + approx.dLon,
      lat: pose.lat + approx.dLat,
      height: pose.height + upM,
    };
  }
  return {
    lon: Cesium.Math.toDegrees(carto.longitude),
    lat: Cesium.Math.toDegrees(carto.latitude),
    height: carto.height,
  };
}

/** Ellipsoidal height band from a tileset bounding sphere (WGS84). */
export function tilesetHeightBand(
  Cesium: CesiumNS,
  tileset: any
): { mid: number; min: number; max: number } | null {
  const bs = tileset?.boundingSphere;
  if (!bs?.center || !(bs.radius > 0)) return null;
  const c = Cesium.Cartographic.fromCartesian(
    bs.center,
    Cesium.Ellipsoid.WGS84
  );
  if (!c || !Number.isFinite(c.height)) return null;
  const span = Math.max(bs.radius * 0.85, 40);
  return {
    mid: c.height,
    min: c.height - span,
    max: c.height + span * 0.6,
  };
}

/**
 * Sample surface height on WGS84. Prefer tileset/globe sampleHeight; never
 * ratchet skyward frame-to-frame (caps climb rate).
 */
export function sampleSurfaceHeightEnu(
  Cesium: CesiumNS,
  viewer: any,
  lon: number,
  lat: number,
  fallbackH: number,
  opts?: {
    exclude?: any[];
    tileset?: any | null;
    /** max meters the height may rise in one sample */
    maxClimbM?: number;
    /** max meters the height may drop in one sample */
    maxDropM?: number;
  }
): number {
  const exclude = opts?.exclude?.filter(Boolean) ?? [];
  const maxClimb = opts?.maxClimbM ?? 0.6;
  const maxDrop = opts?.maxDropM ?? 2.5;
  let h = fallbackH;
  let got = false;

  try {
    // sampleHeight is more stable than clampToHeight for walking (less self-hit)
    if (viewer.scene.sampleHeightSupported) {
      const carto = Cesium.Cartographic.fromDegrees(lon, lat);
      const sampled = viewer.scene.sampleHeight(carto, exclude);
      if (typeof sampled === "number" && Number.isFinite(sampled)) {
        h = sampled + 0.35;
        got = true;
      }
    }
    if (!got && viewer.scene.clampToHeightSupported) {
      const probe = Cesium.Cartesian3.fromDegrees(
        lon,
        lat,
        fallbackH + 6,
        Cesium.Ellipsoid.WGS84
      );
      const clamped = viewer.scene.clampToHeight(probe, exclude);
      if (clamped) {
        const c = Cesium.Cartographic.fromCartesian(
          clamped,
          Cesium.Ellipsoid.WGS84
        );
        if (c && Number.isFinite(c.height)) {
          h = c.height + 0.35;
          got = true;
        }
      }
    }
    if (!got) {
      const carto = Cesium.Cartographic.fromDegrees(lon, lat);
      const globeH = viewer.scene.globe?.getHeight?.(carto);
      if (typeof globeH === "number" && Number.isFinite(globeH)) {
        h = globeH + 0.35;
        got = true;
      }
    }
  } catch {
    return Math.max(0.05, fallbackH);
  }

  // Absolute band from tileset (prevents sky / underground)
  const band = tilesetHeightBand(Cesium, opts?.tileset);
  if (band) {
    h = Math.min(band.max, Math.max(band.min, h));
  }

  // Per-step ratchet guard — stops WS “floating upward”
  if (h > fallbackH + maxClimb) h = fallbackH + maxClimb;
  if (h < fallbackH - maxDrop) h = fallbackH - maxDrop;

  return Math.max(0.05, h);
}

/** True if lon/lat/height is inside (or near) the tileset ECEF bounding sphere. */
export function isPoseOnTileset(
  Cesium: CesiumNS,
  tileset: any,
  pose: { lon: number; lat: number; height: number },
  slack = 1.25
): boolean {
  const bs = tileset?.boundingSphere;
  if (!bs?.center || !(bs.radius > 0)) return false;
  const p = Cesium.Cartesian3.fromDegrees(
    pose.lon,
    pose.lat,
    Math.max(0, pose.height),
    Cesium.Ellipsoid.WGS84
  );
  return (
    Cesium.Cartesian3.distance(p, bs.center) <=
    Math.max(bs.radius, 1) * slack
  );
}

/**
 * Pose at tileset center on the mesh (WGS84). Used to bring the robot onto
 * the external layer when Click-to-move / Walk starts while still on campus.
 */
export function poseAtTilesetCenter(
  Cesium: CesiumNS,
  viewer: any,
  tileset: any,
  opts?: { exclude?: any[]; heading?: number }
): { lon: number; lat: number; height: number; heading: number } | null {
  const bs = tileset?.boundingSphere;
  if (!bs?.center) return null;
  const c = Cesium.Cartographic.fromCartesian(
    bs.center,
    Cesium.Ellipsoid.WGS84
  );
  if (!c) return null;
  const lon = Cesium.Math.toDegrees(c.longitude);
  const lat = Cesium.Math.toDegrees(c.latitude);
  const band = tilesetHeightBand(Cesium, tileset);
  const seedH = band?.mid ?? c.height ?? 0;
  const height = sampleSurfaceHeightEnu(Cesium, viewer, lon, lat, seedH, {
    exclude: opts?.exclude ?? [],
    tileset,
    maxClimbM: 80,
    maxDropM: 80,
  });
  return {
    lon,
    lat,
    height,
    heading: opts?.heading ?? 0,
  };
}

/**
 * Campus road network — snap robot motion to demo roads so it stays outdoors.
 */

export type LonLat = { lon: number; lat: number };

type Seg = { a: LonLat; b: LonLat };

const ROAD_COORDS: [number, number][][] = [
  // Main Spine
  [
    [-122.1357, 37.4218],
    [-122.1345, 37.4219],
    [-122.1335, 37.422],
    [-122.1324, 37.4221],
  ],
  // Lab Loop
  [
    [-122.1335, 37.422],
    [-122.1335, 37.4226],
    [-122.1328, 37.4228],
    [-122.1325, 37.4224],
  ],
  // Warehouse Alley
  [
    [-122.1348, 37.4219],
    [-122.1348, 37.4215],
    [-122.1335, 37.4215],
    [-122.1335, 37.422],
  ],
];

function buildSegments(): Seg[] {
  const segs: Seg[] = [];
  for (const line of ROAD_COORDS) {
    for (let i = 1; i < line.length; i++) {
      segs.push({
        a: { lon: line[i - 1][0], lat: line[i - 1][1] },
        b: { lon: line[i][0], lat: line[i][1] },
      });
    }
  }
  return segs;
}

const SEGMENTS = buildSegments();

/** Sample points along roads for wander goals */
export function roadSamplePoints(count = 24): LonLat[] {
  const pts: LonLat[] = [];
  const perSeg = Math.max(2, Math.ceil(count / SEGMENTS.length));
  for (const s of SEGMENTS) {
    for (let i = 0; i < perSeg; i++) {
      const t = (i + 0.5) / perSeg;
      pts.push({
        lon: s.a.lon + (s.b.lon - s.a.lon) * t,
        lat: s.a.lat + (s.b.lat - s.a.lat) * t,
      });
    }
  }
  return pts;
}

function dist2(a: LonLat, b: LonLat) {
  const dLon = (a.lon - b.lon) * Math.cos((a.lat * Math.PI) / 180);
  const dLat = a.lat - b.lat;
  return dLon * dLon + dLat * dLat;
}

function projectToSegment(p: LonLat, a: LonLat, b: LonLat): LonLat {
  const ax = a.lon;
  const ay = a.lat;
  const bx = b.lon;
  const by = b.lat;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-18) return { lon: ax, lat: ay };
  let t = ((p.lon - ax) * dx + (p.lat - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return { lon: ax + dx * t, lat: ay + dy * t };
}

/** Snap a lon/lat onto the nearest campus road centerline. */
export function snapToCampusRoads(lon: number, lat: number): LonLat {
  const p = { lon, lat };
  let best = projectToSegment(p, SEGMENTS[0].a, SEGMENTS[0].b);
  let bestD = dist2(p, best);
  for (let i = 1; i < SEGMENTS.length; i++) {
    const q = projectToSegment(p, SEGMENTS[i].a, SEGMENTS[i].b);
    const d = dist2(p, q);
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best;
}

/**
 * Soft road corridor for WASD — keep the robot near roads without projecting
 * every step onto the centerline (hard snap made W always slide along one axis).
 */
export function constrainToCampusRoads(
  lon: number,
  lat: number,
  corridorM = 10
): LonLat {
  const snapped = snapToCampusRoads(lon, lat);
  const mPerDegLat = 110540;
  const mPerDegLon = 111320 * Math.cos((lat * Math.PI) / 180);
  const dx = (lon - snapped.lon) * mPerDegLon;
  const dy = (lat - snapped.lat) * mPerDegLat;
  const dist = Math.hypot(dx, dy);
  if (dist <= corridorM || dist < 1e-6) return { lon, lat };
  const scale = corridorM / dist;
  return {
    lon: snapped.lon + (dx * scale) / mPerDegLon,
    lat: snapped.lat + (dy * scale) / mPerDegLat,
  };
}

/** True if point is within ~corridorM meters of a road. */
export function nearCampusRoad(
  lon: number,
  lat: number,
  corridorM = 8
): boolean {
  const snapped = snapToCampusRoads(lon, lat);
  const mPerDegLat = 110540;
  const mPerDegLon = 111320 * Math.cos((lat * Math.PI) / 180);
  const dx = (lon - snapped.lon) * mPerDegLon;
  const dy = (lat - snapped.lat) * mPerDegLat;
  return Math.hypot(dx, dy) <= corridorM;
}

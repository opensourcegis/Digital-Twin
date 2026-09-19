/* eslint-disable @typescript-eslint/no-explicit-any */
type CesiumNS = any;

export interface RobotPose {
  lon: number;
  lat: number;
  height: number;
  heading: number;
}

/** Campus walk / roam bounds (EPSG:4326) */
export const ROBOT_BOUNDS = {
  minLon: -122.1362,
  maxLon: -122.1318,
  minLat: 37.4212,
  maxLat: 37.4236,
};

export const ROBOT_SPAWN: RobotPose = {
  lon: -122.1339,
  lat: 37.42205,
  height: 0.15,
  heading: (35 * Math.PI) / 180,
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/** Meters → degrees at campus latitude */
function metersToLonLat(eastM: number, northM: number, lat: number) {
  const mPerDegLat = 110540;
  const mPerDegLon = 111320 * Math.cos((lat * Math.PI) / 180);
  return { dLon: eastM / mPerDegLon, dLat: northM / mPerDegLat };
}

/**
 * Autonomous campus roam — steers toward a soft random goal, no fixed route.
 * Goals are re-picked when reached or after a timeout.
 */
export function createWanderController(seed = 1) {
  let goal: { lon: number; lat: number } | null = null;
  let goalAge = 0;
  let rng = seed;

  const nextRand = () => {
    rng = (rng * 1664525 + 1013904223) >>> 0;
    return rng / 0xffffffff;
  };

  const pickGoal = () => {
    goal = {
      lon:
        ROBOT_BOUNDS.minLon +
        nextRand() * (ROBOT_BOUNDS.maxLon - ROBOT_BOUNDS.minLon),
      lat:
        ROBOT_BOUNDS.minLat +
        nextRand() * (ROBOT_BOUNDS.maxLat - ROBOT_BOUNDS.minLat),
    };
    goalAge = 0;
  };

  pickGoal();

  return {
    step(pose: RobotPose, dt: number, speedMps: number): RobotPose {
      if (!goal) pickGoal();
      goalAge += dt;

      const dLon = goal!.lon - pose.lon;
      const dLat = goal!.lat - pose.lat;
      const targetHeading = Math.atan2(dLon, dLat);

      // Steer smoothly toward goal
      let dh = targetHeading - pose.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      const turnRate = 1.1; // rad/s
      const heading =
        pose.heading + clamp(dh, -turnRate * dt, turnRate * dt);

      const distM = Math.hypot(
        dLon * 111320 * Math.cos((pose.lat * Math.PI) / 180),
        dLat * 110540
      );

      if (distM < 4 || goalAge > 28) pickGoal();

      const move = speedMps * dt;
      const { dLon: e, dLat: n } = metersToLonLat(
        Math.sin(heading) * move,
        Math.cos(heading) * move,
        pose.lat
      );

      return {
        lon: clamp(pose.lon + e, ROBOT_BOUNDS.minLon, ROBOT_BOUNDS.maxLon),
        lat: clamp(pose.lat + n, ROBOT_BOUNDS.minLat, ROBOT_BOUNDS.maxLat),
        height: pose.height,
        heading,
      };
    },
    reset() {
      pickGoal();
    },
  };
}

export function poseToCartesian(Cesium: CesiumNS, pose: RobotPose) {
  return Cesium.Cartesian3.fromDegrees(pose.lon, pose.lat, pose.height);
}

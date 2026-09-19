/* eslint-disable @typescript-eslint/no-explicit-any */
type CesiumNS = any;

import { roadSamplePoints, snapToCampusRoads } from "@/lib/twin/campus-roads";

export interface RobotPose {
  lon: number;
  lat: number;
  height: number;
  heading: number;
}

export interface WanderBounds {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

/** Campus walk / roam bounds (EPSG:4326) — defaults; prefer platform settings. */
export const ROBOT_BOUNDS: WanderBounds = {
  minLon: -122.1362,
  maxLon: -122.1318,
  minLat: 37.4212,
  maxLat: 37.4236,
};

const snappedSpawn = snapToCampusRoads(-122.1339, 37.42205);

export const ROBOT_SPAWN: RobotPose = {
  lon: snappedSpawn.lon,
  lat: snappedSpawn.lat,
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

export interface WanderOptions {
  bounds?: WanderBounds;
  turnRateRad?: number;
  goalTimeoutSec?: number;
  seed?: number;
}

/**
 * Autonomous roam along campus roads only (never through building footprints).
 */
export function createWanderController(options: WanderOptions | number = {}) {
  const opts: WanderOptions =
    typeof options === "number" ? { seed: options } : options;
  const bounds = opts.bounds ?? ROBOT_BOUNDS;
  const turnRate = opts.turnRateRad ?? 1.1;
  const goalTimeout = opts.goalTimeoutSec ?? 28;
  const roadPts = roadSamplePoints(28);
  let goal: { lon: number; lat: number } | null = null;
  let goalAge = 0;
  let rng = opts.seed ?? 1;

  const nextRand = () => {
    rng = (rng * 1664525 + 1013904223) >>> 0;
    return rng / 0xffffffff;
  };

  const pickGoal = () => {
    const p = roadPts[Math.floor(nextRand() * roadPts.length)] ?? roadPts[0];
    goal = {
      lon: clamp(p.lon, bounds.minLon, bounds.maxLon),
      lat: clamp(p.lat, bounds.minLat, bounds.maxLat),
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

      let dh = targetHeading - pose.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      const heading =
        pose.heading + clamp(dh, -turnRate * dt, turnRate * dt);

      const distM = Math.hypot(
        dLon * 111320 * Math.cos((pose.lat * Math.PI) / 180),
        dLat * 110540
      );

      if (distM < 3 || goalAge > goalTimeout) pickGoal();

      const move = speedMps * dt;
      const { dLon: e, dLat: n } = metersToLonLat(
        Math.sin(heading) * move,
        Math.cos(heading) * move,
        pose.lat
      );

      const raw = {
        lon: clamp(pose.lon + e, bounds.minLon, bounds.maxLon),
        lat: clamp(pose.lat + n, bounds.minLat, bounds.maxLat),
      };
      const snapped = snapToCampusRoads(raw.lon, raw.lat);
      return {
        lon: snapped.lon,
        lat: snapped.lat,
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

export function spawnFromSettings(spawn: {
  lon: number;
  lat: number;
  height: number;
  headingDeg: number;
}): RobotPose {
  const snapped = snapToCampusRoads(spawn.lon, spawn.lat);
  return {
    lon: snapped.lon,
    lat: snapped.lat,
    height: spawn.height,
    heading: (spawn.headingDeg * Math.PI) / 180,
  };
}

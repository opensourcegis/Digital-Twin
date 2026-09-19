import { snapToCampusRoads } from "@/lib/twin/campus-roads";

/* eslint-disable @typescript-eslint/no-explicit-any */
type CesiumNS = any;

/** Campus walk bounds (EPSG:4326) — keep robot on site */
const WALK_BOUNDS = {
  minLon: -122.1362,
  maxLon: -122.1318,
  minLat: 37.4212,
  maxLat: 37.4236,
};

let chaseHoldUntil = 0;

/** Pause chase-camera follow so zoom-to-layer / orbit flies can complete. */
export function pauseWalkChase(ms = 10_000) {
  chaseHoldUntil = performance.now() + ms;
}

export function isWalkChasePaused() {
  return performance.now() < chaseHoldUntil;
}

const MOVE_SPEED_M_S = 8;
const TURN_RATE_RAD = 1.8;
const LOOK_SENS = 0.005;
const ZOOM_SENS = 0.04;

/** Chase camera — zoomed out enough to see the robot body move. */
const CHASE_BACK_M = 28;
const CHASE_UP_M = 16;
const CHASE_PITCH = (-32 * Math.PI) / 180;
const CHASE_BACK_MIN = 12;
const CHASE_BACK_MAX = 55;
const CHASE_UP_MIN = 8;
const CHASE_UP_MAX = 32;

const MOVE_KEYS = new Set([
  "arrowup",
  "arrowdown",
  "arrowleft",
  "arrowright",
  "w",
  "a",
  "s",
  "d",
]);

export function isMoveKey(key: string): boolean {
  return MOVE_KEYS.has(key.toLowerCase());
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function metersToLonLat(eastM: number, northM: number, lat: number) {
  const mPerDegLat = 110540;
  const mPerDegLon = 111320 * Math.cos((lat * Math.PI) / 180);
  return { dLon: eastM / mPerDegLon, dLat: northM / mPerDegLat };
}

export interface WalkPose {
  lon: number;
  lat: number;
  height: number;
  heading: number;
}

export interface WalkDriver {
  getPose: () => WalkPose;
  setPose: (pose: WalkPose) => void;
}

/**
 * Third-person chase camera behind/above the robot so movement is visible.
 * Uses fixed ellipsoid heights — never samples terrain (avoids globe jump).
 */
export function applyWalkCamera(
  Cesium: CesiumNS,
  viewer: any,
  pose: WalkPose,
  opts?: {
    yawOffset?: number;
    pitchRad?: number;
    backM?: number;
    upM?: number;
  }
) {
  const yawOffset = opts?.yawOffset ?? 0;
  const pitchRad = opts?.pitchRad ?? CHASE_PITCH;
  const backM = opts?.backM ?? CHASE_BACK_M;
  const upM = opts?.upM ?? CHASE_UP_M;
  const viewHeading = pose.heading + yawOffset;

  const robotPos = Cesium.Cartesian3.fromDegrees(
    pose.lon,
    pose.lat,
    Math.max(0.15, pose.height)
  );
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(robotPos);
  const local = new Cesium.Cartesian3(
    -Math.sin(viewHeading) * backM,
    -Math.cos(viewHeading) * backM,
    upM
  );
  const camPos = Cesium.Matrix4.multiplyByPoint(
    enu,
    local,
    new Cesium.Cartesian3()
  );

  viewer.camera.setView({
    destination: camPos,
    orientation: {
      heading: viewHeading,
      pitch: pitchRad,
      roll: 0,
    },
  });
  viewer.scene.requestRender();
}

export function enterWalkCamera(
  Cesium: CesiumNS,
  viewer: any,
  pose?: WalkPose | null
) {
  const p: WalkPose = pose ?? {
    lon: -122.1339,
    lat: 37.42205,
    height: 0.15,
    heading: (35 * Math.PI) / 180,
  };
  viewer.camera.cancelFlight?.();
  applyWalkCamera(Cesium, viewer, p);
}

/**
 * Game-style WASD: moves the robot on campus.
 * Chase camera stays zoomed out behind the unit so you see it move.
 * Drag orbits; wheel zooms chase distance.
 */
export function attachKeyboardWalk(
  viewer: any,
  Cesium: CesiumNS,
  getMode: () => "off" | "first" | "third" | "walk",
  driver: WalkDriver,
  onActive?: () => void
) {
  const keys = new Set<string>();
  let raf: number | null = null;
  let last = performance.now();
  let lastMode: ReturnType<typeof getMode> | null = null;
  let yawOffset = 0;
  let lookPitch = CHASE_PITCH;
  let backM = CHASE_BACK_M;
  let upM = CHASE_UP_M;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let savedController: {
    enableTranslate: boolean;
    enableZoom: boolean;
    enableTilt: boolean;
    enableLook: boolean;
    enableRotate: boolean;
  } | null = null;

  const camOpts = () => ({
    yawOffset,
    pitchRad: lookPitch,
    backM,
    upM,
  });

  const applyController = (walk: boolean) => {
    const ctrl = viewer.scene.screenSpaceCameraController;
    if (walk) {
      if (!savedController) {
        savedController = {
          enableTranslate: ctrl.enableTranslate,
          enableZoom: ctrl.enableZoom,
          enableTilt: ctrl.enableTilt,
          enableLook: ctrl.enableLook,
          enableRotate: ctrl.enableRotate,
        };
      }
      ctrl.enableTranslate = false;
      ctrl.enableTilt = false;
      ctrl.enableZoom = false;
      ctrl.enableLook = false;
      ctrl.enableRotate = false;
    } else if (savedController) {
      ctrl.enableTranslate = savedController.enableTranslate;
      ctrl.enableZoom = savedController.enableZoom;
      ctrl.enableTilt = savedController.enableTilt;
      ctrl.enableLook = savedController.enableLook;
      ctrl.enableRotate = savedController.enableRotate;
      savedController = null;
    }
  };

  const tick = (now: number) => {
    const mode = getMode();
    if (mode !== lastMode) {
      applyController(mode === "walk");
      if (mode === "walk") {
        viewer.camera.cancelFlight?.();
        yawOffset = 0;
        lookPitch = CHASE_PITCH;
        backM = CHASE_BACK_M;
        upM = CHASE_UP_M;
        applyWalkCamera(Cesium, viewer, driver.getPose(), camOpts());
      }
      lastMode = mode;
    }
    if (mode !== "walk") {
      raf = requestAnimationFrame(tick);
      last = now;
      return;
    }

    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    let pose = { ...driver.getPose() };
    let moved = false;

    const forward =
      keys.has("arrowup") || keys.has("w") || keys.has("W");
    const back = keys.has("arrowdown") || keys.has("s") || keys.has("S");
    const left = keys.has("arrowleft") || keys.has("a") || keys.has("A");
    const right = keys.has("arrowright") || keys.has("d") || keys.has("D");

    if (forward || back || left || right) {
      onActive?.();
      // A/D (or arrows) turn the robot so rotation is visible in chase view
      if (left) pose.heading -= TURN_RATE_RAD * dt;
      if (right) pose.heading += TURN_RATE_RAD * dt;
      while (pose.heading > Math.PI) pose.heading -= Math.PI * 2;
      while (pose.heading < -Math.PI) pose.heading += Math.PI * 2;

      let east = 0;
      let north = 0;
      const h = pose.heading;
      const distF = MOVE_SPEED_M_S * dt;
      if (forward) {
        east += Math.sin(h) * distF;
        north += Math.cos(h) * distF;
      }
      if (back) {
        east -= Math.sin(h) * distF;
        north -= Math.cos(h) * distF;
      }
      if (east !== 0 || north !== 0) {
        const { dLon, dLat } = metersToLonLat(east, north, pose.lat);
        const rawLon = clamp(
          pose.lon + dLon,
          WALK_BOUNDS.minLon,
          WALK_BOUNDS.maxLon
        );
        const rawLat = clamp(
          pose.lat + dLat,
          WALK_BOUNDS.minLat,
          WALK_BOUNDS.maxLat
        );
        const snapped = snapToCampusRoads(rawLon, rawLat);
        pose = {
          ...pose,
          lon: snapped.lon,
          lat: snapped.lat,
          height: Math.max(0.12, pose.height),
        };
      } else {
        pose = { ...pose };
      }
      moved = true;
    }

    if (moved) {
      driver.setPose(pose);
    }

    // Chase camera follows so the robot body stays in frame
    if (!isWalkChasePaused()) {
      applyWalkCamera(Cesium, viewer, driver.getPose(), camOpts());
    }
    viewer.scene.requestRenderMode = false;

    raf = requestAnimationFrame(tick);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (getMode() !== "walk") return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    const k = e.key.toLowerCase();
    if (!isMoveKey(e.key) && !isMoveKey(k)) return;
    e.preventDefault();
    keys.add(k);
    keys.add(e.key);
  };

  const onKeyUp = (e: KeyboardEvent) => {
    keys.delete(e.key.toLowerCase());
    keys.delete(e.key);
  };

  const onBlur = () => keys.clear();

  const onPointerDown = (e: PointerEvent) => {
    if (getMode() !== "walk") return;
    if (e.button !== 0) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    try {
      (e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragging || getMode() !== "walk") return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    // Orbit around robot (don't turn robot body on look — WASD owns heading)
    yawOffset += dx * LOOK_SENS;
    while (yawOffset > Math.PI) yawOffset -= Math.PI * 2;
    while (yawOffset < -Math.PI) yawOffset += Math.PI * 2;
    lookPitch = clamp(
      lookPitch - dy * LOOK_SENS,
      (-55 * Math.PI) / 180,
      (-12 * Math.PI) / 180
    );
    onActive?.();
  };

  const onPointerUp = (e: PointerEvent) => {
    dragging = false;
    try {
      (e.target as HTMLElement)?.releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onWheel = (e: WheelEvent) => {
    if (getMode() !== "walk") return;
    e.preventDefault();
    const delta = Math.sign(e.deltaY) * (2 + backM * ZOOM_SENS);
    backM = clamp(backM + delta, CHASE_BACK_MIN, CHASE_BACK_MAX);
    upM = clamp(upM + delta * 0.45, CHASE_UP_MIN, CHASE_UP_MAX);
  };

  const canvas = viewer.scene.canvas as HTMLCanvasElement;
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  raf = requestAnimationFrame(tick);

  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
    canvas.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("wheel", onWheel);
    if (raf) cancelAnimationFrame(raf);
    applyController(false);
  };
}

import {
  offsetPoseEnu,
  sampleSurfaceHeightEnu,
} from "@/lib/twin/geo-frame";

/* eslint-disable @typescript-eslint/no-explicit-any */
type CesiumNS = any;

/** Campus walk bounds (EPSG:4326 / WGS84) — keep robot on site in demo mode */
export const CAMPUS_WALK_BOUNDS = {
  minLon: -122.1362,
  maxLon: -122.1318,
  minLat: 37.4212,
  maxLat: 37.4236,
};

let chaseHoldUntil = 0;

/** Pause chase-camera follow so zoom-to-layer / orbit flies can complete. */
export function pauseWalkChase(ms = 10_000) {
  chaseHoldUntil = ms <= 0 ? 0 : performance.now() + ms;
}

export function isWalkChasePaused() {
  return performance.now() < chaseHoldUntil;
}

const MOVE_SPEED_M_S = 6;
const TURN_RATE_RAD = 1.8;
const LOOK_SENS = 0.005;
const ZOOM_SENS = 0.04;

/** Chase camera — zoomed out enough to see the robot body move. */
const CHASE_BACK_M = 14;
const CHASE_UP_M = 8;
const CHASE_PITCH = (-28 * Math.PI) / 180;
const CHASE_BACK_MIN = 6;
const CHASE_BACK_MAX = 36;
const CHASE_UP_MIN = 4;
const CHASE_UP_MAX = 20;

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

export type WalkSurfaceMode = "campus" | "tileset";

export interface WalkAttachOptions {
  /** campus = road snap + campus bounds; tileset = free surface + sampled height */
  getSurfaceMode?: () => WalkSurfaceMode;
  /** Exclude robot entities from height sampling */
  getExcludeObjects?: () => any[];
  /** Active 3D Tileset for WGS84 height banding */
  getTileset?: () => any | null;
  /** When false, left-drag won't orbit (e.g. while click-to-place is active) */
  getAllowOrbitDrag?: () => boolean;
  /**
   * When true, never snap the chase camera to the robot — keep the current view
   * (Click-to-move on an external tileset must not yank back to the robot).
   */
  getHoldCamera?: () => boolean;
}

/** @deprecated Prefer sampleSurfaceHeightEnu from geo-frame */
export function sampleSurfaceHeight(
  Cesium: CesiumNS,
  viewer: any,
  lon: number,
  lat: number,
  fallbackH: number,
  exclude: any[] = []
): number {
  return sampleSurfaceHeightEnu(Cesium, viewer, lon, lat, fallbackH, {
    exclude,
    maxClimbM: 0.6,
    maxDropM: 2.5,
  });
}

/**
 * Third-person chase camera — locked lookAt so it never eases through the sky.
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
    Math.max(0.05, pose.height),
    Cesium.Ellipsoid.WGS84
  );

  // Cancel any in-flight zoom/fly that would arc through space
  viewer.camera.cancelFlight?.();

  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(
    robotPos,
    Cesium.Ellipsoid.WGS84
  );
  // ENU: +X east, +Y north, +Z up — stay behind robot along heading
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

  // Instant set — no flyTo
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
 * Game-style WASD. Campus mode snaps to roads; tileset mode walks the mesh surface.
 */
export function attachKeyboardWalk(
  viewer: any,
  Cesium: CesiumNS,
  getMode: () => "off" | "first" | "third" | "walk",
  driver: WalkDriver,
  onActive?: () => void,
  options?: WalkAttachOptions
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

  const getSurfaceMode = () => options?.getSurfaceMode?.() ?? "campus";
  const getExclude = () => options?.getExcludeObjects?.() ?? [];
  const getTileset = () => options?.getTileset?.() ?? null;
  const getAllowOrbit = () => options?.getAllowOrbitDrag?.() ?? true;
  const holdCamera = () =>
    Boolean(options?.getHoldCamera?.()) || isWalkChasePaused();

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
        // Do NOT yank to robot when Click-to-move / zoom hold is active —
        // user may be looking at an external tileset to place on.
        if (!holdCamera()) {
          applyWalkCamera(Cesium, viewer, driver.getPose(), camOpts());
        }
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
    const surface = getSurfaceMode();

    let pose = { ...driver.getPose() };
    let moved = false;

    const forward =
      keys.has("arrowup") || keys.has("w") || keys.has("W");
    const back = keys.has("arrowdown") || keys.has("s") || keys.has("S");
    const left = keys.has("arrowleft") || keys.has("a") || keys.has("A");
    const right = keys.has("arrowright") || keys.has("d") || keys.has("D");

    if (forward || back || left || right) {
      onActive?.();
      // A/D turn the robot in place
      if (left) pose.heading -= TURN_RATE_RAD * dt;
      if (right) pose.heading += TURN_RATE_RAD * dt;

      // Third-person: W/S drive along the camera view — absorb orbit yaw into heading
      // so “forward” matches where the chase cam is looking (not a fixed world axis).
      if ((forward || back) && Math.abs(yawOffset) > 1e-3) {
        pose.heading += yawOffset;
        yawOffset = 0;
      }

      while (pose.heading > Math.PI) pose.heading -= Math.PI * 2;
      while (pose.heading < -Math.PI) pose.heading += Math.PI * 2;

      // Heading 0 = north, π/2 = east — move on ENU tangent (WGS84), never +up
      let east = 0;
      let north = 0;
      const hdg = pose.heading;
      const distF = MOVE_SPEED_M_S * dt;
      if (forward) {
        east += Math.sin(hdg) * distF;
        north += Math.cos(hdg) * distF;
      }
      if (back) {
        east -= Math.sin(hdg) * distF;
        north -= Math.cos(hdg) * distF;
      }
      if (east !== 0 || north !== 0) {
        // upM = 0 → stay on local tangent plane (fixes WS “flying upward”)
        const stepped = offsetPoseEnu(Cesium, pose, east, north, 0);
        let lon = stepped.lon;
        let lat = stepped.lat;
        if (surface === "campus") {
          lon = clamp(lon, CAMPUS_WALK_BOUNDS.minLon, CAMPUS_WALK_BOUNDS.maxLon);
          lat = clamp(lat, CAMPUS_WALK_BOUNDS.minLat, CAMPUS_WALK_BOUNDS.maxLat);
          // Free roam inside campus bounds — no road corridor fence
        }
        const height = sampleSurfaceHeightEnu(
          Cesium,
          viewer,
          lon,
          lat,
          pose.height,
          {
            exclude: getExclude(),
            tileset: surface === "tileset" ? getTileset() : null,
            maxClimbM: 0.45,
            maxDropM: 2.2,
          }
        );
        pose = { ...pose, lon, lat, height };
      } else {
        pose = { ...pose };
      }
      moved = true;
    }

    if (moved) {
      driver.setPose(pose);
    }

    if (!holdCamera()) {
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
    if (!getAllowOrbit()) return;
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

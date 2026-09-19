/* eslint-disable @typescript-eslint/no-explicit-any */
type CesiumNS = any;

/** Campus walk bounds (EPSG:4326) — keep robot on site */
const WALK_BOUNDS = {
  minLon: -122.1362,
  maxLon: -122.1318,
  minLat: 37.4212,
  maxLat: 37.4236,
};

/** Fixed eye height above ellipsoid — avoid terrain sampling (globe-scale bugs). */
export const WALK_EYE_HEIGHT_M = 1.75;
const MOVE_SPEED_M_S = 8;
const STRAFE_SPEED_M_S = 6.5;
const LOOK_SENS = 0.005;

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

/** Place camera at robot eye — never sample terrain (prevents globe jump). */
export function applyWalkCamera(
  Cesium: CesiumNS,
  viewer: any,
  pose: WalkPose,
  pitchRad = Cesium.Math.toRadians(-8)
) {
  const eye = Cesium.Cartesian3.fromDegrees(
    pose.lon,
    pose.lat,
    Math.max(WALK_EYE_HEIGHT_M, pose.height + WALK_EYE_HEIGHT_M)
  );
  viewer.camera.setView({
    destination: eye,
    orientation: {
      heading: pose.heading,
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
    heading: Cesium.Math.toRadians(35),
  };
  // Cancel any in-flight camera tween that could yank to space
  viewer.camera.cancelFlight?.();
  applyWalkCamera(Cesium, viewer, p);
}

/**
 * Game-style WASD: moves the robot on campus; camera locked to cab view.
 * Mouse drag looks (heading + pitch). No free-fly / no terrain clamp.
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
  let lookPitch = Cesium.Math.toRadians(-8);
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
      // Lock Cesium navigation — we own camera via robot pose
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
        applyWalkCamera(Cesium, viewer, driver.getPose(), lookPitch);
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
      let east = 0;
      let north = 0;
      const h = pose.heading;
      const distF = MOVE_SPEED_M_S * dt;
      const distS = STRAFE_SPEED_M_S * dt;
      if (forward) {
        east += Math.sin(h) * distF;
        north += Math.cos(h) * distF;
      }
      if (back) {
        east -= Math.sin(h) * distF;
        north -= Math.cos(h) * distF;
      }
      if (left) {
        east += Math.sin(h - Math.PI / 2) * distS;
        north += Math.cos(h - Math.PI / 2) * distS;
      }
      if (right) {
        east += Math.sin(h + Math.PI / 2) * distS;
        north += Math.cos(h + Math.PI / 2) * distS;
      }
      const { dLon, dLat } = metersToLonLat(east, north, pose.lat);
      pose = {
        ...pose,
        lon: clamp(pose.lon + dLon, WALK_BOUNDS.minLon, WALK_BOUNDS.maxLon),
        lat: clamp(pose.lat + dLat, WALK_BOUNDS.minLat, WALK_BOUNDS.maxLat),
        height: Math.max(0.12, pose.height),
      };
      moved = true;
    }

    if (moved) {
      driver.setPose(pose);
    }

    // Always keep cab camera glued to robot while walking
    applyWalkCamera(Cesium, viewer, driver.getPose(), lookPitch);
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
    const pose = { ...driver.getPose() };
    pose.heading = pose.heading + dx * LOOK_SENS;
    while (pose.heading > Math.PI) pose.heading -= Math.PI * 2;
    while (pose.heading < -Math.PI) pose.heading += Math.PI * 2;
    lookPitch = clamp(
      lookPitch - dy * LOOK_SENS,
      Cesium.Math.toRadians(-60),
      Cesium.Math.toRadians(20)
    );
    driver.setPose(pose);
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

  const canvas = viewer.scene.canvas as HTMLCanvasElement;
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  raf = requestAnimationFrame(tick);

  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
    canvas.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    if (raf) cancelAnimationFrame(raf);
    applyController(false);
  };
}

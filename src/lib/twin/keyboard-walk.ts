/* eslint-disable @typescript-eslint/no-explicit-any */
type CesiumNS = any;

/** Campus walk bounds (EPSG:4326) — keep avatar on site */
const WALK_BOUNDS = {
  minLon: -122.1362,
  maxLon: -122.1318,
  minLat: 37.4212,
  maxLat: 37.4236,
};

const EYE_HEIGHT_M = 1.75;
const MOVE_SPEED_M_S = 12;
const STRAFE_SPEED_M_S = 10;

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

function horizontalMove(
  Cesium: CesiumNS,
  origin: any,
  headingRad: number,
  distanceM: number
) {
  const ellipsoid = Cesium.Ellipsoid.WGS84;
  const normal = ellipsoid.geodeticSurfaceNormal(origin, new Cesium.Cartesian3());
  const east = Cesium.Cartesian3.cross(
    Cesium.Cartesian3.UNIT_Z,
    normal,
    new Cesium.Cartesian3()
  );
  Cesium.Cartesian3.normalize(east, east);
  const north = Cesium.Cartesian3.cross(normal, east, new Cesium.Cartesian3());
  const dir = new Cesium.Cartesian3();
  Cesium.Cartesian3.multiplyByScalar(north, Math.cos(headingRad), dir);
  Cesium.Cartesian3.add(
    dir,
    Cesium.Cartesian3.multiplyByScalar(
      east,
      Math.sin(headingRad),
      new Cesium.Cartesian3()
    ),
    dir
  );
  Cesium.Cartesian3.normalize(dir, dir);
  return Cesium.Cartesian3.add(
    origin,
    Cesium.Cartesian3.multiplyByScalar(dir, distanceM, new Cesium.Cartesian3()),
    new Cesium.Cartesian3()
  );
}

function clampToCampus(Cesium: CesiumNS, cartesian: any) {
  const carto = Cesium.Cartographic.fromCartesian(cartesian);
  let lon = Cesium.Math.toDegrees(carto.longitude);
  let lat = Cesium.Math.toDegrees(carto.latitude);
  lon = clamp(lon, WALK_BOUNDS.minLon, WALK_BOUNDS.maxLon);
  lat = clamp(lat, WALK_BOUNDS.minLat, WALK_BOUNDS.maxLat);
  return Cesium.Cartesian3.fromRadians(
    Cesium.Math.toRadians(lon),
    Cesium.Math.toRadians(lat),
    carto.height
  );
}

function clampToGround(Cesium: CesiumNS, viewer: any, cartesian: any) {
  const carto = Cesium.Cartographic.fromCartesian(cartesian);
  let ground =
    viewer.scene.globe.getHeight(carto) ??
    viewer.scene.sampleHeight(carto) ??
    0;
  if (!Number.isFinite(ground)) ground = 0;
  const minHeight = ground + 0.5;
  const maxHeight = ground + 500;
  carto.height = Math.max(minHeight, Math.min(maxHeight, carto.height));
  if (carto.height < ground + EYE_HEIGHT_M) {
    carto.height = ground + EYE_HEIGHT_M;
  }
  return clampToCampus(
    Cesium,
    Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height)
  );
}

function forwardBlocked(
  Cesium: CesiumNS,
  viewer: any,
  origin: any,
  dest: any
): boolean {
  const direction = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.subtract(dest, origin, new Cesium.Cartesian3()),
    new Cesium.Cartesian3()
  );
  const ray = new Cesium.Ray(origin, direction);
  const hit = viewer.scene.pickFromRay?.(ray);
  if (!hit?.position) return false;
  const dist = Cesium.Cartesian3.distance(origin, hit.position);
  return dist < 2.5;
}

export function attachKeyboardWalk(
  viewer: any,
  Cesium: CesiumNS,
  getMode: () => "off" | "first" | "third" | "walk",
  onActive?: () => void
) {
  const keys = new Set<string>();
  let raf: number | null = null;
  let last = performance.now();
  let lastMode: ReturnType<typeof getMode> | null = null;
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
      ctrl.enableTranslate = false;
      ctrl.enableTilt = false;
      ctrl.enableZoom = true;
      ctrl.enableLook = true;
      ctrl.enableRotate = true;
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
      lastMode = mode;
    }
    if (mode !== "walk") {
      raf = requestAnimationFrame(tick);
      last = now;
      return;
    }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (keys.size > 0) {
      onActive?.();
      const camera = viewer.camera;
      let heading = camera.heading;
      let moved = false;

      const forward =
        keys.has("arrowup") || keys.has("w") || keys.has("W");
      const back = keys.has("arrowdown") || keys.has("s") || keys.has("S");
      const left = keys.has("arrowleft") || keys.has("a") || keys.has("A");
      const right = keys.has("arrowright") || keys.has("d") || keys.has("D");

      if (forward) {
        const dest = horizontalMove(
          Cesium,
          camera.position,
          heading,
          MOVE_SPEED_M_S * dt
        );
        if (!forwardBlocked(Cesium, viewer, camera.position, dest)) {
          camera.position = clampToGround(Cesium, viewer, dest);
          moved = true;
        }
      }
      if (back) {
        const dest = horizontalMove(
          Cesium,
          camera.position,
          heading + Math.PI,
          MOVE_SPEED_M_S * dt
        );
        camera.position = clampToGround(Cesium, viewer, dest);
        moved = true;
      }
      if (left) {
        const dest = horizontalMove(
          Cesium,
          camera.position,
          heading - Math.PI / 2,
          STRAFE_SPEED_M_S * dt
        );
        camera.position = clampToGround(Cesium, viewer, dest);
        moved = true;
      }
      if (right) {
        const dest = horizontalMove(
          Cesium,
          camera.position,
          heading + Math.PI / 2,
          STRAFE_SPEED_M_S * dt
        );
        camera.position = clampToGround(Cesium, viewer, dest);
        moved = true;
      }

      if (moved) viewer.scene.requestRender();
    }

    raf = requestAnimationFrame(tick);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (getMode() !== "walk") return;
    const k = e.key.toLowerCase();
    if (!isMoveKey(e.key) && !isMoveKey(k)) return;
    if (["arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
      e.preventDefault();
    }
    keys.add(k);
    keys.add(e.key);
  };

  const onKeyUp = (e: KeyboardEvent) => {
    keys.delete(e.key.toLowerCase());
    keys.delete(e.key);
  };

  const onBlur = () => keys.clear();

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  raf = requestAnimationFrame(tick);

  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
    if (raf) cancelAnimationFrame(raf);
    applyController(false);
  };
}

export function enterWalkCamera(Cesium: CesiumNS, viewer: any) {
  const dest = Cesium.Cartesian3.fromDegrees(CAMPUS.lon, CAMPUS.lat, 2);
  const grounded = clampToGround(Cesium, viewer, dest);
  viewer.camera.setView({
    destination: grounded,
    orientation: {
      heading: Cesium.Math.toRadians(35),
      pitch: Cesium.Math.toRadians(-6),
      roll: 0,
    },
  });
  viewer.scene.requestRender();
}

const CAMPUS = { lon: -122.1339, lat: 37.42205 };

/* eslint-disable @typescript-eslint/no-explicit-any */
type CesiumNS = any;

const USER_OVERRIDE_MS = 4500;

let userOverrideUntil = 0;

export function isUserControllingCamera(): boolean {
  return Date.now() < userOverrideUntil;
}

export function markUserCameraControl(viewer?: any) {
  userOverrideUntil = Date.now() + USER_OVERRIDE_MS;
  viewer?.scene?.requestRender?.();
}

/** Clear manual override so walkthrough / patrol camera can take over again. */
export function clearUserCameraControl() {
  userOverrideUntil = 0;
}

export function attachCameraControls(viewer: any, Cesium: CesiumNS) {
  const scene = viewer.scene;
  const ctrl = scene.screenSpaceCameraController;
  ctrl.enableZoom = true;
  ctrl.enableLook = true;
  ctrl.enableRotate = true;
  ctrl.enableTilt = true;
  ctrl.enableTranslate = true;
  ctrl.inertiaZoom = 0.6;
  ctrl.inertiaSpin = 0.9;
  ctrl.inertiaTranslate = 0.9;

  const requestRender = () => scene.requestRender();
  const markUser = () => markUserCameraControl(viewer);

  viewer.camera.changed.addEventListener(requestRender);
  ctrl.moveStart.addEventListener(markUser);
  ctrl.moveEnd.addEventListener(requestRender);

  const onWheel = () => markUser();
  viewer.canvas.addEventListener("wheel", onWheel, { passive: true });

  const onZoom = (e: Event) => {
    const detail = (e as CustomEvent<{ direction: "in" | "out" }>).detail;
    markUser();
    if (detail?.direction === "in") viewer.camera.zoomIn(0.5);
    else if (detail?.direction === "out") viewer.camera.zoomOut(0.5);
    requestRender();
  };
  window.addEventListener("twin-camera-zoom", onZoom);

  return () => {
    viewer.camera.changed.removeEventListener(requestRender);
    ctrl.moveStart.removeEventListener(markUser);
    ctrl.moveEnd.removeEventListener(requestRender);
    viewer.canvas.removeEventListener("wheel", onWheel);
    window.removeEventListener("twin-camera-zoom", onZoom);
  };
}

export function zoomCamera(direction: "in" | "out") {
  window.dispatchEvent(
    new CustomEvent("twin-camera-zoom", { detail: { direction } })
  );
}

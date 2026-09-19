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

  ctrl.enableInputs = true;
  ctrl.enableZoom = true;
  ctrl.enableLook = true;
  ctrl.enableRotate = true;
  ctrl.enableTilt = true;
  ctrl.enableTranslate = true;
  ctrl.enableCollisionDetection = true;

  ctrl.inertiaZoom = 0.75;
  ctrl.inertiaSpin = 0.9;
  ctrl.inertiaTranslate = 0.9;
  ctrl.minimumZoomDistance = 2;
  ctrl.maximumZoomDistance = 5_000_000;

  // Explicit event maps so wheel / pinch / right-drag work reliably
  if (Cesium?.CameraEventType) {
    ctrl.zoomEventTypes = [
      Cesium.CameraEventType.WHEEL,
      Cesium.CameraEventType.PINCH,
    ];
    ctrl.tiltEventTypes = [
      Cesium.CameraEventType.RIGHT_DRAG,
      Cesium.CameraEventType.PINCH,
      {
        eventType: Cesium.CameraEventType.LEFT_DRAG,
        modifier: Cesium.KeyboardEventModifier.CTRL,
      },
    ];
    ctrl.rotateEventTypes = [Cesium.CameraEventType.LEFT_DRAG];
    ctrl.translateEventTypes = [
      Cesium.CameraEventType.LEFT_DRAG,
      Cesium.CameraEventType.MIDDLE_DRAG,
    ];
  }

  // Keep interactive camera smooth under requestRenderMode
  if (typeof scene.maximumRenderTimeChange === "number") {
    scene.maximumRenderTimeChange = 1 / 30;
  }

  const requestRender = () => scene.requestRender();
  const markUser = () => markUserCameraControl(viewer);

  ctrl.moveStart?.addEventListener?.(markUser);
  ctrl.moveEnd?.addEventListener?.(requestRender);
  if (ctrl.changed?.addEventListener) {
    ctrl.changed.addEventListener(requestRender);
  }

  const canvas = viewer.canvas ?? scene.canvas;
  if (canvas) {
    canvas.style.touchAction = "none";
    canvas.style.outline = "none";
  }

  const onWheel = (e: WheelEvent) => {
    markUser();
    // Trackpad pinch often arrives as ctrl+wheel — keep rendering while zooming
    requestRender();
    if (e.ctrlKey) {
      // Ensure browser page-zoom doesn't steal the gesture
      e.preventDefault();
    }
  };
  canvas?.addEventListener?.("wheel", onWheel, { passive: false });

  const onPointerDown = () => markUser();
  canvas?.addEventListener?.("pointerdown", onPointerDown, { passive: true });

  const onGesture = () => {
    markUser();
    requestRender();
  };
  canvas?.addEventListener?.("gesturestart", onGesture as EventListener, {
    passive: true,
  });
  canvas?.addEventListener?.("gesturechange", onGesture as EventListener, {
    passive: true,
  });

  const onZoom = (e: Event) => {
    const detail = (e as CustomEvent<{ direction: "in" | "out" }>).detail;
    markUser();
    const height = Math.max(
      10,
      viewer.camera.positionCartographic?.height ?? 200
    );
    const step = height * 0.18;
    if (detail?.direction === "in") viewer.camera.zoomIn(step);
    else if (detail?.direction === "out") viewer.camera.zoomOut(step);
    requestRender();
  };
  window.addEventListener("twin-camera-zoom", onZoom);

  return () => {
    ctrl.changed?.removeEventListener?.(requestRender);
    ctrl.moveStart?.removeEventListener?.(markUser);
    ctrl.moveEnd?.removeEventListener?.(requestRender);
    canvas?.removeEventListener?.("wheel", onWheel);
    canvas?.removeEventListener?.("pointerdown", onPointerDown);
    canvas?.removeEventListener?.("gesturestart", onGesture as EventListener);
    canvas?.removeEventListener?.("gesturechange", onGesture as EventListener);
    window.removeEventListener("twin-camera-zoom", onZoom);
  };
}

export function zoomCamera(direction: "in" | "out") {
  window.dispatchEvent(
    new CustomEvent("twin-camera-zoom", { detail: { direction } })
  );
}

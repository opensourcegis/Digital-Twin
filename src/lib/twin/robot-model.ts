/* eslint-disable @typescript-eslint/no-explicit-any */
type CesiumNS = any;

export interface AtlasRobotHandle {
  root: any;
  getPose: () => {
    lon: number;
    lat: number;
    height: number;
    heading: number;
  };
  update: (
    pose: { lon: number; lat: number; height: number; heading: number }
  ) => void;
  setShow: (show: boolean) => void;
  destroy: () => void;
}

/**
 * Visible industrial AMR — all parts driven by CallbackProperty from one pose
 * so the body, wheels, and label stay locked together while WASD moves.
 */
export function createAtlasRobot(
  Cesium: CesiumNS,
  viewer: any,
  start: { lon: number; lat: number; height: number; heading?: number }
): AtlasRobotHandle {
  const pose = {
    lon: start.lon,
    lat: start.lat,
    height: start.height,
    heading: start.heading ?? 0,
  };

  const SCALE = 2.4;
  const entities: any[] = [];

  const scratchBase = new Cesium.Cartesian3();
  const scratchEnu = new Cesium.Matrix4();
  const scratchLocal = new Cesium.Cartesian3();
  const scratchHpr = new Cesium.HeadingPitchRoll();

  function basePosition(result: any) {
    return Cesium.Cartesian3.fromDegrees(
      pose.lon,
      pose.lat,
      Math.max(0.12, pose.height),
      Cesium.Ellipsoid.WGS84,
      result
    );
  }

  function offsetEnu(
    forward: number,
    right: number,
    up: number,
    result: any
  ) {
    const base = basePosition(scratchBase);
    Cesium.Transforms.eastNorthUpToFixedFrame(
      base,
      Cesium.Ellipsoid.WGS84,
      scratchEnu
    );
    const east =
      Math.sin(pose.heading) * forward + Math.cos(pose.heading) * right;
    const north =
      Math.cos(pose.heading) * forward - Math.sin(pose.heading) * right;
    scratchLocal.x = east * SCALE;
    scratchLocal.y = north * SCALE;
    scratchLocal.z = up * SCALE;
    return Cesium.Matrix4.multiplyByPoint(scratchEnu, scratchLocal, result);
  }

  function bodyOrientation(result: any) {
    const base = basePosition(scratchBase);
    scratchHpr.heading = pose.heading - Cesium.Math.PI_OVER_TWO;
    scratchHpr.pitch = 0;
    scratchHpr.roll = 0;
    return Cesium.Transforms.headingPitchRollQuaternion(
      base,
      scratchHpr,
      Cesium.Ellipsoid.WGS84,
      Cesium.Transforms.eastNorthUpToFixedFrame,
      result
    );
  }

  // Fresh result each eval — CallbackProperty must not share scratch buffers
  // across different entity callbacks in one frame.
  const posCb = (forward: number, right: number, up: number) =>
    new Cesium.CallbackProperty(() => {
      return offsetEnu(forward, right, up, new Cesium.Cartesian3());
    }, false);

  const orientCb = () =>
    new Cesium.CallbackProperty(() => {
      return bodyOrientation(new Cesium.Quaternion());
    }, false);

  const root = viewer.entities.add({
    id: "robot",
    name: "ATLAS-01",
    position: posCb(0, 0, 0),
    orientation: orientCb(),
    label: {
      text: "ATLAS-01",
      font: "600 14px DM Sans, sans-serif",
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.fromCssColorString("#071018"),
      outlineWidth: 4,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -42),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      showBackground: true,
      backgroundColor: Cesium.Color.fromCssColorString("#071018").withAlpha(0.82),
      backgroundPadding: new Cesium.Cartesian2(10, 6),
    },
    properties: {
      kind: "robot",
      guid: "robot-atlas-01-9f0e-5c7d-3b2a",
      name: "ATLAS-01",
    },
  });
  entities.push(root);

  const chassis = viewer.entities.add({
    id: "robot-chassis",
    position: posCb(0, 0, 0.45),
    orientation: orientCb(),
    box: {
      dimensions: new Cesium.Cartesian3(2.4 * SCALE, 1.35 * SCALE, 0.7 * SCALE),
      material: Cesium.Color.fromCssColorString("#3b4556"),
      outline: true,
      outlineColor: Cesium.Color.fromCssColorString("#f59e0b").withAlpha(0.85),
    },
    properties: { kind: "robot-part" },
  });
  entities.push(chassis);

  const bumper = viewer.entities.add({
    id: "robot-bumper",
    position: posCb(1.25, 0, 0.35),
    orientation: orientCb(),
    box: {
      dimensions: new Cesium.Cartesian3(0.22 * SCALE, 1.4 * SCALE, 0.35 * SCALE),
      material: Cesium.Color.fromCssColorString("#fbbf24"),
    },
    properties: { kind: "robot-part" },
  });
  entities.push(bumper);

  const mast = viewer.entities.add({
    id: "robot-mast",
    position: posCb(-0.15, 0, 1.15),
    orientation: orientCb(),
    cylinder: {
      length: 1.1 * SCALE,
      topRadius: 0.06 * SCALE,
      bottomRadius: 0.09 * SCALE,
      material: Cesium.Color.fromCssColorString("#cbd5e1"),
    },
    properties: { kind: "robot-part" },
  });
  entities.push(mast);

  const lidar = viewer.entities.add({
    id: "robot-lidar",
    position: posCb(-0.15, 0, 1.75),
    orientation: orientCb(),
    ellipsoid: {
      radii: new Cesium.Cartesian3(0.32 * SCALE, 0.32 * SCALE, 0.16 * SCALE),
      material: Cesium.Color.fromCssColorString("#38bdf8"),
    },
    properties: { kind: "robot-part" },
  });
  entities.push(lidar);

  const status = viewer.entities.add({
    id: "robot-led",
    position: posCb(0.35, 0, 0.85),
    point: {
      pixelSize: 14,
      color: Cesium.Color.fromCssColorString("#34d399"),
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 1,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    properties: { kind: "robot-part" },
  });
  entities.push(status);

  const wheelDefs = [
    { id: "wfl", f: 0.75, r: 0.72 },
    { id: "wfr", f: 0.75, r: -0.72 },
    { id: "wrl", f: -0.75, r: 0.72 },
    { id: "wrr", f: -0.75, r: -0.72 },
  ];
  for (const w of wheelDefs) {
    const ent = viewer.entities.add({
      id: `robot-${w.id}`,
      position: posCb(w.f, w.r, 0.28),
      orientation: new Cesium.CallbackProperty(() => {
        const p = offsetEnu(w.f, w.r, 0.28, new Cesium.Cartesian3());
        const hpr = new Cesium.HeadingPitchRoll(
          pose.heading,
          0,
          Cesium.Math.PI_OVER_TWO
        );
        return Cesium.Transforms.headingPitchRollQuaternion(p, hpr);
      }, false),
      cylinder: {
        length: 0.28 * SCALE,
        topRadius: 0.32 * SCALE,
        bottomRadius: 0.32 * SCALE,
        material: Cesium.Color.fromCssColorString("#0f172a"),
        slices: 16,
      },
      properties: { kind: "robot-part", f: w.f, r: w.r },
    });
    entities.push(ent);
  }

  function update(next: typeof pose) {
    pose.lon = next.lon;
    pose.lat = next.lat;
    pose.height = next.height;
    pose.heading = next.heading;
    viewer.scene.requestRender();
  }

  update(pose);

  return {
    root,
    getPose: () => ({ ...pose }),
    update,
    setShow(show: boolean) {
      for (const e of entities) e.show = show;
    },
    destroy() {
      for (const e of entities) viewer.entities.remove(e);
    },
  };
}

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
 * Visible industrial AMR built as one oriented entity group.
 * Scale is exaggerated slightly so the unit reads clearly from campus orbit.
 */
export function createAtlasRobot(
  Cesium: CesiumNS,
  viewer: any,
  start: { lon: number; lat: number; height: number; heading?: number }
): AtlasRobotHandle {
  let pose = {
    lon: start.lon,
    lat: start.lat,
    height: start.height,
    heading: start.heading ?? 0,
  };

  const SCALE = 2.4; // campus-readable size
  const entities: any[] = [];

  const root = viewer.entities.add({
    id: "robot",
    name: "ATLAS-01",
    position: Cesium.Cartesian3.fromDegrees(pose.lon, pose.lat, pose.height),
    // Always-visible marker so the unit never "disappears" from orbit
    billboard: {
      image: makeRobotBillboard(),
      width: 56,
      height: 56,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -8),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      heightReference: Cesium.HeightReference.NONE,
    },
    label: {
      text: "ATLAS-01",
      font: "600 14px DM Sans, sans-serif",
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.fromCssColorString("#071018"),
      outlineWidth: 4,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -58),
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

  // Chassis (main body) — bright enough to read against OSM
  const chassis = viewer.entities.add({
    id: "robot-chassis",
    position: root.position,
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
    position: root.position,
    box: {
      dimensions: new Cesium.Cartesian3(0.22 * SCALE, 1.4 * SCALE, 0.35 * SCALE),
      material: Cesium.Color.fromCssColorString("#fbbf24"),
    },
    properties: { kind: "robot-part" },
  });
  entities.push(bumper);

  const mast = viewer.entities.add({
    id: "robot-mast",
    position: root.position,
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
    position: root.position,
    ellipsoid: {
      radii: new Cesium.Cartesian3(0.32 * SCALE, 0.32 * SCALE, 0.16 * SCALE),
      material: Cesium.Color.fromCssColorString("#38bdf8"),
    },
    properties: { kind: "robot-part" },
  });
  entities.push(lidar);

  const status = viewer.entities.add({
    id: "robot-led",
    position: root.position,
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
  const wheels = wheelDefs.map((w) => {
    const ent = viewer.entities.add({
      id: `robot-${w.id}`,
      position: root.position,
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
    return { ent, f: w.f, r: w.r };
  });

  const scratchEnu = new Cesium.Matrix4();
  const scratchLocal = new Cesium.Cartesian3();
  const scratchWorld = new Cesium.Cartesian3();
  const scratchQuat = new Cesium.Quaternion();
  const scratchHpr = new Cesium.HeadingPitchRoll();

  function offsetEnu(
    base: any,
    forward: number,
    right: number,
    up: number,
    heading: number
  ) {
    Cesium.Transforms.eastNorthUpToFixedFrame(
      base,
      Cesium.Ellipsoid.WGS84,
      scratchEnu
    );
    const east = Math.sin(heading) * forward + Math.cos(heading) * right;
    const north = Math.cos(heading) * forward - Math.sin(heading) * right;
    scratchLocal.x = east * SCALE;
    scratchLocal.y = north * SCALE;
    scratchLocal.z = up * SCALE;
    return Cesium.Matrix4.multiplyByPoint(
      scratchEnu,
      scratchLocal,
      scratchWorld
    );
  }

  function update(next: typeof pose) {
    pose = { ...next };
    const base = Cesium.Cartesian3.fromDegrees(
      pose.lon,
      pose.lat,
      Math.max(0.12, pose.height)
    );

    scratchHpr.heading = pose.heading - Cesium.Math.PI_OVER_TWO;
    scratchHpr.pitch = 0;
    scratchHpr.roll = 0;
    Cesium.Transforms.headingPitchRollQuaternion(
      base,
      scratchHpr,
      Cesium.Ellipsoid.WGS84,
      Cesium.Transforms.eastNorthUpToFixedFrame,
      scratchQuat
    );
    const orient = Cesium.Quaternion.clone(scratchQuat);

    root.position = new Cesium.ConstantPositionProperty(base);
    root.orientation = new Cesium.ConstantProperty(orient);

    const chassisPos = offsetEnu(base, 0, 0, 0.45, pose.heading);
    chassis.position = new Cesium.ConstantPositionProperty(
      Cesium.Cartesian3.clone(chassisPos)
    );
    chassis.orientation = new Cesium.ConstantProperty(orient);

    const bumperPos = offsetEnu(base, 1.25, 0, 0.35, pose.heading);
    bumper.position = new Cesium.ConstantPositionProperty(
      Cesium.Cartesian3.clone(bumperPos)
    );
    bumper.orientation = new Cesium.ConstantProperty(orient);

    const mastPos = offsetEnu(base, -0.15, 0, 1.15, pose.heading);
    mast.position = new Cesium.ConstantPositionProperty(
      Cesium.Cartesian3.clone(mastPos)
    );
    mast.orientation = new Cesium.ConstantProperty(orient);

    const lidarPos = offsetEnu(base, -0.15, 0, 1.75, pose.heading);
    lidar.position = new Cesium.ConstantPositionProperty(
      Cesium.Cartesian3.clone(lidarPos)
    );
    lidar.orientation = new Cesium.ConstantProperty(orient);

    const ledPos = offsetEnu(base, 0.35, 0, 0.85, pose.heading);
    status.position = new Cesium.ConstantPositionProperty(
      Cesium.Cartesian3.clone(ledPos)
    );

    for (const w of wheels) {
      const p = offsetEnu(base, w.f, w.r, 0.28, pose.heading);
      w.ent.position = new Cesium.ConstantPositionProperty(
        Cesium.Cartesian3.clone(p)
      );
      const wheelHpr = new Cesium.HeadingPitchRoll(
        pose.heading,
        0,
        Cesium.Math.PI_OVER_TWO
      );
      w.ent.orientation = new Cesium.ConstantProperty(
        Cesium.Transforms.headingPitchRollQuaternion(p, wheelHpr)
      );
    }
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

/** Simple canvas billboard — amber robot glyph, always readable from orbit. */
function makeRobotBillboard(): string {
  if (typeof document === "undefined") return "";
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  ctx.clearRect(0, 0, 64, 64);
  // soft glow
  const g = ctx.createRadialGradient(32, 36, 4, 32, 36, 28);
  g.addColorStop(0, "rgba(251, 191, 36, 0.95)");
  g.addColorStop(0.45, "rgba(245, 158, 11, 0.55)");
  g.addColorStop(1, "rgba(245, 158, 11, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(32, 36, 28, 0, Math.PI * 2);
  ctx.fill();
  // body
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(18, 28, 28, 18);
  ctx.fillStyle = "#fbbf24";
  ctx.fillRect(42, 30, 6, 14);
  // lidar
  ctx.fillStyle = "#38bdf8";
  ctx.beginPath();
  ctx.arc(32, 24, 7, 0, Math.PI * 2);
  ctx.fill();
  return c.toDataURL("image/png");
}

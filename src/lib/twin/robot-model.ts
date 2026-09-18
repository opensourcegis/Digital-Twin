/* eslint-disable @typescript-eslint/no-explicit-any */
type CesiumNS = any;

export interface AtlasRobotHandle {
  root: any;
  update: (position: any, headingRad: number) => void;
  setShow: (show: boolean) => void;
  destroy: () => void;
}

/** Part offset: forward (heading), right, up — meters relative to chassis center. */
type PartDef = {
  id: string;
  /** [forward, right, up] in meters */
  local: [number, number, number];
  box?: { x: number; y: number; z: number; color: string; alpha?: number };
  cylinder?: {
    length: number;
    top: number;
    bottom: number;
    color: string;
    /** Align axle left-right */
    asWheel?: boolean;
  };
  ellipsoid?: { r: [number, number, number]; color: string; alpha?: number };
  point?: { size: number; color: string };
};

const PARTS: PartDef[] = [
  {
    id: "chassis",
    local: [0, 0, 0.45],
    box: { x: 2.0, y: 1.15, z: 0.5, color: "#334155" },
  },
  {
    id: "deck",
    local: [0, 0, 0.72],
    box: { x: 1.7, y: 0.95, z: 0.1, color: "#475569" },
  },
  {
    id: "stripe",
    local: [0.15, 0, 0.78],
    box: { x: 1.2, y: 0.12, z: 0.04, color: "#f59e0b" },
  },
  {
    id: "bumper-f",
    local: [1.05, 0, 0.32],
    box: { x: 0.14, y: 1.05, z: 0.26, color: "#fbbf24" },
  },
  {
    id: "bumper-r",
    local: [-1.05, 0, 0.32],
    box: { x: 0.12, y: 1.0, z: 0.22, color: "#64748b" },
  },
  {
    id: "wheel-fl",
    local: [0.62, 0.62, 0.24],
    cylinder: { length: 0.2, top: 0.24, bottom: 0.24, color: "#0f172a", asWheel: true },
  },
  {
    id: "wheel-fr",
    local: [0.62, -0.62, 0.24],
    cylinder: { length: 0.2, top: 0.24, bottom: 0.24, color: "#0f172a", asWheel: true },
  },
  {
    id: "wheel-rl",
    local: [-0.62, 0.62, 0.24],
    cylinder: { length: 0.2, top: 0.24, bottom: 0.24, color: "#0f172a", asWheel: true },
  },
  {
    id: "wheel-rr",
    local: [-0.62, -0.62, 0.24],
    cylinder: { length: 0.2, top: 0.24, bottom: 0.24, color: "#0f172a", asWheel: true },
  },
  {
    id: "mast",
    local: [-0.2, 0, 1.15],
    cylinder: { length: 0.9, top: 0.05, bottom: 0.07, color: "#94a3b8" },
  },
  {
    id: "lidar",
    local: [-0.2, 0, 1.65],
    ellipsoid: { r: [0.26, 0.26, 0.14], color: "#0ea5e9", alpha: 0.95 },
  },
  {
    id: "cam-housing",
    local: [0.45, 0, 1.0],
    box: { x: 0.32, y: 0.38, z: 0.24, color: "#1e293b" },
  },
  {
    id: "cam-lens",
    local: [0.62, 0, 1.0],
    ellipsoid: { r: [0.07, 0.09, 0.09], color: "#38bdf8", alpha: 0.9 },
  },
  {
    id: "status-led",
    local: [0.25, 0, 0.85],
    point: { size: 12, color: "#34d399" },
  },
  {
    id: "antenna",
    local: [-0.55, 0.28, 1.25],
    cylinder: { length: 0.6, top: 0.015, bottom: 0.022, color: "#e2e8f0" },
  },
];

function bodyToEnu(
  forward: number,
  right: number,
  up: number,
  headingRad: number
): [number, number, number] {
  // heading 0 = north; +forward along heading, +right to starboard
  const east = Math.sin(headingRad) * forward + Math.cos(headingRad) * right;
  const north = Math.cos(headingRad) * forward - Math.sin(headingRad) * right;
  return [east, north, up];
}

/** Industrial AMR patrol unit — composite Cesium entities (no external GLB). */
export function createAtlasRobot(
  Cesium: CesiumNS,
  viewer: any,
  start: { lon: number; lat: number; height: number }
): AtlasRobotHandle {
  const startPos = Cesium.Cartesian3.fromDegrees(
    start.lon,
    start.lat,
    start.height
  );
  const entities: any[] = [];

  const root = viewer.entities.add({
    id: "robot",
    name: "ATLAS-01",
    position: startPos,
    label: {
      text: "ATLAS-01",
      font: "600 13px DM Sans, sans-serif",
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.fromCssColorString("#071018"),
      outlineWidth: 4,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -36),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      showBackground: true,
      backgroundColor: Cesium.Color.fromCssColorString("#071018").withAlpha(0.78),
      backgroundPadding: new Cesium.Cartesian2(8, 5),
    },
    properties: {
      kind: "robot",
      guid: "robot-atlas-01-9f0e-5c7d-3b2a",
      name: "ATLAS-01",
    },
  });
  entities.push(root);

  const partEntities = PARTS.map((part) => {
    const opts: Record<string, unknown> = {
      id: `robot-${part.id}`,
      position: startPos,
      properties: { kind: "robot-part", parent: "robot" },
    };
    if (part.box) {
      opts.box = {
        dimensions: new Cesium.Cartesian3(part.box.x, part.box.y, part.box.z),
        material: Cesium.Color.fromCssColorString(part.box.color).withAlpha(
          part.box.alpha ?? 1
        ),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString("#0f172a").withAlpha(0.6),
      };
    }
    if (part.cylinder) {
      opts.cylinder = {
        length: part.cylinder.length,
        topRadius: part.cylinder.top,
        bottomRadius: part.cylinder.bottom,
        material: Cesium.Color.fromCssColorString(part.cylinder.color),
        slices: 18,
      };
    }
    if (part.ellipsoid) {
      opts.ellipsoid = {
        radii: new Cesium.Cartesian3(...part.ellipsoid.r),
        material: Cesium.Color.fromCssColorString(part.ellipsoid.color).withAlpha(
          part.ellipsoid.alpha ?? 1
        ),
      };
    }
    if (part.point) {
      opts.point = {
        pixelSize: part.point.size,
        color: Cesium.Color.fromCssColorString(part.point.color),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 1,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      };
    }
    const ent = viewer.entities.add(opts);
    entities.push(ent);
    return { def: part, entity: ent };
  });

  const scratchLocal = new Cesium.Cartesian3();
  const scratchWorld = new Cesium.Cartesian3();
  const scratchMatrix = new Cesium.Matrix4();
  const scratchQuat = new Cesium.Quaternion();
  const scratchHpr = new Cesium.HeadingPitchRoll();

  function update(position: any, headingRad: number) {
    Cesium.Transforms.eastNorthUpToFixedFrame(
      position,
      Cesium.Ellipsoid.WGS84,
      scratchMatrix
    );

    // Face along heading (box +X ≈ east in ENU before yaw; yaw so +X follows heading).
    scratchHpr.heading = headingRad - Cesium.Math.PI_OVER_TWO;
    scratchHpr.pitch = 0;
    scratchHpr.roll = 0;
    Cesium.Transforms.headingPitchRollQuaternion(
      position,
      scratchHpr,
      Cesium.Ellipsoid.WGS84,
      Cesium.Transforms.eastNorthUpToFixedFrame,
      scratchQuat
    );

    root.position = new Cesium.ConstantPositionProperty(position);
    root.orientation = new Cesium.ConstantProperty(
      Cesium.Quaternion.clone(scratchQuat)
    );

    for (const { def, entity } of partEntities) {
      const [east, north, up] = bodyToEnu(
        def.local[0],
        def.local[1],
        def.local[2],
        headingRad
      );
      scratchLocal.x = east;
      scratchLocal.y = north;
      scratchLocal.z = up;
      Cesium.Matrix4.multiplyByPoint(scratchMatrix, scratchLocal, scratchWorld);
      entity.position = new Cesium.ConstantPositionProperty(
        Cesium.Cartesian3.clone(scratchWorld)
      );

      if (def.cylinder?.asWheel) {
        // Wheel axle along left-right (perpendicular to heading)
        const wheelHpr = new Cesium.HeadingPitchRoll(
          headingRad,
          0,
          Cesium.Math.PI_OVER_TWO
        );
        entity.orientation = new Cesium.ConstantProperty(
          Cesium.Transforms.headingPitchRollQuaternion(
            scratchWorld,
            wheelHpr
          )
        );
      } else {
        entity.orientation = new Cesium.ConstantProperty(
          Cesium.Quaternion.clone(scratchQuat)
        );
      }
    }
  }

  update(startPos, 0);

  return {
    root,
    update,
    setShow(show: boolean) {
      for (const e of entities) e.show = show;
    },
    destroy() {
      for (const e of entities) viewer.entities.remove(e);
    },
  };
}

export function pathHeadingRad(
  path: { lon: number; lat: number }[],
  progress: number
): number {
  if (!path || path.length < 2) return 0;
  const total = path.length - 1;
  const x = Math.min(Math.max(progress, 0), 0.9999) * total;
  const i = Math.min(total - 1, Math.floor(x));
  const a = path[i];
  const b = path[i + 1] ?? path[i];
  if (!a || !b) return 0;
  return Math.atan2(b.lon - a.lon, b.lat - a.lat);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type CesiumNS = any;

export interface AtlasRobotHandle {
  root: any;
  update: (position: any, headingRad: number) => void;
  setShow: (show: boolean) => void;
  destroy: () => void;
}

type PartDef = {
  id: string;
  local: [number, number, number];
  box?: { x: number; y: number; z: number; color: string; alpha?: number };
  cylinder?: {
    length: number;
    top: number;
    bottom: number;
    color: string;
    roll?: number;
    pitch?: number;
  };
  ellipsoid?: { r: [number, number, number]; color: string; alpha?: number };
  point?: { size: number; color: string };
};

/** Industrial AMR patrol unit — composite Cesium entities (no external GLB). */
const PARTS: PartDef[] = [
  {
    id: "chassis",
    local: [0, 0, 0.42],
    box: { x: 1.85, y: 1.05, z: 0.48, color: "#2a3344" },
  },
  {
    id: "deck",
    local: [0, 0, 0.68],
    box: { x: 1.55, y: 0.88, z: 0.08, color: "#3d4a5c" },
  },
  {
    id: "bumper-f",
    local: [0.92, 0, 0.28],
    box: { x: 0.12, y: 0.95, z: 0.22, color: "#f59e0b" },
  },
  {
    id: "bumper-r",
    local: [-0.92, 0, 0.28],
    box: { x: 0.1, y: 0.9, z: 0.2, color: "#64748b" },
  },
  {
    id: "wheel-fl",
    local: [0.55, 0.58, 0.22],
    cylinder: {
      length: 0.18,
      top: 0.22,
      bottom: 0.22,
      color: "#111827",
      roll: Math.PI / 2,
    },
  },
  {
    id: "wheel-fr",
    local: [0.55, -0.58, 0.22],
    cylinder: {
      length: 0.18,
      top: 0.22,
      bottom: 0.22,
      color: "#111827",
      roll: Math.PI / 2,
    },
  },
  {
    id: "wheel-rl",
    local: [-0.55, 0.58, 0.22],
    cylinder: {
      length: 0.18,
      top: 0.22,
      bottom: 0.22,
      color: "#111827",
      roll: Math.PI / 2,
    },
  },
  {
    id: "wheel-rr",
    local: [-0.55, -0.58, 0.22],
    cylinder: {
      length: 0.18,
      top: 0.22,
      bottom: 0.22,
      color: "#111827",
      roll: Math.PI / 2,
    },
  },
  {
    id: "mast",
    local: [-0.15, 0, 1.05],
    cylinder: {
      length: 0.85,
      top: 0.045,
      bottom: 0.06,
      color: "#94a3b8",
    },
  },
  {
    id: "lidar",
    local: [-0.15, 0, 1.52],
    ellipsoid: { r: [0.22, 0.22, 0.12], color: "#0ea5e9", alpha: 0.92 },
  },
  {
    id: "cam-housing",
    local: [0.35, 0, 0.95],
    box: { x: 0.28, y: 0.35, z: 0.22, color: "#1e293b" },
  },
  {
    id: "cam-lens",
    local: [0.5, 0, 0.95],
    ellipsoid: { r: [0.06, 0.08, 0.08], color: "#38bdf8", alpha: 0.85 },
  },
  {
    id: "status-led",
    local: [0.2, 0, 0.78],
    point: { size: 10, color: "#34d399" },
  },
  {
    id: "antenna",
    local: [-0.55, 0.25, 1.15],
    cylinder: {
      length: 0.55,
      top: 0.012,
      bottom: 0.02,
      color: "#cbd5e1",
    },
  },
];

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
      font: "600 12px DM Sans, sans-serif",
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.fromCssColorString("#0b1220"),
      outlineWidth: 4,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -28),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      showBackground: true,
      backgroundColor: Cesium.Color.fromCssColorString("#0b1220").withAlpha(0.72),
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
        outlineColor: Cesium.Color.fromCssColorString("#0f172a").withAlpha(0.55),
      };
    }
    if (part.cylinder) {
      opts.cylinder = {
        length: part.cylinder.length,
        topRadius: part.cylinder.top,
        bottomRadius: part.cylinder.bottom,
        material: Cesium.Color.fromCssColorString(part.cylinder.color),
        slices: 16,
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
  const scratchHpr = new Cesium.HeadingPitchRoll();
  const scratchMatrix = new Cesium.Matrix4();
  const scratchQuat = new Cesium.Quaternion();

  function update(position: any, headingRad: number) {
    scratchHpr.heading = headingRad;
    scratchHpr.pitch = 0;
    scratchHpr.roll = 0;
    Cesium.Transforms.headingPitchRollToFixedFrame(
      position,
      scratchHpr,
      Cesium.Ellipsoid.WGS84,
      Cesium.Transforms.localFrameToFixedFrameGenerator("east", "north"),
      scratchMatrix
    );
    Cesium.Transforms.headingPitchRollQuaternion(
      position,
      scratchHpr,
      Cesium.Ellipsoid.WGS84,
      Cesium.Transforms.localFrameToFixedFrameGenerator("east", "north"),
      scratchQuat
    );

    root.position = new Cesium.ConstantPositionProperty(position);
    root.orientation = new Cesium.ConstantProperty(
      Cesium.Quaternion.clone(scratchQuat)
    );

    for (const { def, entity } of partEntities) {
      scratchLocal.x = def.local[0];
      scratchLocal.y = def.local[1];
      scratchLocal.z = def.local[2];
      Cesium.Matrix4.multiplyByPoint(scratchMatrix, scratchLocal, scratchWorld);
      entity.position = new Cesium.ConstantPositionProperty(
        Cesium.Cartesian3.clone(scratchWorld)
      );

      if (def.cylinder?.roll || def.cylinder?.pitch) {
        const partHpr = new Cesium.HeadingPitchRoll(
          headingRad,
          def.cylinder.pitch ?? 0,
          def.cylinder.roll ?? 0
        );
        const q = Cesium.Transforms.headingPitchRollQuaternion(
          scratchWorld,
          partHpr
        );
        entity.orientation = new Cesium.ConstantProperty(q);
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
  if (path.length < 2) return 0;
  const total = path.length - 1;
  const x = progress * total;
  const i = Math.min(total - 1, Math.floor(x));
  const a = path[i];
  const b = path[i + 1] ?? path[0];
  // Cesium heading: 0 = north, clockwise positive → atan2(east, north)
  return Math.atan2(b.lon - a.lon, b.lat - a.lat);
}

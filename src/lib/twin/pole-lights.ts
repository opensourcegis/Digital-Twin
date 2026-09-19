/* eslint-disable @typescript-eslint/no-explicit-any */
import { TWIN_LOOK } from "./visual-theme";

type CesiumNS = any;

export type TimeOfDay = "day" | "night";

export interface PoleLightPose {
  id: string;
  lon: number;
  lat: number;
  height: number;
  lightsOn: boolean;
}

export interface PoleLightCaches {
  poles: Map<string, any>;
  bases: Map<string, any>;
  arms: Map<string, any>;
  housings: Map<string, any>;
  bulbs: Map<string, any>;
  glows: Map<string, any>;
  beams: Map<string, any>;
}

/**
 * Cobra-head street lamp: metal shaft, east arm, dark housing, lamp.
 * Night = bright filament + tight downward wash. No roof pancakes.
 */
export function syncNaturalPoleLight(
  Cesium: CesiumNS,
  viewer: any,
  pole: PoleLightPose,
  timeOfDay: TimeOfDay,
  masterOn: boolean,
  caches: PoleLightCaches
) {
  ensureMaps(caches);
  stripLegacyBlobs(viewer, pole.id, caches);

  const on = Boolean(pole.lightsOn && masterOn);
  const night = timeOfDay === "night";
  const lit = on && night;

  const shaftH = 9.2;
  const armM = 2.1;
  const tipH = pole.height + shaftH;
  const dLon =
    armM / (111_320 * Math.max(0.2, Math.cos((pole.lat * Math.PI) / 180)));
  const lampLon = pole.lon + dLon;

  const basePos = Cesium.Cartesian3.fromDegrees(
    pole.lon,
    pole.lat,
    pole.height + 0.18
  );
  const shaftPos = Cesium.Cartesian3.fromDegrees(
    pole.lon,
    pole.lat,
    pole.height + shaftH / 2
  );
  const armPos = Cesium.Cartesian3.fromDegrees(
    pole.lon + dLon / 2,
    pole.lat,
    tipH
  );
  const headPos = Cesium.Cartesian3.fromDegrees(lampLon, pole.lat, tipH);
  const lampPos = Cesium.Cartesian3.fromDegrees(
    lampLon,
    pole.lat,
    tipH - 0.22
  );
  const beamPos = Cesium.Cartesian3.fromDegrees(
    lampLon,
    pole.lat,
    tipH - 3.1
  );

  const metal = Cesium.Color.fromCssColorString(
    night ? TWIN_LOOK.lamp.metalNight : TWIN_LOOK.lamp.metal
  );
  const housing = Cesium.Color.fromCssColorString(TWIN_LOOK.lamp.housing);
  const glass = Cesium.Color.fromCssColorString(
    lit ? TWIN_LOOK.lamp.filament : TWIN_LOOK.lamp.glassDay
  );
  const glowCol = Cesium.Color.fromCssColorString(TWIN_LOOK.lamp.glow);

  let base = caches.bases.get(pole.id);
  if (!base) {
    base = viewer.entities.add({
      id: `${pole.id}-base`,
      position: basePos,
      cylinder: {
        length: 0.36,
        topRadius: 0.28,
        bottomRadius: 0.38,
        material: metal,
        slices: 12,
      },
    });
    caches.bases.set(pole.id, base);
  } else {
    base.position = new Cesium.ConstantPositionProperty(basePos);
    if (base.cylinder) base.cylinder.material = metal;
  }

  let shaft = caches.poles.get(pole.id);
  if (!shaft) {
    shaft = viewer.entities.add({
      id: pole.id,
      position: shaftPos,
      name: "Street light",
      cylinder: {
        length: shaftH,
        topRadius: 0.12,
        bottomRadius: 0.18,
        material: metal,
        slices: 14,
      },
      properties: { kind: "pole", lightsOn: pole.lightsOn },
    });
    caches.poles.set(pole.id, shaft);
  } else {
    shaft.position = new Cesium.ConstantPositionProperty(shaftPos);
    if (shaft.cylinder) {
      shaft.cylinder.material = metal;
      shaft.cylinder.length = shaftH;
    }
  }

  let arm = caches.arms.get(pole.id);
  if (!arm) {
    arm = viewer.entities.add({
      id: `${pole.id}-arm`,
      position: armPos,
      box: {
        dimensions: new Cesium.Cartesian3(armM, 0.09, 0.09),
        material: metal,
      },
    });
    caches.arms.set(pole.id, arm);
  } else {
    arm.position = new Cesium.ConstantPositionProperty(armPos);
    if (arm.box) arm.box.material = metal;
  }

  let head = caches.housings.get(pole.id);
  if (!head) {
    head = viewer.entities.add({
      id: `${pole.id}-housing`,
      position: headPos,
      box: {
        dimensions: new Cesium.Cartesian3(0.62, 0.38, 0.16),
        material: housing,
      },
    });
    caches.housings.set(pole.id, head);
  } else {
    head.position = new Cesium.ConstantPositionProperty(headPos);
  }

  let bulb = caches.bulbs.get(pole.id);
  if (!bulb) {
    bulb = viewer.entities.add({
      id: `${pole.id}-bulb`,
      position: lampPos,
      ellipsoid: {
        radii: new Cesium.Cartesian3(0.16, 0.16, 0.1),
        material: glass,
      },
    });
    caches.bulbs.set(pole.id, bulb);
  } else {
    bulb.position = new Cesium.ConstantPositionProperty(lampPos);
    if (bulb.ellipsoid) bulb.ellipsoid.material = glass;
  }

  let glow = caches.glows.get(pole.id);
  if (!glow) {
    glow = viewer.entities.add({
      id: `${pole.id}-glow`,
      position: lampPos,
      point: {
        pixelSize: lit ? 14 : 4,
        color: lit ? glowCol.withAlpha(0.95) : glass.withAlpha(0.35),
        outlineWidth: 0,
        scaleByDistance: new Cesium.NearFarScalar(30, 1.15, 420, 0.25),
        disableDepthTestDistance: 20,
      },
      show: on,
    });
    caches.glows.set(pole.id, glow);
  } else {
    glow.position = new Cesium.ConstantPositionProperty(lampPos);
    glow.show = on;
    if (glow.point) {
      glow.point.pixelSize = lit ? 14 : 4;
      glow.point.color = lit ? glowCol.withAlpha(0.95) : glass.withAlpha(0.35);
    }
  }

  let beam = caches.beams.get(pole.id);
  if (!beam) {
    beam = viewer.entities.add({
      id: `${pole.id}-beam`,
      position: beamPos,
      cylinder: {
        length: 5.8,
        topRadius: 0.08,
        bottomRadius: 1.65,
        material: glowCol.withAlpha(0.11),
        slices: 18,
      },
      show: lit,
    });
    caches.beams.set(pole.id, beam);
  } else {
    beam.position = new Cesium.ConstantPositionProperty(beamPos);
    beam.show = lit;
    if (beam.cylinder) beam.cylinder.material = glowCol.withAlpha(0.11);
  }
}

/** Old lighting used 9m ground ellipses that read as yellow roof blobs. */
function stripLegacyBlobs(viewer: any, id: string, caches: PoleLightCaches) {
  for (const suffix of ["-pool", "-ring", "-hot", "-cone", "-lamp"]) {
    const e = viewer.entities.getById(`${id}${suffix}`);
    if (e) viewer.entities.remove(e);
  }
  const extra = caches as PoleLightCaches & {
    pools?: Map<string, any>;
    rings?: Map<string, any>;
  };
  extra.pools?.delete(id);
  extra.rings?.delete(id);
}

function ensureMaps(caches: PoleLightCaches) {
  caches.poles ??= new Map();
  caches.bases ??= new Map();
  caches.arms ??= new Map();
  caches.housings ??= new Map();
  caches.bulbs ??= new Map();
  caches.glows ??= new Map();
  caches.beams ??= new Map();
}

export function removePoleLight(
  viewer: any,
  id: string,
  caches: PoleLightCaches
) {
  for (const eid of [
    id,
    `${id}-base`,
    `${id}-arm`,
    `${id}-housing`,
    `${id}-bulb`,
    `${id}-lamp`,
    `${id}-glow`,
    `${id}-beam`,
    `${id}-pool`,
    `${id}-ring`,
    `${id}-hot`,
    `${id}-cone`,
  ]) {
    const e = viewer.entities.getById(eid);
    if (e) viewer.entities.remove(e);
  }
  caches.poles?.delete(id);
  caches.bases?.delete(id);
  caches.arms?.delete(id);
  caches.housings?.delete(id);
  caches.bulbs?.delete(id);
  caches.glows?.delete(id);
  caches.beams?.delete(id);
}

export function startPoleLightFlickerLoop(
  viewer: any,
  isActive: () => boolean
) {
  let raf = 0;
  let last = 0;
  const tick = (now: number) => {
    if (isActive() && now - last > 180) {
      last = now;
      viewer.scene?.requestRender?.();
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

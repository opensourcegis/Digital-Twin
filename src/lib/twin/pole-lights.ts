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
  shafts: Map<string, any>;
  bases: Map<string, any>;
  arms: Map<string, any>;
  housings: Map<string, any>;
  bulbs: Map<string, any>;
  glows: Map<string, any>;
  beams: Map<string, any>;
  washes: Map<string, any>;
}

const SHAFT_H = 9.2;
const ARM_M = 2.1;

/** Lamp head, in degrees / meters, matching the cobra-head geometry. */
export function poleLampCartographic(pole: {
  lon: number;
  lat: number;
  height: number;
}): { lon: number; lat: number; height: number } {
  const dLon =
    ARM_M /
    (111_320 * Math.max(0.2, Math.cos((pole.lat * Math.PI) / 180)));
  return {
    lon: pole.lon + dLon,
    lat: pole.lat,
    height: pole.height + SHAFT_H - 0.22,
  };
}

let metalReady = false;

function ensureMetalMaterial(Cesium: CesiumNS) {
  if (metalReady || !Cesium.Material?._materialCache) return;
  if (Cesium.Material._materialCache.getMaterial?.("TwinPoleMetal")) {
    metalReady = true;
    return;
  }
  metalReady = true;
  Cesium.Material._materialCache.addMaterial("TwinPoleMetal", {
    fabric: {
      type: "TwinPoleMetal",
      uniforms: {
        color: new Cesium.Color(0.72, 0.75, 0.8, 1),
        specular: 0.55,
        shininess: 24,
        emission: 0.04,
      },
      source: `
        czm_material czm_getMaterial(czm_materialInput materialInput) {
          czm_material m = czm_getDefaultMaterial(materialInput);
          m.diffuse = color.rgb;
          m.alpha = color.a;
          m.specular = specular;
          m.shininess = shininess;
          m.emission = color.rgb * emission;
          return m;
        }
      `,
    },
    translucent: false,
  });
}

function metalMaterial(
  Cesium: CesiumNS,
  css: string,
  specular: number,
  shininess: number,
  emission: number
) {
  ensureMetalMaterial(Cesium);
  return Cesium.Material.fromType("TwinPoleMetal", {
    color: Cesium.Color.fromCssColorString(css),
    specular,
    shininess,
    emission,
  });
}

function vertexFormat(Cesium: CesiumNS) {
  return (
    Cesium.VertexFormat?.DEFAULT ??
    Cesium.MaterialAppearance?.VERTEX_FORMAT
  );
}

function enu(Cesium: CesiumNS, lon: number, lat: number, height: number) {
  return Cesium.Transforms.eastNorthUpToFixedFrame(
    Cesium.Cartesian3.fromDegrees(lon, lat, height)
  );
}

function upsertLit(
  Cesium: CesiumNS,
  viewer: any,
  cache: Map<string, any>,
  id: string,
  modelMatrix: any,
  createGeometry: () => any,
  material: any,
  show: boolean
) {
  let prim = cache.get(id);
  if (!prim || prim.isDestroyed?.()) {
    prim = viewer.scene.primitives.add(
      new Cesium.Primitive({
        geometryInstances: new Cesium.GeometryInstance({
          geometry: createGeometry(),
          id,
        }),
        appearance: new Cesium.MaterialAppearance({
          material,
          closed: true,
          translucent: false,
          faceForward: false,
        }),
        modelMatrix,
        asynchronous: false,
      })
    );
    cache.set(id, prim);
  } else {
    prim.modelMatrix = modelMatrix;
    if (prim.appearance) prim.appearance.material = material;
  }
  prim.show = show;
  return prim;
}

/**
 * Cobra-head street lamp. The shaft, arm, and housing are lit by the scene
 * sun or moon. The bulb, beam, and ground wash only turn on after dark.
 */
export function syncNaturalPoleLight(
  Cesium: CesiumNS,
  viewer: any,
  pole: PoleLightPose,
  timeOfDay: TimeOfDay,
  masterOn: boolean,
  caches: PoleLightCaches,
  show = true
) {
  ensureMaps(caches);
  stripLegacyBlobs(viewer, pole.id);

  const on = Boolean(pole.lightsOn && masterOn);
  const night = timeOfDay === "night";
  const lit = on && night && show;
  const visible = show;

  const tipH = pole.height + SHAFT_H;
  const dLon =
    ARM_M /
    (111_320 * Math.max(0.2, Math.cos((pole.lat * Math.PI) / 180)));
  const lampLon = pole.lon + dLon;

  const shaftPos = Cesium.Cartesian3.fromDegrees(
    pole.lon,
    pole.lat,
    pole.height + SHAFT_H / 2
  );
  const lamp = poleLampCartographic(pole);
  const lampPos = Cesium.Cartesian3.fromDegrees(lamp.lon, lamp.lat, lamp.height);
  const beamPos = Cesium.Cartesian3.fromDegrees(
    lampLon,
    pole.lat,
    tipH - 3.1
  );

  const metalCss = night ? TWIN_LOOK.lamp.metalNight : TWIN_LOOK.lamp.metal;
  const glass = Cesium.Color.fromCssColorString(
    lit ? TWIN_LOOK.lamp.filament : TWIN_LOOK.lamp.glassDay
  );
  const glowCol = Cesium.Color.fromCssColorString(TWIN_LOOK.lamp.glow);

  let anchor = caches.poles.get(pole.id);
  if (!anchor) {
    anchor = viewer.entities.add({
      id: pole.id,
      position: shaftPos,
      name: "Street light",
      properties: { kind: "pole", lightsOn: pole.lightsOn },
    });
    caches.poles.set(pole.id, anchor);
  } else {
    anchor.position = new Cesium.ConstantPositionProperty(shaftPos);
    anchor.show = visible;
  }

  const format = vertexFormat(Cesium);
  try {
    upsertLit(
      Cesium,
      viewer,
      caches.bases,
      pole.id,
      enu(Cesium, pole.lon, pole.lat, pole.height + 0.18),
      () =>
        new Cesium.CylinderGeometry({
          length: 0.36,
          topRadius: 0.28,
          bottomRadius: 0.38,
          slices: 12,
          vertexFormat: format,
        }),
      metalMaterial(Cesium, metalCss, 0.35, 12, night ? 0.02 : 0.05),
      visible
    );
    upsertLit(
      Cesium,
      viewer,
      caches.shafts,
      pole.id,
      enu(Cesium, pole.lon, pole.lat, pole.height + SHAFT_H / 2),
      () =>
        new Cesium.CylinderGeometry({
          length: SHAFT_H,
          topRadius: 0.12,
          bottomRadius: 0.18,
          slices: 14,
          vertexFormat: format,
        }),
      metalMaterial(Cesium, metalCss, 0.62, 28, night ? 0.025 : 0.05),
      visible
    );
    upsertLit(
      Cesium,
      viewer,
      caches.arms,
      pole.id,
      enu(Cesium, pole.lon + dLon / 2, pole.lat, tipH),
      () =>
        Cesium.BoxGeometry.fromDimensions({
          dimensions: new Cesium.Cartesian3(ARM_M, 0.09, 0.09),
          vertexFormat: format,
        }),
      metalMaterial(Cesium, metalCss, 0.5, 20, night ? 0.02 : 0.04),
      visible
    );
    upsertLit(
      Cesium,
      viewer,
      caches.housings,
      pole.id,
      enu(Cesium, lampLon, pole.lat, tipH),
      () =>
        Cesium.BoxGeometry.fromDimensions({
          dimensions: new Cesium.Cartesian3(0.62, 0.38, 0.16),
          vertexFormat: format,
        }),
      metalMaterial(Cesium, TWIN_LOOK.lamp.housing, 0.22, 10, 0.015),
      visible
    );
  } catch (err) {
    console.warn("Lit pole geometry failed", err);
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
  bulb.show = visible;

  let glow = caches.glows.get(pole.id);
  if (!glow) {
    glow = viewer.entities.add({
      id: `${pole.id}-glow`,
      position: lampPos,
      point: {
        pixelSize: 11,
        color: glowCol.withAlpha(0.92),
        outlineWidth: 0,
        scaleByDistance: new Cesium.NearFarScalar(30, 1.1, 480, 0.2),
        disableDepthTestDistance: 12,
      },
    });
    caches.glows.set(pole.id, glow);
  } else {
    glow.position = new Cesium.ConstantPositionProperty(lampPos);
  }
  glow.show = lit;
  if (glow.point) {
    glow.point.pixelSize = lit ? 11 : 0;
    glow.point.color = glowCol.withAlpha(0.92);
  }

  let beam = caches.beams.get(pole.id);
  if (!beam) {
    beam = viewer.entities.add({
      id: `${pole.id}-beam`,
      position: beamPos,
      cylinder: {
        length: 5.6,
        topRadius: 0.06,
        bottomRadius: 1.45,
        material: glowCol.withAlpha(0.09),
        slices: 16,
      },
    });
    caches.beams.set(pole.id, beam);
  } else {
    beam.position = new Cesium.ConstantPositionProperty(beamPos);
    if (beam.cylinder) beam.cylinder.material = glowCol.withAlpha(0.09);
  }
  beam.show = lit;

  let wash = caches.washes.get(pole.id);
  if (!wash) {
    wash = viewer.entities.add({
      id: `${pole.id}-wash`,
      position: Cesium.Cartesian3.fromDegrees(lampLon, pole.lat, pole.height),
      ellipse: {
        semiMajorAxis: 2.7,
        semiMinorAxis: 2.7,
        material: glowCol.withAlpha(0.14),
        outline: false,
        height: 0,
        classificationType: Cesium.ClassificationType.BOTH,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
    });
    caches.washes.set(pole.id, wash);
  }
  wash.show = lit;
}

/** Old lighting used 9m ground ellipses that read as yellow roof blobs. */
function stripLegacyBlobs(viewer: any, id: string) {
  for (const suffix of ["-pool", "-ring", "-hot", "-cone", "-lamp"]) {
    const e = viewer.entities.getById(`${id}${suffix}`);
    if (e) viewer.entities.remove(e);
  }
}

function ensureMaps(caches: PoleLightCaches) {
  caches.poles ??= new Map();
  caches.shafts ??= new Map();
  caches.bases ??= new Map();
  caches.arms ??= new Map();
  caches.housings ??= new Map();
  caches.bulbs ??= new Map();
  caches.glows ??= new Map();
  caches.beams ??= new Map();
  caches.washes ??= new Map();
}

function dropPrimitive(viewer: any, prim: any) {
  if (!prim) return;
  try {
    viewer.scene.primitives.remove(prim);
  } catch {
    /* ignore */
  }
  try {
    if (!prim.isDestroyed?.()) prim.destroy?.();
  } catch {
    /* ignore */
  }
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
    `${id}-wash`,
    `${id}-pool`,
    `${id}-ring`,
    `${id}-hot`,
    `${id}-cone`,
  ]) {
    const e = viewer.entities.getById(eid);
    if (e) viewer.entities.remove(e);
  }
  dropPrimitive(viewer, caches.shafts?.get(id));
  dropPrimitive(viewer, caches.bases?.get(id));
  dropPrimitive(viewer, caches.arms?.get(id));
  dropPrimitive(viewer, caches.housings?.get(id));
  caches.poles?.delete(id);
  caches.shafts?.delete(id);
  caches.bases?.delete(id);
  caches.arms?.delete(id);
  caches.housings?.delete(id);
  caches.bulbs?.delete(id);
  caches.glows?.delete(id);
  caches.beams?.delete(id);
  caches.washes?.delete(id);
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

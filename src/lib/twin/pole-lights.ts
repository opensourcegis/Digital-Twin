/* eslint-disable @typescript-eslint/no-explicit-any */
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
  arms: Map<string, any>;
  housings: Map<string, any>;
  bulbs: Map<string, any>;
  glows: Map<string, any>;
  beams: Map<string, any>;
  pools: Map<string, any>;
  rings: Map<string, any>;
}

/**
 * Street lamp that reads as a light source at night:
 * metal pole + arm + canopy, bright filament, large screen glow,
 * warm beam, and a soft ground pool. Day = fixture only (no wash).
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

  const on = Boolean(pole.lightsOn && masterOn);
  const night = timeOfDay === "night";
  const lit = on && night;

  const shaftH = 8.0;
  const tipH = pole.height + shaftH;
  const dLon =
    1.5 / (111_320 * Math.max(0.2, Math.cos((pole.lat * Math.PI) / 180)));
  const lampLon = pole.lon + dLon;

  const shaftPos = Cesium.Cartesian3.fromDegrees(
    pole.lon,
    pole.lat,
    pole.height + shaftH / 2
  );
  const topPos = Cesium.Cartesian3.fromDegrees(pole.lon, pole.lat, tipH);
  const headPos = Cesium.Cartesian3.fromDegrees(lampLon, pole.lat, tipH - 0.2);
  const lampPos = Cesium.Cartesian3.fromDegrees(lampLon, pole.lat, tipH - 0.5);
  const beamPos = Cesium.Cartesian3.fromDegrees(lampLon, pole.lat, tipH - 3.0);
  const groundPos = Cesium.Cartesian3.fromDegrees(
    lampLon,
    pole.lat,
    pole.height + 0.05
  );

  const metal = Cesium.Color.fromCssColorString("#5a6270");
  const metalDark = Cesium.Color.fromCssColorString("#2a303c");
  const filament = Cesium.Color.fromCssColorString("#fff6d0");
  const warm = Cesium.Color.fromCssColorString("#ffc85a");

  // Shaft
  let shaft = caches.poles.get(pole.id);
  if (!shaft) {
    shaft = viewer.entities.add({
      id: pole.id,
      position: shaftPos,
      name: "Street light",
      cylinder: {
        length: shaftH,
        topRadius: 0.11,
        bottomRadius: 0.2,
        material: metal,
        slices: 12,
      },
      properties: { kind: "pole", lightsOn: pole.lightsOn },
    });
    caches.poles.set(pole.id, shaft);
  } else {
    shaft.position = new Cesium.ConstantPositionProperty(shaftPos);
  }

  // Arm
  let arm = caches.arms.get(pole.id);
  if (!arm) {
    arm = viewer.entities.add({
      id: `${pole.id}-arm`,
      polyline: {
        positions: [topPos, headPos],
        width: 4,
        material: metalDark,
      },
    });
    caches.arms.set(pole.id, arm);
  } else if (arm.polyline) {
    arm.polyline.positions = new Cesium.ConstantProperty([topPos, headPos]);
  }

  // Canopy
  let housing = caches.housings.get(pole.id);
  if (!housing) {
    housing = viewer.entities.add({
      id: `${pole.id}-housing`,
      position: headPos,
      cylinder: {
        length: 0.28,
        topRadius: 0.28,
        bottomRadius: 0.5,
        material: metalDark,
        slices: 16,
      },
    });
    caches.housings.set(pole.id, housing);
  } else {
    housing.position = new Cesium.ConstantPositionProperty(headPos);
  }

  // Filament — bright when lit
  let bulb = caches.bulbs.get(pole.id);
  const bulbColor = lit
    ? filament.withAlpha(1)
    : on
      ? filament.withAlpha(0.55)
      : Cesium.Color.fromCssColorString("#8a90a0").withAlpha(0.7);
  if (!bulb) {
    bulb = viewer.entities.add({
      id: `${pole.id}-bulb`,
      position: lampPos,
      ellipsoid: {
        radii: new Cesium.Cartesian3(0.28, 0.28, 0.2),
        material: bulbColor,
      },
    });
    caches.bulbs.set(pole.id, bulb);
  } else {
    bulb.position = new Cesium.ConstantPositionProperty(lampPos);
    if (bulb.ellipsoid) bulb.ellipsoid.material = bulbColor;
  }

  // Big screen-space glow — the “this is a light” cue
  let glow = caches.glows.get(pole.id);
  if (!glow) {
    glow = viewer.entities.add({
      id: `${pole.id}-glow`,
      position: lampPos,
      point: {
        pixelSize: lit ? 42 : on ? 10 : 2,
        color: lit
          ? Cesium.Color.fromCssColorString("#ffe9a0").withAlpha(0.95)
          : filament.withAlpha(0.4),
        outlineColor: Cesium.Color.WHITE.withAlpha(lit ? 0.5 : 0),
        outlineWidth: 2,
        scaleByDistance: new Cesium.NearFarScalar(20, 2.2, 500, 0.5),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      show: on,
    });
    caches.glows.set(pole.id, glow);
  } else {
    glow.position = new Cesium.ConstantPositionProperty(lampPos);
    glow.show = on;
    if (glow.point) {
      glow.point.pixelSize = lit ? 42 : on ? 10 : 2;
      glow.point.color = lit
        ? Cesium.Color.fromCssColorString("#ffe9a0").withAlpha(0.95)
        : filament.withAlpha(0.4);
    }
  }

  // Warm beam
  let beam = caches.beams.get(pole.id);
  if (!beam) {
    beam = viewer.entities.add({
      id: `${pole.id}-beam`,
      position: beamPos,
      cylinder: {
        length: 5.5,
        topRadius: 0.08,
        bottomRadius: 3.2,
        material: warm.withAlpha(0.22),
        slices: 20,
      },
      show: lit,
    });
    caches.beams.set(pole.id, beam);
  } else {
    beam.position = new Cesium.ConstantPositionProperty(beamPos);
    beam.show = lit;
    if (beam.cylinder) beam.cylinder.material = warm.withAlpha(0.22);
  }

  // Soft ground pool + brighter inner ring
  const clamp = Cesium.HeightReference?.CLAMP_TO_GROUND;
  let pool = caches.pools.get(pole.id);
  if (!pool) {
    pool = viewer.entities.add({
      id: `${pole.id}-pool`,
      position: groundPos,
      ellipse: {
        semiMajorAxis: 9,
        semiMinorAxis: 9,
        height: clamp ? undefined : pole.height + 0.05,
        heightReference: clamp,
        material: warm.withAlpha(0.28),
        outline: false,
        classificationType: Cesium.ClassificationType?.TERRAIN,
      },
      show: lit,
    });
    caches.pools.set(pole.id, pool);
  } else {
    pool.position = new Cesium.ConstantPositionProperty(groundPos);
    pool.show = lit;
    if (pool.ellipse) pool.ellipse.material = warm.withAlpha(0.28);
  }

  let ring = caches.rings.get(pole.id);
  if (!ring) {
    ring = viewer.entities.add({
      id: `${pole.id}-ring`,
      position: groundPos,
      ellipse: {
        semiMajorAxis: 3,
        semiMinorAxis: 3,
        height: clamp ? undefined : pole.height + 0.07,
        heightReference: clamp,
        material: filament.withAlpha(0.45),
        outline: false,
        classificationType: Cesium.ClassificationType?.TERRAIN,
      },
      show: lit,
    });
    caches.rings.set(pole.id, ring);
  } else {
    ring.position = new Cesium.ConstantPositionProperty(groundPos);
    ring.show = lit;
    if (ring.ellipse) ring.ellipse.material = filament.withAlpha(0.45);
  }
}

function ensureMaps(caches: PoleLightCaches) {
  caches.poles ??= new Map();
  caches.arms ??= new Map();
  caches.housings ??= new Map();
  caches.bulbs ??= new Map();
  caches.glows ??= new Map();
  caches.beams ??= new Map();
  caches.pools ??= new Map();
  caches.rings ??= new Map();
}

export function removePoleLight(
  viewer: any,
  id: string,
  caches: PoleLightCaches
) {
  for (const eid of [
    id,
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
  caches.arms?.delete(id);
  caches.housings?.delete(id);
  caches.bulbs?.delete(id);
  caches.glows?.delete(id);
  caches.beams?.delete(id);
  caches.pools?.delete(id);
  caches.rings?.delete(id);
}

export function startPoleLightFlickerLoop(
  viewer: any,
  isActive: () => boolean
) {
  let raf = 0;
  let last = 0;
  const tick = (now: number) => {
    if (isActive() && now - last > 100) {
      last = now;
      viewer.scene?.requestRender?.();
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

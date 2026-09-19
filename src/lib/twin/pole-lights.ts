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
}

/**
 * Clean street-lamp: dark shaft, short arm, lantern head, bright bulb.
 * Night adds a soft downward beam + small warm ground wash.
 * No giant flat orange discs.
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

  const shaftH = 7.5;
  const tipH = pole.height + shaftH;
  const dLon =
    1.35 / (111_320 * Math.max(0.2, Math.cos((pole.lat * Math.PI) / 180)));
  const lampLon = pole.lon + dLon;

  const shaftPos = Cesium.Cartesian3.fromDegrees(
    pole.lon,
    pole.lat,
    pole.height + shaftH / 2
  );
  const topPos = Cesium.Cartesian3.fromDegrees(pole.lon, pole.lat, tipH);
  const lampPos = Cesium.Cartesian3.fromDegrees(lampLon, pole.lat, tipH - 0.45);
  const headPos = Cesium.Cartesian3.fromDegrees(lampLon, pole.lat, tipH - 0.25);
  const beamPos = Cesium.Cartesian3.fromDegrees(lampLon, pole.lat, tipH - 2.6);
  const groundPos = Cesium.Cartesian3.fromDegrees(
    lampLon,
    pole.lat,
    pole.height + 0.06
  );

  const metal = Cesium.Color.fromCssColorString("#4a5160");
  const metalDark = Cesium.Color.fromCssColorString("#2e3440");
  const filament = Cesium.Color.fromCssColorString("#fff1c2");
  const warm = Cesium.Color.fromCssColorString("#ffd27a");
  const bulbBright = on ? (night ? 1 : 0.5) : 0.18;

  // Shaft
  let shaft = caches.poles.get(pole.id);
  if (!shaft) {
    shaft = viewer.entities.add({
      id: pole.id,
      position: shaftPos,
      name: "Street light",
      cylinder: {
        length: shaftH,
        topRadius: 0.1,
        bottomRadius: 0.18,
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
        width: 3,
        material: metalDark,
      },
    });
    caches.arms.set(pole.id, arm);
  } else if (arm.polyline) {
    arm.polyline.positions = new Cesium.ConstantProperty([topPos, headPos]);
  }

  // Housing
  let housing = caches.housings.get(pole.id);
  if (!housing) {
    housing = viewer.entities.add({
      id: `${pole.id}-housing`,
      position: headPos,
      cylinder: {
        length: 0.32,
        topRadius: 0.32,
        bottomRadius: 0.42,
        material: metalDark,
        slices: 14,
      },
    });
    caches.housings.set(pole.id, housing);
  } else {
    housing.position = new Cesium.ConstantPositionProperty(headPos);
  }

  // Bulb
  let bulb = caches.bulbs.get(pole.id);
  if (!bulb) {
    bulb = viewer.entities.add({
      id: `${pole.id}-bulb`,
      position: lampPos,
      ellipsoid: {
        radii: new Cesium.Cartesian3(0.2, 0.2, 0.15),
        material: filament.withAlpha(bulbBright),
      },
    });
    caches.bulbs.set(pole.id, bulb);
  } else {
    bulb.position = new Cesium.ConstantPositionProperty(lampPos);
    if (bulb.ellipsoid) {
      bulb.ellipsoid.material = filament.withAlpha(bulbBright);
    }
  }

  // Screen-space glow
  let glow = caches.glows.get(pole.id);
  if (!glow) {
    glow = viewer.entities.add({
      id: `${pole.id}-glow`,
      position: lampPos,
      point: {
        pixelSize: lit ? 18 : on ? 8 : 1,
        color: filament.withAlpha(lit ? 0.9 : on ? 0.35 : 0),
        outlineColor: Cesium.Color.WHITE.withAlpha(lit ? 0.25 : 0),
        outlineWidth: 1,
        scaleByDistance: new Cesium.NearFarScalar(30, 1.6, 600, 0.4),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      show: on,
    });
    caches.glows.set(pole.id, glow);
  } else {
    glow.position = new Cesium.ConstantPositionProperty(lampPos);
    glow.show = on;
    if (glow.point) {
      glow.point.pixelSize = lit ? 18 : on ? 8 : 1;
      glow.point.color = filament.withAlpha(lit ? 0.9 : on ? 0.35 : 0);
    }
  }

  // Narrow beam — night only
  let beam = caches.beams.get(pole.id);
  if (!beam) {
    beam = viewer.entities.add({
      id: `${pole.id}-beam`,
      position: beamPos,
      cylinder: {
        length: 4.6,
        topRadius: 0.05,
        bottomRadius: 1.8,
        material: warm.withAlpha(0.14),
        slices: 18,
      },
      show: lit,
    });
    caches.beams.set(pole.id, beam);
  } else {
    beam.position = new Cesium.ConstantPositionProperty(beamPos);
    beam.show = lit;
    if (beam.cylinder) {
      beam.cylinder.material = warm.withAlpha(0.14);
    }
  }

  // Small ground wash — night only
  const clamp = Cesium.HeightReference?.CLAMP_TO_GROUND;
  let pool = caches.pools.get(pole.id);
  if (!pool) {
    pool = viewer.entities.add({
      id: `${pole.id}-pool`,
      position: groundPos,
      ellipse: {
        semiMajorAxis: 5.5,
        semiMinorAxis: 5.5,
        height: clamp ? undefined : pole.height + 0.06,
        heightReference: clamp,
        material: warm.withAlpha(0.2),
        outline: false,
        classificationType: Cesium.ClassificationType?.TERRAIN,
      },
      show: lit,
    });
    caches.pools.set(pole.id, pool);
  } else {
    pool.position = new Cesium.ConstantPositionProperty(groundPos);
    pool.show = lit;
    if (pool.ellipse) {
      pool.ellipse.material = warm.withAlpha(0.2);
    }
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
}

export function startPoleLightFlickerLoop(
  viewer: any,
  isActive: () => boolean
) {
  let raf = 0;
  let last = 0;
  const tick = (now: number) => {
    if (isActive() && now - last > 120) {
      last = now;
      viewer.scene?.requestRender?.();
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

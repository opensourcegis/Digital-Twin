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
  lamps: Map<string, any>;
  pools: Map<string, any>;
  hotspots: Map<string, any>;
  cones: Map<string, any>;
}

/**
 * Natural street-lamp look:
 * warm ~2700K tone, soft ground pools, gentle vertical wash,
 * night-biased intensity with a subtle flicker — no harsh sprites.
 */
export function syncNaturalPoleLight(
  Cesium: CesiumNS,
  viewer: any,
  pole: PoleLightPose,
  timeOfDay: TimeOfDay,
  masterOn: boolean,
  caches: PoleLightCaches
) {
  const lit = pole.lightsOn && masterOn;
  const night = timeOfDay === "night";
  const shaftLen = 9.2;
  const tipH = pole.height + shaftLen;

  const shaftPos = Cesium.Cartesian3.fromDegrees(
    pole.lon,
    pole.lat,
    pole.height + shaftLen / 2
  );
  const tip = Cesium.Cartesian3.fromDegrees(pole.lon, pole.lat, tipH);
  const ground = Cesium.Cartesian3.fromDegrees(
    pole.lon,
    pole.lat,
    pole.height + 0.05
  );
  const coneMid = Cesium.Cartesian3.fromDegrees(
    pole.lon,
    pole.lat,
    tipH - 3.8
  );

  const warm = Cesium.Color.fromCssColorString("#ffc878");
  const warmSoft = Cesium.Color.fromCssColorString("#ffb347");
  const steel = Cesium.Color.fromCssColorString("#8b93a7");

  const basePool = lit ? (night ? 0.26 : 0.035) : 0;
  const baseHot = lit ? (night ? 0.4 : 0.05) : 0;
  const coneAlpha = lit ? (night ? 0.09 : 0.015) : 0;
  const lampAlpha = lit ? (night ? 0.95 : 0.3) : 0.12;

  const phase = pole.lon * 40 + pole.lat * 55;
  const flicker = () =>
    night && lit
      ? 0.9 +
        0.1 *
          Math.sin(Date.now() / 190 + phase) *
          Math.sin(Date.now() / 310 + phase * 0.5)
      : 1;

  // Shaft
  let shaft = caches.poles.get(pole.id);
  if (!shaft) {
    shaft = viewer.entities.add({
      id: pole.id,
      position: shaftPos,
      name: "Electric pole",
      cylinder: {
        length: shaftLen,
        topRadius: 0.16,
        bottomRadius: 0.26,
        material: steel,
        slices: 14,
      },
      properties: { kind: "pole", lightsOn: pole.lightsOn },
    });
    caches.poles.set(pole.id, shaft);
  } else {
    shaft.position = new Cesium.ConstantPositionProperty(shaftPos);
  }

  // Lamp head
  const lampId = `${pole.id}-lamp`;
  let lamp = caches.lamps.get(pole.id);
  if (!lamp) {
    lamp = viewer.entities.add({
      id: lampId,
      position: tip,
      ellipsoid: {
        radii: new Cesium.Cartesian3(0.4, 0.4, 0.28),
        material: new Cesium.ColorMaterialProperty(
          new Cesium.CallbackProperty(
            () =>
              lit
                ? warm.withAlpha(lampAlpha * flicker())
                : Cesium.Color.fromCssColorString("#9aa3b5").withAlpha(0.85),
            false
          )
        ),
      },
    });
    caches.lamps.set(pole.id, lamp);
  } else {
    lamp.position = new Cesium.ConstantPositionProperty(tip);
    if (lamp.ellipsoid) {
      lamp.ellipsoid.material = new Cesium.ColorMaterialProperty(
        new Cesium.CallbackProperty(
          () =>
            lit
              ? warm.withAlpha(lampAlpha * flicker())
              : Cesium.Color.fromCssColorString("#9aa3b5").withAlpha(0.85),
          false
        )
      );
    }
  }

  // Outer soft pool
  let pool = caches.pools.get(pole.id);
  if (!pool) {
    pool = viewer.entities.add({
      id: `${pole.id}-pool`,
      position: ground,
      ellipse: {
        semiMajorAxis: 17,
        semiMinorAxis: 17,
        height: pole.height + 0.04,
        material: new Cesium.ColorMaterialProperty(
          new Cesium.CallbackProperty(
            () => warmSoft.withAlpha(basePool * flicker()),
            false
          )
        ),
        outline: false,
      },
      show: lit,
    });
    caches.pools.set(pole.id, pool);
  } else {
    pool.position = new Cesium.ConstantPositionProperty(ground);
    pool.show = lit;
    if (pool.ellipse) {
      pool.ellipse.height = new Cesium.ConstantProperty(pole.height + 0.04);
      pool.ellipse.material = new Cesium.ColorMaterialProperty(
        new Cesium.CallbackProperty(
          () => warmSoft.withAlpha(basePool * flicker()),
          false
        )
      );
    }
  }

  // Inner hotspot
  let hot = caches.hotspots.get(pole.id);
  if (!hot) {
    hot = viewer.entities.add({
      id: `${pole.id}-hot`,
      position: ground,
      ellipse: {
        semiMajorAxis: 5.2,
        semiMinorAxis: 5.2,
        height: pole.height + 0.05,
        material: new Cesium.ColorMaterialProperty(
          new Cesium.CallbackProperty(
            () => warm.withAlpha(baseHot * flicker()),
            false
          )
        ),
        outline: false,
      },
      show: lit,
    });
    caches.hotspots.set(pole.id, hot);
  } else {
    hot.position = new Cesium.ConstantPositionProperty(ground);
    hot.show = lit;
    if (hot.ellipse) {
      hot.ellipse.height = new Cesium.ConstantProperty(pole.height + 0.05);
      hot.ellipse.material = new Cesium.ColorMaterialProperty(
        new Cesium.CallbackProperty(
          () => warm.withAlpha(baseHot * flicker()),
          false
        )
      );
    }
  }

  // Soft vertical wash cone
  let cone = caches.cones.get(pole.id);
  if (!cone) {
    cone = viewer.entities.add({
      id: `${pole.id}-cone`,
      position: coneMid,
      cylinder: {
        length: 7.6,
        topRadius: 0.12,
        bottomRadius: 5.5,
        material: new Cesium.ColorMaterialProperty(
          new Cesium.CallbackProperty(
            () => warm.withAlpha(coneAlpha * flicker()),
            false
          )
        ),
        slices: 28,
      },
      show: lit,
    });
    caches.cones.set(pole.id, cone);
  } else {
    cone.position = new Cesium.ConstantPositionProperty(coneMid);
    cone.show = lit;
    if (cone.cylinder) {
      cone.cylinder.material = new Cesium.ColorMaterialProperty(
        new Cesium.CallbackProperty(
          () => warm.withAlpha(coneAlpha * flicker()),
          false
        )
      );
    }
  }
}

export function removePoleLight(viewer: any, id: string, caches: PoleLightCaches) {
  for (const eid of [id, `${id}-lamp`, `${id}-pool`, `${id}-hot`, `${id}-cone`]) {
    const e = viewer.entities.getById(eid);
    if (e) viewer.entities.remove(e);
  }
  caches.poles.delete(id);
  caches.lamps.delete(id);
  caches.pools.delete(id);
  caches.hotspots.delete(id);
  caches.cones.delete(id);
}

/** Keep night flicker alive under requestRenderMode. */
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

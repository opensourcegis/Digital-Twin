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
  lamps: Map<string, any>;
  glows: Map<string, any>;
  pools: Map<string, any>;
  hotspots: Map<string, any>;
  beams: Map<string, any>;
}

function emptyCaches(): PoleLightCaches {
  return {
    poles: new Map(),
    arms: new Map(),
    housings: new Map(),
    lamps: new Map(),
    glows: new Map(),
    pools: new Map(),
    hotspots: new Map(),
    beams: new Map(),
  };
}

/**
 * Street-lamp look: dark shaft + cantilever arm + housing + glowing bulb,
 * soft ground wash (clamped), subtle beam. Reads as a light at night,
 * not a flat orange disc.
 */
export function syncNaturalPoleLight(
  Cesium: CesiumNS,
  viewer: any,
  pole: PoleLightPose,
  timeOfDay: TimeOfDay,
  masterOn: boolean,
  caches: PoleLightCaches
) {
  // Migrate old cache shape if needed
  if (!caches.arms) Object.assign(caches, emptyCaches(), caches);

  const lit = pole.lightsOn && masterOn;
  const night = timeOfDay === "night";
  const shaftLen = 8.4;
  const tipH = pole.height + shaftLen;
  const groundH = pole.height + 0.08;

  const shaftPos = Cesium.Cartesian3.fromDegrees(
    pole.lon,
    pole.lat,
    pole.height + shaftLen / 2
  );
  // Arm extends east (~local) so the lamp hangs off the pole
  const armLon =
    pole.lon + 1.8 / (111_320 * Math.cos((pole.lat * Math.PI) / 180));
  const lampPos = Cesium.Cartesian3.fromDegrees(armLon, pole.lat, tipH - 0.55);
  const housingPos = Cesium.Cartesian3.fromDegrees(
    armLon,
    pole.lat,
    tipH - 0.35
  );
  const ground = Cesium.Cartesian3.fromDegrees(armLon, pole.lat, groundH);
  const beamMid = Cesium.Cartesian3.fromDegrees(
    armLon,
    pole.lat,
    tipH - 3.2
  );

  const steel = Cesium.Color.fromCssColorString("#3d4454");
  const steelDark = Cesium.Color.fromCssColorString("#2a303c");
  const bulb = Cesium.Color.fromCssColorString("#ffe9a8");
  const wash = Cesium.Color.fromCssColorString("#ffcc77");

  const bulbAlpha = lit ? (night ? 1.0 : 0.45) : 0.15;
  const glowAlpha = lit ? (night ? 0.55 : 0.08) : 0;
  const poolAlpha = lit ? (night ? 0.22 : 0.03) : 0;
  const hotAlpha = lit ? (night ? 0.38 : 0.05) : 0;
  const beamAlpha = lit ? (night ? 0.1 : 0.015) : 0;

  const phase = pole.lon * 40 + pole.lat * 55;
  const flicker = () =>
    night && lit
      ? 0.92 +
        0.08 *
          Math.sin(Date.now() / 210 + phase) *
          Math.sin(Date.now() / 340 + phase * 0.4)
      : 1;

  const clampTerrain =
    Cesium.HeightReference?.CLAMP_TO_GROUND ?? undefined;

  // —— Shaft ——
  let shaft = caches.poles.get(pole.id);
  if (!shaft) {
    shaft = viewer.entities.add({
      id: pole.id,
      position: shaftPos,
      name: "Street light",
      cylinder: {
        length: shaftLen,
        topRadius: 0.11,
        bottomRadius: 0.2,
        material: steel,
        slices: 12,
      },
      properties: { kind: "pole", lightsOn: pole.lightsOn },
    });
    caches.poles.set(pole.id, shaft);
  } else {
    shaft.position = new Cesium.ConstantPositionProperty(shaftPos);
  }

  // —— Cantilever arm (polyline — reliable orientation) ——
  const shaftTop = Cesium.Cartesian3.fromDegrees(
    pole.lon,
    pole.lat,
    tipH - 0.2
  );
  let arm = caches.arms.get(pole.id);
  if (!arm) {
    arm = viewer.entities.add({
      id: `${pole.id}-arm`,
      polyline: {
        positions: [shaftTop, housingPos],
        width: 4,
        material: steelDark,
        clampToGround: false,
      },
    });
    caches.arms.set(pole.id, arm);
  } else {
    if (arm.polyline) {
      arm.polyline.positions = new Cesium.ConstantProperty([
        shaftTop,
        housingPos,
      ]);
    }
  }

  // —— Lamp housing (dark canopy) ——
  let housing = caches.housings.get(pole.id);
  if (!housing) {
    housing = viewer.entities.add({
      id: `${pole.id}-housing`,
      position: housingPos,
      cylinder: {
        length: 0.28,
        topRadius: 0.38,
        bottomRadius: 0.48,
        material: steelDark,
        slices: 16,
      },
    });
    caches.housings.set(pole.id, housing);
  } else {
    housing.position = new Cesium.ConstantPositionProperty(housingPos);
  }

  // —— Glowing bulb under housing ——
  let lamp = caches.lamps.get(pole.id);
  if (!lamp) {
    lamp = viewer.entities.add({
      id: `${pole.id}-lamp`,
      position: lampPos,
      ellipsoid: {
        radii: new Cesium.Cartesian3(0.22, 0.22, 0.16),
        material: new Cesium.ColorMaterialProperty(
          new Cesium.CallbackProperty(
            () =>
              lit
                ? bulb.withAlpha(bulbAlpha * flicker())
                : Cesium.Color.fromCssColorString("#7a8499").withAlpha(0.7),
            false
          )
        ),
      },
    });
    caches.lamps.set(pole.id, lamp);
  } else {
    lamp.position = new Cesium.ConstantPositionProperty(lampPos);
    if (lamp.ellipsoid) {
      lamp.ellipsoid.material = new Cesium.ColorMaterialProperty(
        new Cesium.CallbackProperty(
          () =>
            lit
              ? bulb.withAlpha(bulbAlpha * flicker())
              : Cesium.Color.fromCssColorString("#7a8499").withAlpha(0.7),
          false
        )
      );
    }
  }

  // —— Screen-space glow point (reads as a light from distance) ——
  let glow = caches.glows.get(pole.id);
  if (!glow) {
    glow = viewer.entities.add({
      id: `${pole.id}-glow`,
      position: lampPos,
      point: {
        pixelSize: night ? 16 : 8,
        color: new Cesium.CallbackProperty(
          () => bulb.withAlpha(glowAlpha * flicker()),
          false
        ),
        outlineColor: Cesium.Color.fromCssColorString("#fff6d6").withAlpha(
          night && lit ? 0.35 : 0
        ),
        outlineWidth: 2,
        scaleByDistance: new Cesium.NearFarScalar(40, 1.5, 900, 0.35),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      show: lit,
    });
    caches.glows.set(pole.id, glow);
  } else {
    glow.position = new Cesium.ConstantPositionProperty(lampPos);
    glow.show = lit;
    if (glow.point) {
      glow.point.pixelSize = night ? 16 : 8;
      glow.point.color = new Cesium.CallbackProperty(
        () => bulb.withAlpha(glowAlpha * flicker()),
        false
      );
    }
  }

  // —— Soft ground wash (clamped to terrain — not a floating disc) ——
  let pool = caches.pools.get(pole.id);
  if (!pool) {
    pool = viewer.entities.add({
      id: `${pole.id}-pool`,
      position: ground,
      ellipse: {
        semiMajorAxis: 14,
        semiMinorAxis: 14,
        height: clampTerrain ? undefined : groundH,
        heightReference: clampTerrain,
        material: new Cesium.ColorMaterialProperty(
          new Cesium.CallbackProperty(
            () => wash.withAlpha(poolAlpha * flicker()),
            false
          )
        ),
        outline: false,
        classificationType: Cesium.ClassificationType?.TERRAIN,
      },
      show: lit && night,
    });
    caches.pools.set(pole.id, pool);
  } else {
    pool.position = new Cesium.ConstantPositionProperty(ground);
    pool.show = lit && night;
    if (pool.ellipse) {
      pool.ellipse.material = new Cesium.ColorMaterialProperty(
        new Cesium.CallbackProperty(
          () => wash.withAlpha(poolAlpha * flicker()),
          false
        )
      );
    }
  }

  // —— Tight hotspot under the lamp ——
  let hot = caches.hotspots.get(pole.id);
  if (!hot) {
    hot = viewer.entities.add({
      id: `${pole.id}-hot`,
      position: ground,
      ellipse: {
        semiMajorAxis: 3.2,
        semiMinorAxis: 3.2,
        height: clampTerrain ? undefined : groundH + 0.02,
        heightReference: clampTerrain,
        material: new Cesium.ColorMaterialProperty(
          new Cesium.CallbackProperty(
            () => bulb.withAlpha(hotAlpha * flicker()),
            false
          )
        ),
        outline: false,
        classificationType: Cesium.ClassificationType?.TERRAIN,
      },
      show: lit && night,
    });
    caches.hotspots.set(pole.id, hot);
  } else {
    hot.position = new Cesium.ConstantPositionProperty(ground);
    hot.show = lit && night;
    if (hot.ellipse) {
      hot.ellipse.material = new Cesium.ColorMaterialProperty(
        new Cesium.CallbackProperty(
          () => bulb.withAlpha(hotAlpha * flicker()),
          false
        )
      );
    }
  }

  // —— Subtle downward beam (narrow, low alpha) ——
  let beam = caches.beams.get(pole.id);
  if (!beam) {
    beam = viewer.entities.add({
      id: `${pole.id}-beam`,
      position: beamMid,
      cylinder: {
        length: 5.8,
        topRadius: 0.08,
        bottomRadius: 2.4,
        material: new Cesium.ColorMaterialProperty(
          new Cesium.CallbackProperty(
            () => wash.withAlpha(beamAlpha * flicker()),
            false
          )
        ),
        slices: 20,
      },
      show: lit && night,
    });
    caches.beams.set(pole.id, beam);
  } else {
    beam.position = new Cesium.ConstantPositionProperty(beamMid);
    beam.show = lit && night;
    if (beam.cylinder) {
      beam.cylinder.material = new Cesium.ColorMaterialProperty(
        new Cesium.CallbackProperty(
          () => wash.withAlpha(beamAlpha * flicker()),
          false
        )
      );
    }
  }
}

export function removePoleLight(
  viewer: any,
  id: string,
  caches: PoleLightCaches
) {
  const suffixes = [
    "",
    "-arm",
    "-housing",
    "-lamp",
    "-glow",
    "-pool",
    "-hot",
    "-beam",
    // legacy ids from prior pole renderer
    "-cone",
  ];
  for (const s of suffixes) {
    const e = viewer.entities.getById(`${id}${s}`);
    if (e) viewer.entities.remove(e);
  }
  caches.poles.delete(id);
  caches.arms?.delete(id);
  caches.housings?.delete(id);
  caches.lamps.delete(id);
  caches.glows?.delete(id);
  caches.pools.delete(id);
  caches.hotspots.delete(id);
  caches.beams?.delete(id);
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

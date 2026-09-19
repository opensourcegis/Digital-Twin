import { BUILDING_GUID_BY_CODE } from "./asset-map";
import { TWIN_LOOK, buildingFinish } from "./visual-theme";

/* eslint-disable @typescript-eslint/no-explicit-any */

type CesiumNS = any;

export function applyBuildingSymbology(
  Cesium: CesiumNS,
  entities: any[],
  symbology: Record<string, { color: string; pulse: boolean }>
) {
  for (const ent of entities) {
    const props = ent.properties;
    const code = props?.id?.getValue?.() ?? props?.id;
    const guid = BUILDING_GUID_BY_CODE[code];
    if (!ent.polygon) continue;
    const use = props?.use?.getValue?.() ?? props?.use;
    const architectural = buildingFinish(typeof use === "string" ? use : undefined);
    const sym = guid ? symbology[guid] : undefined;
    // Alert tint only — never neon-green healthy buildings
    const color = sym?.pulse || sym?.color === "#e57373" || sym?.color === "#e2b15a"
      ? sym.color
      : architectural;
    ent.polygon.material = Cesium.Color.fromCssColorString(color).withAlpha(
      sym?.pulse ? 0.72 : TWIN_LOOK.buildings.alpha
    );
    ent.polygon.outlineColor = Cesium.Color.fromCssColorString(
      sym?.pulse
        ? TWIN_LOOK.buildings.alertOutline
        : TWIN_LOOK.buildings.outline
    ).withAlpha(TWIN_LOOK.buildings.outlineAlpha);
  }
}

export function applySensorSymbology(
  Cesium: CesiumNS,
  entities: any[],
  symbology: Record<string, { color: string; pulse: boolean }>
) {
  for (const ent of entities) {
    const guid = ent.properties?.guid?.getValue?.() ?? ent.properties?.guid;
    if (!guid || !ent.point) continue;
    const sym = symbology[guid];
    const color = sym?.color ?? TWIN_LOOK.sensors.ok;
    ent.point.color = Cesium.Color.fromCssColorString(color);
    ent.point.pixelSize = sym?.pulse
      ? TWIN_LOOK.sensors.size + 3
      : TWIN_LOOK.sensors.size;
  }
}

export async function loadTwinLayers(
  Cesium: CesiumNS,
  viewer: any,
  sensors: Array<{
    guid: string;
    name: string;
    lon: number;
    lat: number;
    height: number;
    metric: string;
  }>
) {
  const utilities = await (await fetch("/demo/campus-utilities.geojson")).json();
  const terrain = await (await fetch("/demo/campus-terrain.geojson")).json();

  const utilityEntities: any[] = [];
  for (const f of utilities.features) {
    const positions = (f.geometry.coordinates as number[][]).map(
      ([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat, -1.2)
    );
    const kind = f.properties.kind as string;
    const color =
      kind === "steam"
        ? TWIN_LOOK.utilities.steam
        : kind === "storm"
          ? TWIN_LOOK.utilities.storm
          : TWIN_LOOK.utilities.power;
    utilityEntities.push(
      viewer.entities.add({
        name: f.properties.name,
        polyline: {
          positions,
          width: TWIN_LOOK.utilities.width,
          material: Cesium.Color.fromCssColorString(color).withAlpha(
            TWIN_LOOK.utilities.alpha
          ),
          clampToGround: false,
        },
        properties: { ...f.properties, subsurface: true },
        show: false, // off by default — looks like a "route" when on
      })
    );
  }

  const terrainEntities: any[] = [];
  for (const f of terrain.features) {
    const coords = f.geometry.coordinates[0] as number[][];
    terrainEntities.push(
      viewer.entities.add({
        name: f.properties.name,
        polygon: {
          hierarchy: coords.map(([lon, lat]) =>
            Cesium.Cartesian3.fromDegrees(lon, lat, 0)
          ),
          material: Cesium.Color.fromCssColorString(
            TWIN_LOOK.terrain.fill
          ).withAlpha(TWIN_LOOK.terrain.alpha),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString(
            TWIN_LOOK.terrain.outline
          ).withAlpha(0.25),
          height: 0,
        },
        properties: f.properties,
      })
    );
  }

  const sensorEntities: any[] = [];
  for (const s of sensors) {
    sensorEntities.push(
      viewer.entities.add({
        id: `sensor-${s.guid}`,
        name: s.name,
        position: Cesium.Cartesian3.fromDegrees(s.lon, s.lat, s.height),
        point: {
          pixelSize: TWIN_LOOK.sensors.size,
          color: Cesium.Color.fromCssColorString(TWIN_LOOK.sensors.ok),
          outlineColor: Cesium.Color.fromCssColorString("#0f172a"),
          outlineWidth: 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: s.metric.replace(/_/g, " "),
          font: "600 9px DM Sans, sans-serif",
          fillColor: Cesium.Color.fromCssColorString("#e2e8f0"),
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString("#0f172a").withAlpha(
            0.65
          ),
          backgroundPadding: new Cesium.Cartesian2(6, 4),
          style: Cesium.LabelStyle.FILL,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -12),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: new Cesium.NearFarScalar(200, 1.0, 2500, 0.35),
        },
        properties: { guid: s.guid, metric: s.metric },
      })
    );
  }

  return { utilityEntities, terrainEntities, sensorEntities };
}

export function applyLayerOpacity(Cesium: CesiumNS, entities: any[], opacity: number) {
  for (const ent of entities) {
    if (ent._twinLayerOpacity === opacity) continue;
    ent._twinLayerOpacity = opacity;

    if (ent.polygon?.material) {
      if (!ent._twinPolygonBase) {
        const c = ent.polygon.material.color?.getValue?.() ?? ent.polygon.material;
        ent._twinPolygonBase = c?.withAlpha ? c.withAlpha(1) : c;
      }
      if (ent._twinPolygonBase?.withAlpha) {
        ent.polygon.material = ent._twinPolygonBase.withAlpha(opacity);
      }
    }
    if (ent.polyline?.material) {
      if (!ent._twinPolylineBase) {
        const c =
          ent.polyline.material.color?.getValue?.() ??
          ent.polyline.material?.getValue?.()?.color ??
          ent.polyline.material;
        ent._twinPolylineBase = c?.withAlpha ? c.withAlpha(1) : c;
      }
      if (ent._twinPolylineBase?.withAlpha) {
        ent.polyline.material = ent._twinPolylineBase.withAlpha(opacity);
      }
    }
    if (ent.point?.color) {
      if (!ent._twinPointBase) {
        const c = ent.point.color.getValue?.() ?? ent.point.color;
        ent._twinPointBase = c?.withAlpha ? c.withAlpha(1) : c;
      }
      if (ent._twinPointBase?.withAlpha) {
        ent.point.color = ent._twinPointBase.withAlpha(opacity);
      }
    }
  }
}

export async function loadCustomGeoJsonLayer(
  Cesium: CesiumNS,
  viewer: any,
  url: string,
  style: { fillColor: string; strokeColor: string; lineWidth: number; pointSize: number },
  opacity: number
) {
  const res = await fetch(url);
  const geo = await res.json();
  const entities: any[] = [];
  for (const f of geo.features ?? []) {
    const geom = f.geometry;
    if (!geom) continue;
    if (geom.type === "Polygon") {
      const coords = geom.coordinates[0] as number[][];
      entities.push(
        viewer.entities.add({
          name: f.properties?.name ?? "Custom polygon",
          polygon: {
            hierarchy: coords.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat, 0)),
            material: Cesium.Color.fromCssColorString(style.fillColor).withAlpha(opacity),
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString(style.strokeColor),
            extrudedHeight: f.properties?.height ?? 8,
          },
          properties: f.properties,
        })
      );
    } else if (geom.type === "LineString") {
      const positions = (geom.coordinates as number[][]).map(([lon, lat]) =>
        Cesium.Cartesian3.fromDegrees(lon, lat, 0.5)
      );
      entities.push(
        viewer.entities.add({
          name: f.properties?.name ?? "Custom line",
          polyline: {
            positions,
            width: style.lineWidth,
            material: Cesium.Color.fromCssColorString(style.fillColor).withAlpha(opacity),
          },
          properties: f.properties,
        })
      );
    } else if (geom.type === "Point") {
      const [lon, lat] = geom.coordinates as number[];
      entities.push(
        viewer.entities.add({
          name: f.properties?.name ?? "Custom point",
          position: Cesium.Cartesian3.fromDegrees(lon, lat, 2),
          point: {
            pixelSize: style.pointSize,
            color: Cesium.Color.fromCssColorString(style.fillColor).withAlpha(opacity),
            outlineColor: Cesium.Color.fromCssColorString(style.strokeColor),
            outlineWidth: 2,
          },
          properties: f.properties,
        })
      );
    }
  }
  return entities;
}

export function updateWalkthroughCamera(
  Cesium: CesiumNS,
  viewer: any,
  mode: "off" | "first" | "third" | "walk",
  robotPos: any,
  headingRad: number
) {
  if (mode === "off" || mode === "walk" || !robotPos) return;

  const heading = headingRad;
  const backM = mode === "first" ? 0.55 : 16;
  const upM = mode === "first" ? 1.65 : 8;
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(robotPos);
  const local = new Cesium.Cartesian3(
    -Math.sin(heading) * backM,
    -Math.cos(heading) * backM,
    upM
  );
  const camPos = Cesium.Matrix4.multiplyByPoint(
    enu,
    local,
    new Cesium.Cartesian3()
  );

  viewer.camera.setView({
    destination: camPos,
    orientation: {
      heading,
      pitch: Cesium.Math.toRadians(mode === "first" ? -8 : -32),
      roll: 0,
    },
  });
}

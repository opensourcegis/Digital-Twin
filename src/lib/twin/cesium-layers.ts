import { BUILDING_GUID_BY_CODE } from "./asset-map";

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
    if (!guid || !ent.polygon) continue;
    const sym = symbology[guid];
    const base =
      sym?.color ??
      (props?.use?.getValue?.() === "lab"
        ? "#3d8b8b"
        : props?.use?.getValue?.() === "utility"
          ? "#7a6a4f"
          : "#4a6d7c");
    ent.polygon.material = Cesium.Color.fromCssColorString(base).withAlpha(
      sym?.pulse ? 0.75 : 0.92
    );
    ent.polygon.outlineColor = sym?.pulse
      ? Cesium.Color.fromCssColorString("#ef4444")
      : Cesium.Color.fromCssColorString("#d7e3ea");
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
    const color = sym?.color ?? "#2dd4bf";
    ent.point.color = Cesium.Color.fromCssColorString(color);
    ent.point.pixelSize = sym?.pulse ? 14 : 10;
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
      ([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat, -1.5)
    );
    const kind = f.properties.kind as string;
    const color =
      kind === "steam"
        ? "#f97316"
        : kind === "storm"
          ? "#3b82f6"
          : "#eab308";
    utilityEntities.push(
      viewer.entities.add({
        name: f.properties.name,
        polyline: {
          positions,
          width: 4,
          material: Cesium.Color.fromCssColorString(color).withAlpha(0.7),
          clampToGround: false,
        },
        properties: { ...f.properties, subsurface: true },
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
          material: Cesium.Color.fromCssColorString("#1e3a2f").withAlpha(0.25),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString("#334155").withAlpha(0.4),
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
          pixelSize: 10,
          color: Cesium.Color.fromCssColorString("#2dd4bf"),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: s.metric,
          font: "10px DM Sans, sans-serif",
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -10),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
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
  path: { lon: number; lat: number; height: number }[],
  progress: number
) {
  if (mode === "off" || mode === "walk" || !robotPos) return;

  const total = path.length - 1;
  const x = progress * total;
  const i = Math.min(total - 1, Math.floor(x));
  const a = path[i];
  const b = path[i + 1] ?? path[0];
  const heading = Math.atan2(b.lon - a.lon, b.lat - a.lat);

  const carto = Cesium.Cartographic.fromCartesian(robotPos);
  const lon = Cesium.Math.toDegrees(carto.longitude);
  const lat = Cesium.Math.toDegrees(carto.latitude);
  const h = carto.height;

  const backDist = mode === "first" ? 0 : 0.00008;
  const heightOff = mode === "first" ? 1.6 : 5;
  const camLon = lon - Math.sin(heading) * backDist;
  const camLat = lat - Math.cos(heading) * backDist;

  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(camLon, camLat, h + heightOff),
    orientation: {
      heading,
      pitch: Cesium.Math.toRadians(mode === "first" ? -8 : -22),
      roll: 0,
    },
  });
}

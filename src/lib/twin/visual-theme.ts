/** Shared commercial twin visual language for Cesium entities. */

export const TWIN_LOOK = {
  buildings: {
    office: "#c5d0dc",
    lab: "#b8c8d4",
    warehouse: "#aeb6c2",
    utility: "#b8aea0",
    alpha: 0.92,
    outline: "#f4f7fb",
    outlineAlpha: 0.7,
    alertOutline: "#ef4444",
  },
  roads: {
    primary: "#c5ced8",
    secondary: "#b0bac6",
    alpha: 0.55,
    widthPrimary: 5,
    widthSecondary: 3.5,
  },
  utilities: {
    steam: "#c4845a",
    storm: "#6b8cae",
    power: "#a89b6a",
    alpha: 0.35,
    width: 2,
  },
  terrain: {
    fill: "#2a3340",
    alpha: 0.12,
    outline: "#3d4a5c",
  },
  sensors: {
    ok: "#94a3b8",
    warn: "#e2b15a",
    critical: "#e57373",
    size: 8,
  },
  pois: {
    color: "#cbd5e1",
    size: 7,
  },
  globe: {
    dayBase: "#2c3540",
    nightBase: "#05070c",
    daySky: "#6e8499",
    nightSky: "#03050a",
  },
} as const;

export function buildingFinish(use?: string): string {
  switch (use) {
    case "lab":
      return TWIN_LOOK.buildings.lab;
    case "warehouse":
      return TWIN_LOOK.buildings.warehouse;
    case "utility":
      return TWIN_LOOK.buildings.utility;
    default:
      return TWIN_LOOK.buildings.office;
  }
}

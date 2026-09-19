/** Shared commercial twin visual language for Cesium entities. */

export const TWIN_LOOK = {
  buildings: {
    office: "#d7e0ea",
    lab: "#c9d8e4",
    warehouse: "#c4ccd6",
    utility: "#cbbfb0",
    alpha: 1,
    outline: "#f4f7fb",
    outlineAlpha: 0.85,
    alertOutline: "#ef4444",
    night: {
      office: "#4a5664",
      lab: "#455460",
      warehouse: "#424a54",
      utility: "#4a453c",
      outline: "#6e7c8c",
      outlineAlpha: 0.4,
      alpha: 1,
    },
  },
  roads: {
    primary: "#c5ced8",
    secondary: "#b0bac6",
    alpha: 0.7,
    widthPrimary: 5,
    widthSecondary: 3.5,
    night: {
      primary: "#3a4554",
      secondary: "#2f3846",
      alpha: 0.85,
    },
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
    dayBase: "#4d6a52",
    nightBase: "#05070c",
    daySky: "#87b5dc",
    nightSky: "#070b14",
  },
  lamp: {
    metal: "#8e96a4",
    metalNight: "#5c6472",
    housing: "#1b1f28",
    glassDay: "#cfd5de",
    filament: "#fff4c4",
    glow: "#ffe18a",
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

export function buildingFinishNight(use?: string): string {
  switch (use) {
    case "lab":
      return TWIN_LOOK.buildings.night.lab;
    case "warehouse":
      return TWIN_LOOK.buildings.night.warehouse;
    case "utility":
      return TWIN_LOOK.buildings.night.utility;
    default:
      return TWIN_LOOK.buildings.night.office;
  }
}

export function buildingLook(use: string | undefined, night: boolean) {
  if (night) {
    return {
      fill: buildingFinishNight(use),
      outline: TWIN_LOOK.buildings.night.outline,
      outlineAlpha: TWIN_LOOK.buildings.night.outlineAlpha,
      alpha: TWIN_LOOK.buildings.night.alpha,
    };
  }
  return {
    fill: buildingFinish(use),
    outline: TWIN_LOOK.buildings.outline,
    outlineAlpha: TWIN_LOOK.buildings.outlineAlpha,
    alpha: TWIN_LOOK.buildings.alpha,
  };
}

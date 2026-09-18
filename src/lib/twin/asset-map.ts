/** Maps demo GeoJSON property ids to canonical asset GUIDs */

export const BUILDING_GUID_BY_CODE: Record<string, string> = {
  HQ: "bldg-hq-8f3a-4c1e-9b2d-ops-hall",
  LAB: "bldg-lab-7e2b-3d0f-8a1c-robotics",
  WH1: "bldg-wh1-6d1a-2c9e-7b0f-north-wh",
  WH2: "bldg-wh1-6d1a-2c9e-7b0f-north-wh",
  UTIL: "bldg-util-5c0b-1b8d-6a9e-energy",
  PAD: "site-001-c4e8-4a2b-9f1d-campus-twin",
};

export const POI_GUID_BY_ID: Record<string, string> = {
  P1: "robot-atlas-01-9f0e-5c7d-3b2a",
  P2: "bldg-wh1-6d1a-2c9e-7b0f-north-wh",
  P3: "sens-vib-util-pump",
  P4: "site-001-c4e8-4a2b-9f1d-campus-twin",
};

export function resolveAssetGuid(props: Record<string, unknown>): string | null {
  if (typeof props.guid === "string") return props.guid;
  if (typeof props.id === "string") {
    return BUILDING_GUID_BY_CODE[props.id] ?? POI_GUID_BY_ID[props.id] ?? null;
  }
  return null;
}

/**
 * CesiumJS 1.145+ digital-twin capabilities:
 * - Vector 3D Tiles (+ Cesium3DTileStyle)
 * - Vector draping on 3D Tiles / terrain
 * - ClippingPolygonCollection with holes
 * - IonSnapService BIM/CAD precision snap (when ion token + asset)
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

type CesiumNS = any;

export type DrapeMode = "none" | "terrain" | "tiles" | "both";

export type TilesetStylePreset =
  | "default"
  | "status"
  | "road-class"
  | "highlight-white";

export const TILESET_STYLE_PRESETS: Record<
  TilesetStylePreset,
  { label: string; style: Record<string, unknown> }
> = {
  default: {
    label: "Default",
    style: { color: "color('white')" },
  },
  status: {
    label: "IoT status",
    style: {
      color: {
        conditions: [
          ["\${status} === 'critical'", "color('#ef4444')"],
          ["\${status} === 'maintenance'", "color('#f59e0b')"],
          ["\${status} === 'ok'", "color('#34d399')"],
          ["true", "color('white')"],
        ],
      },
    },
  },
  "road-class": {
    label: "Road class",
    style: {
      color: {
        conditions: [
          ["\${road_class} === 'NH'", "color('#ef4444')"],
          ["\${road_class} === 'SH'", "color('#f59e0b')"],
          ["\${road_class} === 'MDR'", "color('#eab308')"],
          ["true", "color('#e2e8f0')"],
        ],
      },
    },
  },
  "highlight-white": {
    label: "Bright mesh",
    style: {
      color: "color('white', 0.95)",
      show: "true",
    },
  },
};

export function applyCesium3DTileStyle(
  Cesium: CesiumNS,
  tileset: any,
  preset: TilesetStylePreset | Record<string, unknown>
) {
  if (!tileset || !Cesium?.Cesium3DTileStyle) return;
  const styleObj =
    typeof preset === "string"
      ? TILESET_STYLE_PRESETS[preset]?.style ?? TILESET_STYLE_PRESETS.default.style
      : preset;
  try {
    tileset.style = new Cesium.Cesium3DTileStyle(styleObj);
  } catch (err) {
    console.warn("Cesium3DTileStyle apply failed", err);
  }
}

const LAMP_SLOTS = 8;

export interface MeshLamp {
  /** ECEF position of the lamp head. */
  position: any;
  intensity: number;
}

/** Subset of the scene recipe that mesh shading needs. */
export interface MeshLightState {
  albedoGain: number;
  sunGlint: number;
  moonGlint: number;
  nightFill: number;
  roughnessScale: number;
  iblDiffuse: number;
  iblSpecular: number;
  envBrightness: number;
  envSaturation: number;
  envScatter: number;
  envGroundCss: string;
  timeOfDay: "day" | "night";
}

const LAMP_SHADER = `
vec3 twinLamp(vec3 posEC, vec3 n, vec3 v, vec3 lampEC, float intensity) {
  if (intensity < 0.001) return vec3(0.0);
  vec3 toLamp = lampEC - posEC;
  float dist = length(toLamp);
  if (dist < 0.2 || dist > 56.0) return vec3(0.0);
  vec3 l = toLamp / dist;
  float ndl = max(dot(n, l), 0.0);
  vec3 h = normalize(l + v);
  float spec = pow(max(dot(n, h), 0.0), 22.0);
  float atten = intensity / (1.0 + dist * dist * 0.016);
  return vec3(1.0, 0.74, 0.4) * atten * (ndl * 0.92 + spec * 0.7);
}

void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
  vec3 n = fsInput.attributes.normalEC;
  float nlen = length(n);
  if (nlen > 0.05) {
    n /= nlen;
  } else {
    n = vec3(0.0, 0.0, 1.0);
  }
  vec3 v = normalize(-fsInput.attributes.positionEC);
  vec3 posEC = fsInput.attributes.positionEC;
  material.diffuse *= u_albedoGain;

  float sunSpec = 0.0;
  float moonSpec = 0.0;
  if (u_sunGlint > 0.001) {
    vec3 l = normalize(czm_sunDirectionEC);
    float ndl = max(dot(n, l), 0.0);
    vec3 h = normalize(l + v);
    sunSpec = ndl * pow(max(dot(n, h), 0.0), 30.0);
  }
  if (u_moonGlint > 0.001) {
    vec3 l = normalize(czm_moonDirectionEC);
    float ndl = max(dot(n, l), 0.0);
    vec3 h = normalize(l + v);
    moonSpec = ndl * pow(max(dot(n, h), 0.0), 22.0);
  }
  material.emissive += material.diffuse * (
    vec3(1.0, 0.93, 0.78) * sunSpec * u_sunGlint +
    vec3(0.7, 0.8, 1.0) * moonSpec * u_moonGlint
  );
  material.emissive += material.diffuse * vec3(0.55, 0.64, 0.82) * u_nightFill;

  vec3 accum = vec3(0.0);
  accum += twinLamp(posEC, n, v, u_lamp0, u_li0);
  accum += twinLamp(posEC, n, v, u_lamp1, u_li1);
  accum += twinLamp(posEC, n, v, u_lamp2, u_li2);
  accum += twinLamp(posEC, n, v, u_lamp3, u_li3);
  accum += twinLamp(posEC, n, v, u_lamp4, u_li4);
  accum += twinLamp(posEC, n, v, u_lamp5, u_li5);
  accum += twinLamp(posEC, n, v, u_lamp6, u_li6);
  accum += twinLamp(posEC, n, v, u_lamp7, u_li7);
  material.emissive += accum;
  material.roughness = clamp(material.roughness * u_rough, 0.045, 1.0);
}
`;

function lampUniforms(Cesium: CesiumNS): Record<string, unknown> {
  const uniforms: Record<string, unknown> = {
    u_albedoGain: { type: Cesium.UniformType.FLOAT, value: 1 },
    u_sunGlint: { type: Cesium.UniformType.FLOAT, value: 0 },
    u_moonGlint: { type: Cesium.UniformType.FLOAT, value: 0 },
    u_nightFill: { type: Cesium.UniformType.FLOAT, value: 0 },
    u_rough: { type: Cesium.UniformType.FLOAT, value: 1 },
  };
  const zero = new Cesium.Cartesian3();
  for (let i = 0; i < LAMP_SLOTS; i++) {
    uniforms[`u_lamp${i}`] = {
      type: Cesium.UniformType.VEC3,
      value: zero,
    };
    uniforms[`u_li${i}`] = { type: Cesium.UniformType.FLOAT, value: 0 };
  }
  return uniforms;
}

function ensureMeshShader(Cesium: CesiumNS, tileset: any) {
  if (tileset.__twinLightShader) return tileset.__twinLightShader;
  if (!Cesium.CustomShader || !Cesium.UniformType) return null;
  try {
    const shader = new Cesium.CustomShader({
      lightingModel: Cesium.LightingModel?.PBR,
      uniforms: lampUniforms(Cesium),
      fragmentShaderText: LAMP_SHADER,
    });
    tileset.__twinLightShader = shader;
    tileset.customShader = shader;
    return shader;
  } catch (err) {
    console.warn("Mesh light shader failed", err);
    return null;
  }
}

function fallbackMeshState(mode: "day" | "night"): MeshLightState {
  const day = mode === "day";
  return {
    albedoGain: day ? 1 : 0.4,
    sunGlint: day ? 0.46 : 0,
    moonGlint: day ? 0 : 0.4,
    nightFill: day ? 0 : 0.035,
    roughnessScale: 1,
    iblDiffuse: day ? 0.82 : 0.2,
    iblSpecular: day ? 1.28 : 0.82,
    envBrightness: day ? 1.05 : 0.16,
    envSaturation: day ? 1.08 : 0.38,
    envScatter: day ? 2.15 : 0.42,
    envGroundCss: day ? "#4d6a52" : "#141820",
    timeOfDay: mode,
  };
}

/**
 * Light a 3D Tiles mesh from the scene sun or moon, plus nearby pole lamps.
 * `tileset.lightColor` is cleared so the directional scene light is used
 * instead of a flat color multiply.
 */
export function applyTilesetTimeOfDay(
  Cesium: CesiumNS,
  tileset: any,
  mode: "day" | "night",
  stylePreset: TilesetStylePreset = "default",
  _weather?: {
    cloudCoverPct?: number | null;
    rainMm?: number | null;
    precipProbabilityPct?: number | null;
  } | null,
  lighting?: MeshLightState | null
) {
  if (!tileset) return;
  const state = lighting ?? fallbackMeshState(mode);

  try {
    tileset.style = undefined;
  } catch {
    /* ignore */
  }
  if (stylePreset !== "default") {
    applyCesium3DTileStyle(Cesium, tileset, stylePreset);
  } else if ("colorBlendAmount" in tileset) {
    try {
      tileset.colorBlendAmount = 0;
    } catch {
      /* ignore */
    }
  }

  try {
    if ("lightColor" in tileset) tileset.lightColor = undefined;
  } catch {
    /* ignore */
  }

  try {
    if (tileset.imageBasedLighting) {
      tileset.imageBasedLighting.imageBasedLightingFactor = new Cesium.Cartesian2(
        state.iblDiffuse,
        state.iblSpecular
      );
    }
  } catch {
    /* ignore */
  }

  const env = tileset.environmentMapManager;
  if (env) {
    try {
      env.enabled = true;
      env.maximumSecondsDifference = 90;
      env.brightness = state.envBrightness;
      env.saturation = state.envSaturation;
      env.atmosphereScatteringIntensity = state.envScatter;
      if (Cesium.Color?.fromCssColorString) {
        env.groundColor = Cesium.Color.fromCssColorString(state.envGroundCss);
      }
      env.groundAlbedo = state.timeOfDay === "night" ? 0.07 : 0.28;
      const sig = `${state.timeOfDay}|${state.envBrightness.toFixed(2)}|${state.iblDiffuse.toFixed(2)}`;
      if (tileset.__twinEnvSig !== sig) {
        tileset.__twinEnvSig = sig;
        env.reset?.();
      }
    } catch {
      /* environment maps are optional */
    }
  }

  ensureMeshShader(Cesium, tileset);
  const shader = tileset.__twinLightShader;
  if (!shader?.setUniform) return;
  try {
    shader.setUniform("u_albedoGain", state.albedoGain);
    shader.setUniform("u_sunGlint", state.sunGlint);
    shader.setUniform("u_moonGlint", state.moonGlint);
    shader.setUniform("u_nightFill", state.nightFill);
    shader.setUniform("u_rough", state.roughnessScale);
  } catch (err) {
    console.warn("Mesh light uniforms failed", err);
  }
}

const lampScratch: any[] = [];

/** Move lamp uniforms into eye space so highlights stay on the mesh as the camera moves. */
export function updateTilesetLampUniforms(
  Cesium: CesiumNS,
  tileset: any,
  viewer: any,
  lamps: MeshLamp[]
) {
  const shader = tileset?.__twinLightShader;
  if (!shader?.setUniform || !viewer?.camera) return;
  const view = viewer.camera.viewMatrix;
  for (let i = 0; i < LAMP_SLOTS; i++) {
    const lamp = lamps[i];
    if (!lamp || !(lamp.intensity > 0) || !lamp.position) {
      try {
        shader.setUniform(`u_li${i}`, 0);
      } catch {
        return;
      }
      continue;
    }
    const ec =
      lampScratch[i] ?? (lampScratch[i] = new Cesium.Cartesian3());
    Cesium.Matrix4.multiplyByPoint(view, lamp.position, ec);
    try {
      shader.setUniform(`u_lamp${i}`, ec);
      shader.setUniform(`u_li${i}`, lamp.intensity);
    } catch {
      return;
    }
  }
}

/**
 * Resolve a tileset URL for Cesium. Direct fetch by default (fast).
 * Pass forceProxy when the host lacks CORS — routes via /api/tiles-proxy.
 */
export function resourceForTilesetUrl(
  Cesium: CesiumNS,
  url: string,
  opts?: { forceProxy?: boolean }
): any {
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  try {
    const parsed = new URL(
      trimmed,
      typeof window !== "undefined" ? window.location.href : undefined
    );
    if (
      typeof window !== "undefined" &&
      parsed.origin === window.location.origin
    ) {
      return trimmed;
    }
  } catch {
    return trimmed;
  }
  if (!opts?.forceProxy) {
    return trimmed;
  }
  if (!Cesium.Resource || !Cesium.DefaultProxy) {
    return trimmed;
  }
  return new Cesium.Resource({
    url: trimmed,
    proxy: new Cesium.DefaultProxy("/api/tiles-proxy?url="),
  });
}

/** Faster first paint for external meshes; refine SSE after load. */
export const TILESET_LOAD_OPTIONS = {
  maximumScreenSpaceError: 16,
  skipLevelOfDetail: true,
  immediatelyLoadDesiredLevelOfDetail: true,
  loadSiblings: false,
  cullRequestsWhileMovingMultiplier: 60,
} as const;

/**
 * Load 3D Tiles: try direct URL first (fast), fall back to same-origin proxy
 * when the host blocks CORS.
 */
export async function loadTilesetFromUrl(
  Cesium: CesiumNS,
  url: string,
  options: Record<string, unknown> = TILESET_LOAD_OPTIONS
): Promise<any> {
  const trimmed = url.trim();
  try {
    return await Cesium.Cesium3DTileset.fromUrl(trimmed, options);
  } catch (directErr) {
    try {
      return await Cesium.Cesium3DTileset.fromUrl(
        resourceForTilesetUrl(Cesium, trimmed, { forceProxy: true }),
        options
      );
    } catch {
      const msg =
        directErr instanceof Error ? directErr.message : String(directErr);
      throw new Error(
        `Failed to fetch tileset (${trimmed}). ${msg}`
      );
    }
  }
}

export async function loadVectorOrMeshTileset(
  Cesium: CesiumNS,
  viewer: any,
  url: string,
  opts?: {
    maximumScreenSpaceError?: number;
    stylePreset?: TilesetStylePreset;
  }
): Promise<any> {
  const tileset = await loadTilesetFromUrl(Cesium, url, {
    ...TILESET_LOAD_OPTIONS,
    maximumScreenSpaceError: opts?.maximumScreenSpaceError ?? 16,
  });
  viewer.scene.primitives.add(tileset);
  if (opts?.stylePreset) {
    applyCesium3DTileStyle(Cesium, tileset, opts.stylePreset);
  }
  return tileset;
}

/** Map drape mode → ClassificationType for clampToGround entities. */
export function classificationForDrape(
  Cesium: CesiumNS,
  mode: DrapeMode
): any | undefined {
  if (mode === "none") return undefined;
  if (mode === "terrain") return Cesium.ClassificationType.TERRAIN;
  if (mode === "tiles") return Cesium.ClassificationType.CESIUM_3D_TILE;
  return Cesium.ClassificationType.BOTH;
}

/**
 * Enable Cesium 1.145 vector draping on entities (roads, utilities, custom GeoJSON).
 * clampToGround + classificationType drapes polylines/polygons onto terrain and/or 3D Tiles.
 * Skips extruded building footprints (keeps height/extrudedHeight).
 */
export function applyDrapeToEntities(
  Cesium: CesiumNS,
  entities: any[],
  mode: DrapeMode
) {
  const classification = classificationForDrape(Cesium, mode);
  const clamp = mode !== "none";
  for (const ent of entities) {
    if (!ent) continue;
    if (ent.polyline) {
      ent.polyline.clampToGround = clamp;
      if (classification != null) {
        ent.polyline.classificationType = classification;
      }
    }
    if (ent.polygon) {
      // Don't flatten extruded BIM footprints
      const extruded =
        ent.polygon.extrudedHeight != null ||
        ent.polygon.extrudedHeight?.getValue?.() != null;
      if (extruded) continue;
      if (clamp) {
        ent.polygon.height = undefined;
        ent.polygon.perPositionHeight = undefined;
        ent.polygon.heightReference = Cesium.HeightReference.CLAMP_TO_GROUND;
        if (classification != null) {
          ent.polygon.classificationType = classification;
        }
      }
    }
    if (ent.corridor) {
      ent.corridor.clampToGround = clamp;
      if (classification != null) {
        ent.corridor.classificationType = classification;
      }
    }
  }
}

export type ClipRing = Array<{ lon: number; lat: number; height?: number }>;

export function positionsFromRing(
  Cesium: CesiumNS,
  ring: ClipRing
): any[] {
  return ring.map((p) =>
    Cesium.Cartesian3.fromDegrees(
      p.lon,
      p.lat,
      p.height ?? 0,
      Cesium.Ellipsoid.WGS84
    )
  );
}

/**
 * Build / replace ClippingPolygonCollection (supports holes — Cesium 1.145).
 * IMPORTANT: each target needs its own collection — ClippingPolygonCollection
 * is single-owner; sharing one between globe + tileset corrupts bounding volumes
 * and crashes with `boundingVolume.distanceSquaredTo` undefined.
 */
export function setClippingPolygons(
  Cesium: CesiumNS,
  targets: { tileset?: any | null; globe?: any | null; scene?: any | null },
  opts: {
    outer: ClipRing;
    holes?: ClipRing[];
    enabled?: boolean;
    inverse?: boolean;
  }
): { tileset?: any; globe?: any } | null {
  if (!opts.outer || opts.outer.length < 3) return null;
  if (!Cesium.ClippingPolygon || !Cesium.ClippingPolygonCollection) {
    console.warn("ClippingPolygon APIs missing — need CesiumJS ≥ 1.145");
    return null;
  }
  // Clipping polygons require WebGL2 — skip when unsupported (avoids BV crashes)
  try {
    const scene = targets.scene;
    if (
      scene &&
      typeof Cesium.ClippingPolygonCollection.isSupported === "function" &&
      !Cesium.ClippingPolygonCollection.isSupported(scene)
    ) {
      console.warn("ClippingPolygonCollection not supported in this WebGL context");
      return null;
    }
  } catch {
    /* proceed — isSupported optional */
  }

  // Drop prior collections so owners release GPU/BV state cleanly
  clearClippingPolygons(targets);

  const holes = (opts.holes ?? [])
    .filter((h) => h.length >= 3)
    .map((h) => positionsFromRing(Cesium, h));
  const positions = positionsFromRing(Cesium, opts.outer);

  // Degenerate / coincident verts can yield empty BVs — require a real area
  try {
    const bs = Cesium.BoundingSphere.fromPoints(positions);
    if (!bs || !(bs.radius > 1)) {
      console.warn("Clipping polygon too small / degenerate");
      return null;
    }
  } catch {
    return null;
  }

  const makeCollection = () =>
    new Cesium.ClippingPolygonCollection({
      polygons: [
        new Cesium.ClippingPolygon({
          positions,
          holes,
          ellipsoid: Cesium.Ellipsoid.WGS84,
        }),
      ],
      enabled: opts.enabled !== false,
      inverse: Boolean(opts.inverse),
      ellipsoid: Cesium.Ellipsoid.WGS84,
    });

  const out: { tileset?: any; globe?: any } = {};
  try {
    if (targets.tileset) {
      out.tileset = makeCollection();
      targets.tileset.clippingPolygons = out.tileset;
    }
    if (targets.globe && "clippingPolygons" in targets.globe) {
      out.globe = makeCollection();
      targets.globe.clippingPolygons = out.globe;
    }
  } catch (err) {
    console.warn("setClippingPolygons failed", err);
    clearClippingPolygons(targets);
    return null;
  }
  return out;
}

export function clearClippingPolygons(targets: {
  tileset?: any | null;
  globe?: any | null;
}) {
  const destroy = (owner: any, key: string) => {
    if (!owner) return;
    try {
      const col = owner[key];
      owner[key] = undefined;
      if (col && !col.isDestroyed?.() && typeof col.destroy === "function") {
        col.destroy();
      }
    } catch {
      try {
        owner[key] = undefined;
      } catch {
        /* ignore */
      }
    }
  };
  destroy(targets.tileset, "clippingPolygons");
  destroy(targets.globe, "clippingPolygons");
}

/** Attach safe tileFailed / loadError handlers so one bad tile doesn't freeze the viewer. */
export function attachTilesetErrorHandlers(
  tileset: any,
  onError: (message: string, detail?: string) => void
) {
  if (!tileset) return;
  try {
    tileset.tileFailed?.addEventListener?.((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err ?? "tile failed");
      onError("3D Tiles tile failed to load", msg);
    });
  } catch {
    /* ignore */
  }
}

export type SnapMeasureResult = {
  ok: boolean;
  message: string;
  snapPoint?: { lon: number; lat: number; height: number };
  geometryType?: string;
  detail?: string;
};

/**
 * Experimental BIM/CAD precision snap via Cesium ion (IonSnapService).
 * Requires CESIUM_ION_TOKEN and an ion-backed BIM/CAD asset id.
 */
export async function createIonSnapper(
  Cesium: CesiumNS,
  assetId: number,
  accessToken?: string | null
): Promise<any | null> {
  if (!Cesium.IonSnapService?.fromAssetId) return null;
  if (!Number.isFinite(assetId) || assetId <= 0) return null;
  try {
    if (accessToken) {
      Cesium.Ion.defaultAccessToken = accessToken;
    }
    return await Cesium.IonSnapService.fromAssetId(assetId, {
      accessToken: accessToken || undefined,
    });
  } catch (err) {
    console.warn("IonSnapService init failed", err);
    return null;
  }
}

export async function snapAgainstBim(
  Cesium: CesiumNS,
  viewer: any,
  snapper: any,
  opts: {
    elementId?: string;
    windowPosition: { x: number; y: number };
  }
): Promise<SnapMeasureResult> {
  if (!snapper) {
    return {
      ok: false,
      message:
        "BIM snap needs Cesium ion + a BIM/CAD asset (IonSnapService). Set CESIUM_ION_TOKEN and ion asset id.",
    };
  }

  const canvas = viewer.scene.canvas;
  const scene = viewer.scene;

  // Pick feature for element id when not supplied
  let elementId = opts.elementId;
  const picked = scene.pick(
    new Cesium.Cartesian2(opts.windowPosition.x, opts.windowPosition.y)
  );
  if (!elementId && picked?.getProperty) {
    const id =
      picked.getProperty("id") ??
      picked.getProperty("elementId") ??
      picked.getProperty("featureId");
    if (id != null) elementId = String(id);
  }
  if (!elementId && picked?.content?.batchTable) {
    // Fall back: use feature id from 3D Tiles batch
    try {
      elementId = String(picked.getPropertyIds?.()?.[0] ?? "");
    } catch {
      /* ignore */
    }
  }

  const cartesian = scene.pickPosition(
    new Cesium.Cartesian2(opts.windowPosition.x, opts.windowPosition.y)
  );
  if (!cartesian) {
    return {
      ok: false,
      message: "No surface under cursor for BIM snap",
    };
  }

  if (!elementId) {
    // Without element id, report pick position as approximate snap
    const c = Cesium.Cartographic.fromCartesian(
      cartesian,
      Cesium.Ellipsoid.WGS84
    );
    return {
      ok: true,
      message: "Approximate pick (no BIM element id — ion snap needs feature id)",
      snapPoint: {
        lon: Cesium.Math.toDegrees(c.longitude),
        lat: Cesium.Math.toDegrees(c.latitude),
        height: c.height,
      },
      detail: "Enable ion BIM metadata for millimetre-level IonSnapService",
    };
  }

  try {
    const result = await snapper.snap({
      elementId,
      testPoint: cartesian,
      camera: viewer.camera,
      canvasWidth: canvas.clientWidth,
      canvasHeight: canvas.clientHeight,
    });
    if (!result?.snapPoint) {
      return {
        ok: false,
        message: "Ion snap returned no point for this element",
        detail: `elementId=${elementId}`,
      };
    }
    const c = Cesium.Cartographic.fromCartesian(
      result.snapPoint,
      Cesium.Ellipsoid.WGS84
    );
    return {
      ok: true,
      message: "BIM snap (IonSnapService)",
      geometryType: String(result.geometryType ?? ""),
      snapPoint: {
        lon: Cesium.Math.toDegrees(c.longitude),
        lat: Cesium.Math.toDegrees(c.latitude),
        height: c.height,
      },
      detail: `element ${elementId}${
        result.heat != null ? ` · heat ${result.heat}` : ""
      }`,
    };
  } catch (err) {
    return {
      ok: false,
      message: "IonSnapService request failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Preview entity for clip polygon being drawn */
export function upsertClipPreview(
  Cesium: CesiumNS,
  viewer: any,
  existing: any | null,
  ring: ClipRing,
  holes: ClipRing[]
): any {
  if (existing) {
    viewer.entities.remove(existing);
  }
  if (ring.length < 2) return null;
  const positions = positionsFromRing(Cesium, ring);
  if (ring.length >= 3) {
    return viewer.entities.add({
      id: "twin-clip-preview",
      polygon: {
        hierarchy: {
          positions,
          holes: holes
            .filter((h) => h.length >= 3)
            .map((h) => ({ positions: positionsFromRing(Cesium, h) })),
        },
        material: Cesium.Color.fromCssColorString("#22d3ee").withAlpha(0.22),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString("#67e8f9"),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        classificationType: Cesium.ClassificationType.BOTH,
      },
    });
  }
  return viewer.entities.add({
    id: "twin-clip-preview",
    polyline: {
      positions,
      width: 3,
      material: Cesium.Color.fromCssColorString("#67e8f9"),
      clampToGround: true,
      classificationType: Cesium.ClassificationType.BOTH,
    },
  });
}

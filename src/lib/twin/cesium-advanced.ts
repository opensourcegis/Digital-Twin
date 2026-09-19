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

/**
 * Day/night look for mesh / photogrammetry 3D Tiles.
 * Day: strip ALL style/shader overrides so textures show true color.
 * Night: hard, obvious darken (users must see a brightness change).
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
  } | null
) {
  if (!tileset) return;

  if (mode === "day") {
    try {
      tileset.customShader = undefined;
    } catch {
      /* ignore */
    }
    try {
      // Critical: undefined style = native textured albedo (white style greys some meshes)
      tileset.style = undefined;
    } catch {
      /* ignore */
    }
    // Non-default presets still get their style
    if (stylePreset !== "default") {
      applyCesium3DTileStyle(Cesium, tileset, stylePreset);
    }
    try {
      if (tileset.imageBasedLighting) {
        tileset.imageBasedLighting.imageBasedLightingFactor =
          new Cesium.Cartesian2(1.0, 1.0);
      }
    } catch {
      /* ignore */
    }
    try {
      if ("luminanceAtZenith" in tileset) tileset.luminanceAtZenith = 0.5;
    } catch {
      /* ignore */
    }
    try {
      if ("lightColor" in tileset) {
        tileset.lightColor = new Cesium.Cartesian3(1.5, 1.5, 1.5);
      }
    } catch {
      /* ignore */
    }
    try {
      if (Cesium.Cesium3DTileColorBlendMode) {
        tileset.colorBlendMode = Cesium.Cesium3DTileColorBlendMode.HIGHLIGHT;
        if ("colorBlendAmount" in tileset) tileset.colorBlendAmount = 0.5;
      }
    } catch {
      /* ignore */
    }
    return;
  }

  // —— Night: unmistakable darkening ——
  try {
    tileset.customShader = new Cesium.CustomShader({
      lightingModel: Cesium.LightingModel.UNLIT,
      fragmentShaderText: `
void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
  material.diffuse *= 0.38;
}
`,
    });
  } catch (err) {
    console.warn("Tileset night shader failed", err);
  }

  try {
    if (tileset.imageBasedLighting) {
      tileset.imageBasedLighting.imageBasedLightingFactor =
        new Cesium.Cartesian2(0.05, 0.02);
    }
  } catch {
    /* ignore */
  }
  try {
    if ("luminanceAtZenith" in tileset) tileset.luminanceAtZenith = 0.01;
  } catch {
    /* ignore */
  }
  try {
    if ("lightColor" in tileset) {
      tileset.lightColor = new Cesium.Cartesian3(0.15, 0.18, 0.28);
    }
  } catch {
    /* ignore */
  }
  try {
    if (Cesium.Cesium3DTileColorBlendMode) {
      tileset.colorBlendMode = Cesium.Cesium3DTileColorBlendMode.MIX;
      if ("colorBlendAmount" in tileset) tileset.colorBlendAmount = 0.4;
    }
  } catch {
    /* ignore */
  }
  try {
    if (Cesium.Cesium3DTileStyle) {
      tileset.style = new Cesium.Cesium3DTileStyle({
        color: "color() * vec4(0.4, 0.45, 0.6, 1.0)",
      });
    }
  } catch (err) {
    console.warn("Tileset night style failed", err);
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

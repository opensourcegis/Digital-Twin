import { promises as fs } from "fs";
import path from "path";
import {
  DEFAULT_BRANDING,
  DEFAULT_GIS,
  DEFAULT_INFORMATICS,
  DEFAULT_SHELL,
  DEFAULT_SIMULATION,
  type BrandingSettings,
  type DockModuleConfig,
  type GisAnalysisSettings,
  type InformaticsSettings,
  type PlatformSettings,
  type ShellSettings,
  type SimulationSettings,
} from "./types";

const DATA_PATH = path.join(process.cwd(), "data", "platform-settings.json");

function now() {
  return new Date().toISOString();
}

function mergeModules(
  base: DockModuleConfig[],
  patch?: DockModuleConfig[]
): DockModuleConfig[] {
  if (!patch?.length) return base.map((m) => ({ ...m }));
  const byId = new Map(patch.map((m) => [m.id, m]));
  return base.map((m) => {
    const p = byId.get(m.id);
    return p ? { ...m, ...p, id: m.id } : { ...m };
  });
}

function seed(): PlatformSettings {
  return {
    branding: { ...DEFAULT_BRANDING },
    shell: {
      ...DEFAULT_SHELL,
      modules: DEFAULT_SHELL.modules.map((m) => ({ ...m })),
    },
    simulation: {
      ...DEFAULT_SIMULATION,
      spawn: { ...DEFAULT_SIMULATION.spawn },
      bounds: { ...DEFAULT_SIMULATION.bounds },
      cameraHome: { ...DEFAULT_SIMULATION.cameraHome },
    },
    informatics: { ...DEFAULT_INFORMATICS },
    gis: { ...DEFAULT_GIS, enabledTools: [...DEFAULT_GIS.enabledTools] },
    updatedAt: now(),
  };
}

function mergeSim(
  base: SimulationSettings,
  patch?: Partial<SimulationSettings>
): SimulationSettings {
  if (!patch) return base;
  return {
    ...base,
    ...patch,
    spawn: { ...base.spawn, ...(patch.spawn ?? {}) },
    bounds: { ...base.bounds, ...(patch.bounds ?? {}) },
    cameraHome: { ...base.cameraHome, ...(patch.cameraHome ?? {}) },
  };
}

let cache: PlatformSettings | null = null;

async function readFile(): Promise<PlatformSettings> {
  try {
    const raw = await fs.readFile(DATA_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<PlatformSettings>;
    const defaults = seed();
    return {
      branding: { ...defaults.branding, ...(parsed.branding ?? {}) },
      shell: {
        ...defaults.shell,
        ...(parsed.shell ?? {}),
        modules: mergeModules(defaults.shell.modules, parsed.shell?.modules),
      },
      simulation: mergeSim(defaults.simulation, parsed.simulation),
      informatics: { ...defaults.informatics, ...(parsed.informatics ?? {}) },
      gis: {
        ...defaults.gis,
        ...(parsed.gis ?? {}),
        enabledTools: parsed.gis?.enabledTools ?? defaults.gis.enabledTools,
      },
      updatedAt:
        typeof parsed.updatedAt === "string" ? parsed.updatedAt : now(),
    };
  } catch {
    const initial = seed();
    await writeFile(initial);
    return initial;
  }
}

async function writeFile(settings: PlatformSettings) {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(settings, null, 2), "utf8");
}

export async function getPlatformSettings(): Promise<PlatformSettings> {
  if (!cache) cache = await readFile();
  return cache;
}

export async function updatePlatformSettings(patch: {
  branding?: Partial<BrandingSettings>;
  shell?: Partial<ShellSettings> & { modules?: DockModuleConfig[] };
  simulation?: Partial<SimulationSettings>;
  informatics?: Partial<InformaticsSettings>;
  gis?: Partial<GisAnalysisSettings>;
}): Promise<PlatformSettings> {
  const current = await getPlatformSettings();
  const next: PlatformSettings = {
    branding: { ...current.branding, ...(patch.branding ?? {}) },
    shell: {
      ...current.shell,
      ...(patch.shell ?? {}),
      modules: mergeModules(current.shell.modules, patch.shell?.modules),
    },
    simulation: mergeSim(current.simulation, patch.simulation),
    informatics: { ...current.informatics, ...(patch.informatics ?? {}) },
    gis: {
      ...current.gis,
      ...(patch.gis ?? {}),
      enabledTools: patch.gis?.enabledTools ?? current.gis.enabledTools,
    },
    updatedAt: now(),
  };
  await writeFile(next);
  cache = next;
  return next;
}

/** Clear cache so next read picks up disk (tests / hot reload). */
export function invalidatePlatformSettingsCache() {
  cache = null;
}

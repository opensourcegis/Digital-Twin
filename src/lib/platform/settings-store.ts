import { promises as fs } from "fs";
import path from "path";
import {
  DEFAULT_GIS,
  DEFAULT_INFORMATICS,
  DEFAULT_SIMULATION,
  type GisAnalysisSettings,
  type InformaticsSettings,
  type PlatformSettings,
  type SimulationSettings,
} from "./types";

const DATA_PATH = path.join(process.cwd(), "data", "platform-settings.json");

function now() {
  return new Date().toISOString();
}

function seed(): PlatformSettings {
  return {
    simulation: { ...DEFAULT_SIMULATION, spawn: { ...DEFAULT_SIMULATION.spawn }, bounds: { ...DEFAULT_SIMULATION.bounds } },
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
  };
}

let cache: PlatformSettings | null = null;

async function readFile(): Promise<PlatformSettings> {
  try {
    const raw = await fs.readFile(DATA_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<PlatformSettings>;
    const defaults = seed();
    return {
      simulation: mergeSim(defaults.simulation, parsed.simulation),
      informatics: { ...defaults.informatics, ...(parsed.informatics ?? {}) },
      gis: {
        ...defaults.gis,
        ...(parsed.gis ?? {}),
        enabledTools:
          parsed.gis?.enabledTools ?? defaults.gis.enabledTools,
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
  simulation?: Partial<SimulationSettings>;
  informatics?: Partial<InformaticsSettings>;
  gis?: Partial<GisAnalysisSettings>;
}): Promise<PlatformSettings> {
  const current = await getPlatformSettings();
  const next: PlatformSettings = {
    simulation: mergeSim(current.simulation, patch.simulation),
    informatics: { ...current.informatics, ...(patch.informatics ?? {}) },
    gis: {
      ...current.gis,
      ...(patch.gis ?? {}),
      enabledTools:
        patch.gis?.enabledTools ?? current.gis.enabledTools,
    },
    updatedAt: now(),
  };
  await writeFile(next);
  cache = next;
  return next;
}

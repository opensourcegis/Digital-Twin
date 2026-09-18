import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cesiumPkg = dirname(require.resolve("cesium/package.json"));
const source = join(cesiumPkg, "Build", "Cesium");
const dest = join(root, "public", "cesium");

if (!existsSync(source)) {
  console.error("Cesium build assets not found at", source);
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dirname(dest), { recursive: true });
cpSync(source, dest, { recursive: true });
console.log("Copied Cesium static assets to public/cesium");

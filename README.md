# TwinBench — Digital Twin Workbench

Self-hosted Cesium digital twin platform: visualize 3D Tiles / campus meshes, run lightweight analysis, place electric lighting poles, switch day/night lighting, and simulate a ground robot — no cloud lock-in.

Inspired by concepts from [GeoSolutions digital-twin-toolbox](https://github.com/geosolutions-it/digital-twin-toolbox) (tile layers / twin workflows). This app is a separate MIT-friendly product focused on the **viewer + analysis + simulation** slice, not the GPL tile-generation pipeline.

## Quick start (local)

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43145](http://127.0.0.1:43145).

The demo **Campus Twin** loads without Cesium ion credentials (OSM basemap + extruded GeoJSON buildings, roads, POIs, seeded poles, robot path).

## Controls

| Control | Where | What it does |
| --- | --- | --- |
| **Day / Night** | Top-right toggle | Switches Cesium clock/sun, sky atmosphere, fog, and ambient lighting |
| **Pole lights** | Top-right switch | Turns emissive lamp heads (+ point lights when available) on/off — clearest in Night |
| **Place pole** | Tools | Click the scene to plant an electric pole |
| **Draw poles** | Tools | Click a polyline, **double-click** to finish — poles spawn along the line |
| **Undo / Clear** | Tools | Undo last pole edit, or clear all poles |
| Distance / Area / Height / Identify / Viewshed | Tools | Analysis clicks on the twin |
| Layers | Right panel | Toggle buildings, roads, POIs, poles, robot, external tiles |
| Robot | Right panel | Play / pause / reset ATLAS-01 along the demo patrol |
| Tiles | Right panel | Paste a `tileset.json` URL |
| **Sandcastle test** | Tiles panel → **Load sample tiles** | Loads the vendored Cesium Sample 3D Tileset (`/demo/sandcastle-tileset/`) — no ion token. Use **Campus** to return to the demo twin |

## Sandcastle test scene

The share-link `#c=` hash from Cesium Sandcastle could not be decoded (deflate stream invalid even in Sandcastle itself). TwinBench therefore ships the **official Cesium Sample Tileset** used by Sandcastle gallery demos:

- Path: `public/demo/sandcastle-tileset/tileset.json`
- UI: **Tiles → Load sample tiles**
- No `CESIUM_ION_TOKEN` required for this preset
- For ion/photogrammetry scenes: set `CESIUM_ION_TOKEN` + `CESIUM_ION_ASSET_ID`, or paste a tileset URL

## Cesium ion & real 3D Tiles

Copy `.env.example` to `.env.local` (or set Compose env):

```bash
CESIUM_ION_TOKEN=your_token_here
CESIUM_ION_ASSET_ID=2275207
# optional direct tileset (overrides ion when pasted in UI too)
DEFAULT_TILESET_URL=https://example.com/path/tileset.json
```

Restart the app. Token status appears under **Tiles**. You can also paste any reachable `tileset.json` URL in the UI without rebuilding.

## Docker (private server)

```bash
docker compose up --build
```

App: [http://127.0.0.1:43145](http://127.0.0.1:43145).

Optional: put tiles under `./data/tiles` (mounted read-only) and reference them as `/tiles/.../tileset.json` once you add a static file server or Next rewrite — for MVP, prefer a full URL or ion asset.

## Stack

- Next.js + TypeScript + Tailwind + shadcn-style primitives
- CesiumJS globe / 3D Tiles
- Docker Compose for private deploy

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Dev server on port **43145** (copies Cesium assets first) |
| `npm run build` / `npm start` | Production build / serve |
| `npm run copy-cesium` | Refresh `public/cesium` from `node_modules` |

## License note

This repository does **not** vendor the GeoSolutions toolbox (GPL-3.0). Point TwinBench at tiles you generate elsewhere if you use that pipeline.

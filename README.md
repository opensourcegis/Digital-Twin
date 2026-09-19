# TwinBench — Digital Twin Workbench

Self-hosted Cesium digital twin platform with georeferenced campus model, live IoT telemetry, CMMS/BMS integration, time-series history, threshold alerts, and a **3D robot walkthrough** tied to operational data — no cloud lock-in.

**Upstream:** [opensourcegis/Digital-Twin](https://github.com/opensourcegis/Digital-Twin) · **Origin workspace:** `anbumanib/genesis`

Inspired by concepts from [GeoSolutions digital-twin-toolbox](https://github.com/geosolutions-it/digital-twin-toolbox) (tile layers / twin workflows). This app is a separate MIT-friendly product focused on the **viewer + analysis + simulation + operations** slice, not the GPL tile-generation pipeline.

## Platform pillars

| Pillar | What TwinBench ships |
| --- | --- |
| **Geometric & spatial baseline** | EPSG:4326 campus with extruded buildings, roads, terrain DTM, subsurface utilities; asset registry with GUIDs on buildings, equipment, pipes, sensors |
| **Sensor & IoT telemetry** | 7 edge sensors (temp, vibration, pressure, energy, flow, occupancy, water level) via mock MQTT/CoAP/WebSocket/REST; SSE stream at `/api/twin/stream` |
| **Enterprise integration** | Mock CMMS work orders, BACnet/Modbus BMS points, document registry (specs, O&M, warranties) linked to 3D entities |
| **Data processing & storage** | In-process time-series ring buffer (24h @ 5min); noise/interpolation/drift/timeout quality flags; Brick/RealEstateCore/DTDL semantic relations |
| **Visualization & COP** | Color-coded 3D symbology, live gauges, spatial alerts, 24h time slider, first/third-person walkthrough following ATLAS-01 |

## Quick start (local)

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43145](http://127.0.0.1:43145).

The demo **Campus Twin** loads without Cesium ion credentials (OSM basemap + extruded GeoJSON buildings, roads, POIs, utilities, sensors, seeded poles, robot path).

## 3D walkthrough & robot patrol

1. Open the **Robot** panel → choose **3rd person** or **1st person** walkthrough mode.
2. Press **Play** — ATLAS-01 patrols the georeferenced path; the camera follows the robot.
3. Open the **COP** panel to watch live sensor gauges and alerts; buildings/sensors change color when thresholds are exceeded.
4. Scrub the **time slider** in the footer to replay the last 24 hours of telemetry (click **Go live** to return).
5. Use **Identify** tool and click a building or sensor to open the asset drawer with CMMS work orders and documents.

Robot patrol is tied to telemetry: speed reduces near critical alerts; battery drains while investigating.

## Layer admin dashboard

Manage spatial layers (terrain, buildings, utilities, sensors, robot routes, alert symbology, custom vectors) with full CRUD:

1. Open [http://127.0.0.1:43145/admin/login](http://127.0.0.1:43145/admin/login)
2. Sign in with password **`twinbench`** (override via `ADMIN_PASSWORD` env)
3. Create, edit, delete, reorder layers; set opacity, z-order, styling, GUID bindings, coordinate system
4. Changes persist to **`data/layers.json`**
5. Main viewer auto-refreshes layer catalog every 8s; use **Preview globe** for immediate check

Layer types supported: terrain DTM/DEM, 3D tiles, buildings/BIM, subsurface utilities, roads, IoT sensors, robot patrol, alert symbology, custom vector.

## Controls

| Control | Where | What it does |
| --- | --- | --- |
| **Day / Night** | Top-right toggle | Switches Cesium clock/sun, sky atmosphere, fog, and ambient lighting |
| **Pole lights** | Top-right switch | Turns emissive lamp heads (+ point lights when available) on/off — clearest in Night |
| **Place pole** | Tools | Click the scene to plant an electric pole |
| **Draw poles** | Tools | Click a polyline, **double-click** to finish — poles spawn along the line |
| **Undo / Clear** | Tools | Undo last pole edit, or clear all poles |
| Distance / Area / Height / Identify / Viewshed | Tools | Analysis clicks on the twin |
| Layers | Right panel | Toggle buildings, roads, POIs, utilities, sensors, terrain, poles, robot, external tiles |
| COP | Right panel | Live telemetry gauges, BMS points, threshold alerts |
| Robot / Walkthrough | Right panel | Play patrol, 1st/3rd person camera follow |
| Time slider | Footer | Scrub 24h history or return to live SSE stream |
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

## Optional Postgres (local machine)

Persistence is optional. Leave `DATABASE_URL` unset to run fully in memory.

If you already run Postgres locally (PostGIS recommended; Timescale optional):

```bash
export DATABASE_URL=postgres://USER:PASS@127.0.0.1:5432/twinbench
npm run db:migrate   # schema + demo seed
npm run dev
```

Check status: `GET /api/db/status`.

## API (mock backends)

| Route | Purpose |
| --- | --- |
| `GET /api/twin/state` | Snapshot: readings, alerts, BMS, symbology, robot status |
| `GET /api/twin/stream` | SSE live telemetry feed |
| `GET /api/assets/[guid]` | Asset + CMMS + docs + semantic relations |
| `GET /api/cmms/work-orders` | Work orders (filter `?assetGuid=`) |
| `GET /api/bms` | BACnet/Modbus-style points |
| `GET /api/alerts` | Active threshold alerts |
| `GET /api/timeseries?sensorGuid=` | Historical points for charts/slider |
| `GET /api/layers` | Public layer catalog (sorted by z-order) |
| `PATCH /api/layers/[id]` | Toggle visibility from viewer panel |
| `POST /api/admin/session` | Admin login (sets session cookie) |
| `GET/POST/PATCH /api/admin/layers` | Full layer CRUD + reorder (auth required) |

## Stack

- Next.js + TypeScript + Tailwind + shadcn-style primitives
- CesiumJS globe / 3D Tiles
- Optional local Postgres / PostGIS / Timescale via `DATABASE_URL`

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Dev server on port **43145** (copies Cesium assets first) |
| `npm run build` / `npm start` | Production build / serve |
| `npm run copy-cesium` | Refresh `public/cesium` from `node_modules` |
| `npm run db:migrate` | Apply schema + seed (requires `DATABASE_URL`) |

## License note

This repository does **not** vendor the GeoSolutions toolbox (GPL-3.0). Point TwinBench at tiles you generate elsewhere if you use that pipeline.

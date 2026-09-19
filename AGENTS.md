<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

### Product & services

TwinBench is a single Next.js 16 app (CesiumJS viewer + demo campus twin). No database is required for local development — the twin runs in memory when `DATABASE_URL` is unset. Run Postgres yourself if you want persistence.

| Service | Command | Port |
| --- | --- | --- |
| Dev server | `npm run dev` | **43145** |
| Production (after build) | `node .next/standalone/server.js` | **43145** (set `PORT` / `HOSTNAME`) |
| Postgres / PostGIS / Timescale (optional, external) | your local install + `DATABASE_URL=… npm run db:migrate` | **5432** |

`npm run dev` runs `scripts/copy-cesium.mjs` first (copies Cesium assets to `public/cesium`). Demo campus works without `CESIUM_ION_TOKEN`.

**Branch note:** `main` may be empty; application code lives on `cursor/digital-twin-mvp-49ad` (or branches based on it).

### Persistent twin (Phases 1–5)

Optional Postgres enables durable assets, sensor readings (Timescale hypertable when available), alerts, events, MQTT/SensorThings gateway config, IFC GUID mapping, scenarios, and analytics findings.

Point `DATABASE_URL` at a Postgres you already run (PostGIS recommended; Timescale optional). Then:

```bash
export DATABASE_URL=postgres://USER:PASS@127.0.0.1:5432/twinbench
npm run db:migrate
```

Without `DATABASE_URL`, APIs still work in memory (simulator + in-process scenario/analytics). Plain Postgres works; PostGIS/Timescale are optional — migration falls back when extensions are missing.

| Phase | API |
| --- | --- |
| 1 Persist | `GET /api/db/status` |
| 2 Gateway | `GET/POST /api/gateway`, `POST /api/gateway/sensorthings` |
| 3 BIM | `GET /api/bim/hierarchy`, `GET/POST /api/bim/ifc` |
| 4 Scenario | `GET/POST /api/scenarios`, `…/[id]/simulate`, `…/[id]/compare` |
| 5 Analytics | `GET/POST /api/analytics` |

Env: `DATABASE_URL`, `MQTT_URL`, `SENSOR_THINGS_URL`, `GATEWAY_MODE` (`simulator` \| `mqtt` \| `sensorthings`).

### Lint

`npm run lint` (`next lint`) is removed in Next.js 16. The repo still has a legacy `eslint.config.mjs` (FlatCompat) that fails with `eslint-config-next` v16. Use `npm run build` for type-check validation until lint config is migrated to the flat `defineConfig` pattern in `node_modules/next/dist/docs/01-app/03-api-reference/05-config/03-eslint.md`.

### Browser / WebGL in Cloud VMs

Cesium requires WebGL. Cloud Agent VMs have no GPU; the **computerUse** subagent and default headless Chrome will show **"Opening twin…"** forever or log `WebGL initialization failed`.

For automated or headed browser tests, launch Chrome with software WebGL:

```bash
google-chrome --no-sandbox --use-angle=swiftshader-webgl --enable-unsafe-swiftshader --ignore-gpu-blocklist http://127.0.0.1:43145/
```

With those flags, the status bar should reach **"Campus twin ready"** and the `.cesium-viewer` canvas renders.

`next.config.ts` sets `allowedDevOrigins: ['127.0.0.1', 'localhost']` so dev HMR works when Chrome uses `127.0.0.1` instead of `localhost`. Restart `npm run dev` after changing config.

If the UI shows **"Opening twin…"** indefinitely, the usual cause is missing WebGL (not a broken `next/dynamic` import). Confirm with production build + SwiftShader flags above; status should read **Campus twin ready**.

### Hello-world verification (no browser)

```bash
npm ci
npm run build
curl -sf http://127.0.0.1:43145/api/config   # after starting dev or prod server
curl -sf http://127.0.0.1:43145/api/db/status
```

Expected config JSON includes `"basemap":"osm"` and `"demoScene":"campus"`. DB status reports memory fallback when `DATABASE_URL` is unset.

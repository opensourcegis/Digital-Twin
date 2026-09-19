#!/usr/bin/env tsx
/**
 * Apply Phase 1 SQL migration + seed demo twin into Postgres/Timescale.
 * Usage: DATABASE_URL=postgres://twin:twin@127.0.0.1:5432/twinbench npx tsx db/migrate.ts
 */
import fs from "fs/promises";
import path from "path";
import postgres from "postgres";

const url =
  process.env.DATABASE_URL ||
  "postgres://twin:twin@127.0.0.1:5432/twinbench";

async function main() {
  const sql = postgres(url, { max: 1 });
  const migration = await fs.readFile(
    path.join(process.cwd(), "src/db/migrations/0001_phase1_persistent_twin.sql"),
    "utf8"
  );
  console.log("Applying migration…");
  await sql.unsafe(migration);
  console.log("Seeding…");
  await seed(sql);
  await sql.end();
  console.log("Done.");
}

async function readDemo<T>(file: string): Promise<T> {
  const raw = await fs.readFile(
    path.join(process.cwd(), "public/demo", file),
    "utf8"
  );
  return JSON.parse(raw) as T;
}

async function seed(sql: postgres.Sql) {
  const registry = await readDemo<{
    assets: Array<Record<string, unknown>>;
    site?: { guid?: string; name?: string };
  }>("asset-registry.json");
  const semantic = await readDemo<{
    relations: Array<{
      subjectGuid: string;
      predicate: string;
      objectGuid: string;
      ontology: string;
    }>;
  }>("semantic-model.json");
  const sensors = await readDemo<{
    sensors: Array<Record<string, unknown>>;
  }>("sensors.json");
  const cmms = await readDemo<{
    workOrders: Array<Record<string, unknown>>;
  }>("cmms-work-orders.json");
  const bms = await readDemo<{ points: Array<Record<string, unknown>> }>(
    "bms-points.json"
  );
  const docs = await readDemo<{ documents: Array<Record<string, unknown>> }>(
    "documents.json"
  );

  if (registry.site?.guid) {
    await sql`
      INSERT INTO sites (guid, name, metadata)
      VALUES (${registry.site.guid}, ${registry.site.name ?? "Site"}, ${sql.json({})})
      ON CONFLICT (guid) DO UPDATE SET name = EXCLUDED.name
    `;
  }

  for (const a of registry.assets) {
    await sql`
      INSERT INTO assets (
        guid, name, type, parent_guid, building_code, lon, lat, height,
        coordinate_system, dimensions, metadata
      ) VALUES (
        ${a.guid as string},
        ${a.name as string},
        ${a.type as string},
        ${(a.parentGuid as string) ?? null},
        ${(a.buildingCode as string) ?? null},
        ${(a.lon as number) ?? null},
        ${(a.lat as number) ?? null},
        ${(a.height as number) ?? null},
        ${(a.coordinateSystem as string) ?? "EPSG:4326"},
        ${sql.json((a.dimensions as object) ?? null)},
        ${sql.json((a.metadata as object) ?? {})}
      )
      ON CONFLICT (guid) DO UPDATE SET
        name = EXCLUDED.name,
        type = EXCLUDED.type,
        parent_guid = EXCLUDED.parent_guid,
        lon = EXCLUDED.lon,
        lat = EXCLUDED.lat,
        height = EXCLUDED.height,
        metadata = EXCLUDED.metadata,
        updated_at = now()
    `;
  }

  await sql`DELETE FROM semantic_relations`;
  for (const r of semantic.relations) {
    await sql`
      INSERT INTO semantic_relations (subject_guid, predicate, object_guid, ontology)
      VALUES (${r.subjectGuid}, ${r.predicate}, ${r.objectGuid}, ${r.ontology})
    `;
  }

  for (const s of sensors.sensors) {
    const thr = s.thresholds as object;
    await sql`
      INSERT INTO sensors (
        guid, asset_guid, name, metric, unit, protocol, topic, thresholds,
        lon, lat, height, source_mode
      ) VALUES (
        ${s.guid as string},
        ${s.assetGuid as string},
        ${s.name as string},
        ${s.metric as string},
        ${s.unit as string},
        ${s.protocol as string},
        ${(s.topic as string) ?? null},
        ${sql.json(thr)},
        ${s.lon as number},
        ${s.lat as number},
        ${(s.height as number) ?? 0},
        'simulator'
      )
      ON CONFLICT (guid) DO UPDATE SET
        thresholds = EXCLUDED.thresholds,
        topic = EXCLUDED.topic,
        name = EXCLUDED.name
    `;
  }

  for (const p of bms.points) {
    await sql`
      INSERT INTO bms_points (guid, asset_guid, system, name, value, unit, protocol, writable)
      VALUES (
        ${p.guid as string},
        ${p.assetGuid as string},
        ${p.system as string},
        ${p.name as string},
        ${sql.json(p.value as never)},
        ${(p.unit as string) ?? null},
        ${p.protocol as string},
        ${(p.writable as boolean) ?? false}
      )
      ON CONFLICT (guid) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    `;
  }

  for (const w of cmms.workOrders) {
    await sql`
      INSERT INTO work_orders (
        id, asset_guid, title, description, status, priority, type,
        asset_age_years, created_at, due_date
      ) VALUES (
        ${w.id as string},
        ${w.assetGuid as string},
        ${w.title as string},
        ${w.description as string},
        ${w.status as string},
        ${w.priority as string},
        ${w.type as string},
        ${(w.assetAgeYears as number) ?? null},
        ${(w.createdAt as string)}::timestamptz,
        ${(w.dueDate as string)}::timestamptz
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }

  for (const d of docs.documents) {
    await sql`
      INSERT INTO documents (id, asset_guid, title, type, summary, url)
      VALUES (
        ${d.id as string},
        ${d.assetGuid as string},
        ${d.title as string},
        ${d.type as string},
        ${d.summary as string},
        ${d.url as string}
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }

  await sql`
    INSERT INTO twin_events (kind, payload)
    VALUES ('seed.complete', ${sql.json({ assets: registry.assets.length, sensors: sensors.sensors.length })})
  `;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

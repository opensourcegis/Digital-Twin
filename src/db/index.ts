import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type TwinDb = ReturnType<typeof createDb>;

let client: ReturnType<typeof postgres> | null = null;
let db: TwinDb | null = null;

export function getDatabaseUrl(): string | null {
  return (
    process.env.DATABASE_URL ||
    process.env.NETLIFY_DATABASE_URL ||
    process.env.NETLIFY_DB_URL ||
    null
  );
}

export function isDatabaseConfigured(): boolean {
  return Boolean(getDatabaseUrl());
}

function createDb(url: string) {
  client = postgres(url, { max: 8, prepare: false });
  return drizzle(client, { schema });
}

/** Lazy singleton. Returns null when no DATABASE_URL (memory twin fallback). */
export function getDb(): TwinDb | null {
  const url = getDatabaseUrl();
  if (!url) return null;
  if (!db) db = createDb(url);
  return db;
}

export async function closeDb() {
  if (client) {
    await client.end({ timeout: 5 });
    client = null;
    db = null;
  }
}

export { schema };

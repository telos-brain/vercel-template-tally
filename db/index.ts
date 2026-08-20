import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

config({ path: ".env" }); // or .env.local

if (!process.env.POSTGRES_URL) {
  throw new Error("POSTGRES_URL environment variable is not set");
}

const client = postgres(process.env.POSTGRES_URL);
export const db = drizzle({ client });

/**
 * Sets `app.org_id` for the duration of a transaction so RLS policies can
 * scope rows. Callers that have not switched to this helper still work:
 * policies allow access when the setting is unset (TS622S fallback).
 */
export const withOrgContext = async <T>(
  organisationId: string,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>
): Promise<T> => {
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT set_config('app.org_id', ${organisationId}, true)`);
    return fn(tx);
  });
};

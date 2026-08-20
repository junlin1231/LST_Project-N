import "server-only"

import fs from "node:fs/promises"
import path from "node:path"
import { Pool, type PoolClient, type QueryResultRow } from "pg"
import { getServerEnv } from "./env"

let pool: Pool | null = null
let initialized = false

export type DbExecutor = Pool | PoolClient

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: getServerEnv().databaseUrl,
    })
  }
  return pool
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) {
  return getPool().query<T>(text, values)
}

export async function transaction<T>(callback: (client: PoolClient) => Promise<T>) {
  const client = await getPool().connect()
  try {
    await client.query("BEGIN")
    const result = await callback(client)
    await client.query("COMMIT")
    return result
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

export async function runMigrations() {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  const migrationsDir = path.join(process.cwd(), "db", "migrations")
  const files = (await fs.readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b))

  for (const file of files) {
    const id = file.replace(/\.sql$/, "")
    const applied = await query("SELECT id FROM schema_migrations WHERE id = $1", [id])
    if (applied.rowCount) continue

    const sql = await fs.readFile(path.join(migrationsDir, file), "utf8")
    await transaction(async (client) => {
      await client.query(sql)
      await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [id])
    })
  }
}

export async function ensureDatabaseReady() {
  const env = getServerEnv()
  if (initialized && !(env.autoMigrate && process.env.NODE_ENV === "development")) return
  if (env.autoMigrate) {
    await runMigrations()
  }
  initialized = true
}

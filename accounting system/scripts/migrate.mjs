import fs from "node:fs/promises"
import path from "node:path"
import pg from "pg"

const { Pool } = pg

async function databaseUrlFromEnvFile() {
  try {
    const content = await fs.readFile(path.join(process.cwd(), ".env"), "utf8")
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const separator = trimmed.indexOf("=")
      if (separator <= 0 || trimmed.slice(0, separator).trim() !== "DATABASE_URL") continue
      return trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "")
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error
  }
  return undefined
}

const databaseUrl = process.env.DATABASE_URL ?? await databaseUrlFromEnvFile()

if (!databaseUrl) {
  console.error("DATABASE_URL is required.")
  process.exit(1)
}

const pool = new Pool({ connectionString: databaseUrl })

async function query(text, values) {
  return pool.query(text, values)
}

async function transaction(callback) {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    await callback(client)
    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

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
  if (applied.rowCount) {
    console.log(`Skipping ${id}`)
    continue
  }

  const sql = await fs.readFile(path.join(migrationsDir, file), "utf8")
  await transaction(async (client) => {
    await client.query(sql)
    await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [id])
  })
  console.log(`Applied ${id}`)
}

await pool.end()

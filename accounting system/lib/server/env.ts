import "server-only"

export interface ServerEnv {
  databaseUrl: string
  autoMigrate: boolean
}

export function getServerEnv(): ServerEnv {
  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for database-backed accounting operations.")
  }

  try {
    const parsed = new URL(databaseUrl)
    if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
      throw new Error("DATABASE_URL must use postgresql:// or postgres://.")
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("DATABASE_URL must")) {
      throw error
    }
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.")
  }

  return {
    databaseUrl,
    autoMigrate: process.env.AUTO_MIGRATE === "1",
  }
}

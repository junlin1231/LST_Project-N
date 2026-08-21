import "server-only"

export interface ServerEnv {
  databaseUrl: string
  autoMigrate: boolean
  aiBaseUrl?: string
  aiApiKey?: string
  aiModel: string
  aiProvider: string
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

  const aiBaseUrl = process.env.URL || process.env.AI_BASE_URL
  if (aiBaseUrl) {
    try {
      new URL(aiBaseUrl)
    } catch {
      throw new Error("URL/AI_BASE_URL must be a valid URL when configured.")
    }
  }

  return {
    databaseUrl,
    autoMigrate: process.env.AUTO_MIGRATE === "1",
    aiBaseUrl,
    aiApiKey: process.env.BEARER_TOKEN || process.env.AI_API_KEY,
    aiModel: process.env.LLM_MODEL || process.env.LLM_GEMMA4_MODEL || process.env.AI_MODEL || "gemma-4",
    aiProvider: process.env.LLM_PROVIDER || "openai",
  }
}

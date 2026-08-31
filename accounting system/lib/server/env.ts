import "server-only"

import fs from "node:fs"
import path from "node:path"

export interface ServerEnv {
  databaseUrl: string
  autoMigrate: boolean
  aiBaseUrl?: string
  aiApiKey?: string
  aiModel: string
  aiProvider: string
}

function localEnvPaths() {
  const cwd = process.cwd()
  return Array.from(new Set([
    path.join(cwd, ".env.local"),
    path.join(cwd, "accounting system", ".env.local"),
    path.join(cwd, "..", ".env.local"),
    path.join(cwd, "..", "accounting system", ".env.local"),
  ]))
}

export function getServerEnvDiagnostics() {
  const localEnv = readLocalEnvFile()
  const aiBaseUrl = envValue(localEnv, "URL", "AI_BASE_URL")
  const aiApiKey = envValue(localEnv, "BEARER_TOKEN", "AI_API_KEY")
  return {
    cwd: process.cwd(),
    checkedEnvPaths: localEnvPaths(),
    localEnvKeys: Object.keys(localEnv).sort(),
    hasDatabaseUrl: !!envValue(localEnv, "DATABASE_URL"),
    hasAiBaseUrl: !!aiBaseUrl,
    aiBaseUrl,
    hasAiApiKey: !!aiApiKey,
    aiModel: envValue(localEnv, "LLM_MODEL", "LLM_GEMMA4_MODEL", "AI_MODEL") ?? "gemma-4",
    aiProvider: (envValue(localEnv, "LLM_PROVIDER") ?? "openai").toLowerCase(),
  }
}

function readLocalEnvFile() {
  const envPath = localEnvPaths().find((candidate) => fs.existsSync(candidate))
  if (!envPath) return {}
  const content = fs.readFileSync(envPath, "utf8")
  const values: Record<string, string> = {}
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const separator = trimmed.indexOf("=")
    if (separator <= 0) continue
    const key = trimmed.slice(0, separator).trim()
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "")
    values[key] = value
  }
  return values
}

function envValue(values: Record<string, string>, ...names: string[]) {
  for (const name of names) {
    const value = process.env[name] ?? values[name]
    if (value && value.trim()) return value.trim()
  }
  return undefined
}

export function getServerEnv(): ServerEnv {
  const localEnv = readLocalEnvFile()
  const databaseUrl = envValue(localEnv, "DATABASE_URL")

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

  const aiBaseUrl = envValue(localEnv, "URL", "AI_BASE_URL")
  if (aiBaseUrl) {
    try {
      new URL(aiBaseUrl)
    } catch {
      throw new Error("URL/AI_BASE_URL must be a valid URL when configured.")
    }
  }

  return {
    databaseUrl,
    autoMigrate: envValue(localEnv, "AUTO_MIGRATE") === "1",
    aiBaseUrl,
    aiApiKey: envValue(localEnv, "BEARER_TOKEN", "AI_API_KEY"),
    aiModel: envValue(localEnv, "LLM_MODEL", "LLM_GEMMA4_MODEL", "AI_MODEL") ?? "gemma-4",
    aiProvider: (envValue(localEnv, "LLM_PROVIDER") ?? "openai").toLowerCase(),
  }
}

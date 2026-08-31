import "server-only"

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_RETRY_COUNT = 0

class AiHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    const detail = body.trim() ? `: ${body.slice(0, 300)}` : ""
    super(`HTTP ${status}${detail}`)
  }
}

export function chatCompletionsUrl(baseUrl: string) {
  const normalized = baseUrl.trim().replace(/\/+$/, "")
  return new URL(normalized.endsWith("/chat/completions") ? normalized : `${normalized}/chat/completions`)
}

export async function fetchAiJson(endpoint: URL, init: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS, options: { retries?: number } = {}) {
  const retries = Math.max(0, options.retries ?? DEFAULT_RETRY_COUNT)
  let lastError: unknown

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(endpoint, { ...init, signal: controller.signal })
      const text = await response.text()
      if (!response.ok) {
        throw new AiHttpError(response.status, text)
      }
      return text ? JSON.parse(text) : {}
    } catch (error) {
      lastError = error
      if (attempt < retries && shouldRetryAiRequest(error)) {
        await wait(750 * (attempt + 1))
        continue
      }
      throw new Error(describeAiError(endpoint, error, timeoutMs, attempt))
    } finally {
      clearTimeout(timeout)
    }
  }

  throw new Error(describeAiError(endpoint, lastError, timeoutMs, retries))
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function shouldRetryAiRequest(error: unknown) {
  if (error instanceof AiHttpError) return [408, 429, 500, 502, 503, 504].includes(error.status)
  if (error instanceof Error && error.name === "AbortError") return false
  const code = errorCode(error)
  return ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN"].includes(code)
}

function errorCode(error: unknown) {
  const cause = error && typeof error === "object" && "cause" in error ? (error as { cause?: unknown }).cause : undefined
  if (cause && typeof cause === "object" && "code" in cause) return String((cause as { code?: unknown }).code ?? "")
  if (error && typeof error === "object" && "code" in error) return String((error as { code?: unknown }).code ?? "")
  return ""
}

function describeAiError(endpoint: URL, error: unknown, timeoutMs: number, attempts: number) {
  const suffix = attempts > 0 ? ` after ${attempts + 1} attempts` : ""
  if (error instanceof AiHttpError) {
    return `${endpoint.href} returned ${error.message}${suffix}`
  }

  if (error instanceof Error && error.name === "AbortError") {
    return `${endpoint.origin} timed out after ${timeoutMs / 1000}s${suffix}`
  }

  const cause = error && typeof error === "object" && "cause" in error ? (error as { cause?: unknown }).cause : undefined
  const causeMessage = cause instanceof Error ? cause.message : ""
  const message = error instanceof Error ? error.message : "unknown error"
  return `${endpoint.href} is not reachable (${causeMessage || message})${suffix}`
}

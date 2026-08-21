import "server-only"

const DEFAULT_TIMEOUT_MS = 30_000

export function chatCompletionsUrl(baseUrl: string) {
  const normalized = baseUrl.trim().replace(/\/+$/, "")
  return new URL(normalized.endsWith("/chat/completions") ? normalized : `${normalized}/chat/completions`)
}

export async function fetchAiJson(endpoint: URL, init: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(endpoint, { ...init, signal: controller.signal })
    const text = await response.text()
    if (!response.ok) {
      const detail = text.trim() ? `: ${text.slice(0, 300)}` : ""
      throw new Error(`HTTP ${response.status}${detail}`)
    }
    return text ? JSON.parse(text) : {}
  } catch (error) {
    throw new Error(describeAiError(endpoint, error, timeoutMs))
  } finally {
    clearTimeout(timeout)
  }
}

function describeAiError(endpoint: URL, error: unknown, timeoutMs: number) {
  if (error instanceof Error && error.name === "AbortError") {
    return `${endpoint.origin} timed out after ${timeoutMs / 1000}s`
  }

  const cause = error && typeof error === "object" && "cause" in error ? (error as { cause?: unknown }).cause : undefined
  const causeMessage = cause instanceof Error ? cause.message : ""
  const message = error instanceof Error ? error.message : "unknown error"
  return `${endpoint.href} is not reachable (${causeMessage || message})`
}

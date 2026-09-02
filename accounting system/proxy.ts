import { NextRequest, NextResponse } from "next/server"

const ACCESS_COOKIE_NAME = process.env.ACCESS_COOKIE_NAME || "lst_access_token"
const AUTH_SHARED_SECRET = process.env.AUTH_SHARED_SECRET || "dev-only-change-me"
const DJANGO_LOGIN_URL = process.env.DJANGO_LOGIN_URL || "http://localhost:8000/login/"

const PUBLIC_PREFIXES = ["/_next", "/favicon.ico", "/icon", "/apple-icon", "/placeholder"]
const PUBLIC_PATHS = ["/api/auth/logout"]

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=")
  const binary = atob(padded)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let index = 0; index < a.length; index += 1) {
    diff |= a[index] ^ b[index]
  }
  return diff === 0
}

async function validAccessToken(token: string) {
  const [payloadPart, signaturePart] = token.split(".")
  if (!payloadPart || !signaturePart) return false

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(AUTH_SHARED_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadPart)))
  const actual = base64UrlToBytes(signaturePart)
  if (!timingSafeEqual(expected, actual)) return false

  const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payloadPart))) as {
    exp?: number
    role?: string
    status?: string
  }
  const active = payload.status === "active"
  const allowedRole = payload.role === "user"
  const notExpired = typeof payload.exp === "number" && payload.exp > Math.floor(Date.now() / 1000)
  return active && allowedRole && notExpired
}

function loginRedirect(request: NextRequest) {
  const redirectUrl = new URL(DJANGO_LOGIN_URL)
  const protocol = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "") || "http"
  const host = request.headers.get("host") || request.nextUrl.host
  const returnUrl = `${protocol}://${host}${request.nextUrl.pathname}${request.nextUrl.search}`
  redirectUrl.searchParams.set("next", returnUrl)
  const response = NextResponse.redirect(redirectUrl)
  response.cookies.delete(ACCESS_COOKIE_NAME)
  return response
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next()
  }
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next()
  }

  const token = request.cookies.get(ACCESS_COOKIE_NAME)?.value
  if (!token) return loginRedirect(request)

  try {
    if (await validAccessToken(token)) return NextResponse.next()
  } catch {
    return loginRedirect(request)
  }

  return loginRedirect(request)
}

export const config = {
  matcher: ["/((?!.*\\.).*)"],
}

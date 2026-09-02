import { NextRequest, NextResponse } from "next/server"

const ACCESS_COOKIE_NAME = process.env.ACCESS_COOKIE_NAME || "lst_access_token"
const DJANGO_LOGIN_URL = process.env.DJANGO_LOGIN_URL || "http://localhost:8000/login/"

export async function GET(request: NextRequest) {
  const loginUrl = new URL(DJANGO_LOGIN_URL)
  const requestUrl = new URL(request.url)
  const protocol = request.headers.get("x-forwarded-proto") || requestUrl.protocol.replace(":", "") || "http"
  const host = request.headers.get("host") || requestUrl.host
  loginUrl.searchParams.set("next", `${protocol}://${host}/`)
  const response = NextResponse.redirect(loginUrl)
  response.cookies.delete(ACCESS_COOKIE_NAME)
  return response
}

export async function POST(request: NextRequest) {
  return GET(request)
}

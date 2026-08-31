import { NextRequest, NextResponse } from "next/server"
import { DEMO_USER_ID, SESSION_COOKIE_NAME, switchActiveCompany } from "@/lib/server/auth-context"

export const runtime = "nodejs"

function requestUserId(request: NextRequest) {
  return request.cookies.get(SESSION_COOKIE_NAME)?.value.trim() || request.headers.get("x-user-id")?.trim() || DEMO_USER_ID
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected company switch API error."
  return NextResponse.json({ error: message }, { status: 500 })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    return NextResponse.json(await switchActiveCompany(requestUserId(request), String(body.companyId ?? "")))
  } catch (error) {
    return errorResponse(error)
  }
}

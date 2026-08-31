import { NextRequest, NextResponse } from "next/server"
import { createCompanyForUser, DEMO_USER_ID, listUserCompanies, SESSION_COOKIE_NAME } from "@/lib/server/auth-context"

export const runtime = "nodejs"

function requestUserId(request: NextRequest) {
  return request.cookies.get(SESSION_COOKIE_NAME)?.value.trim() || request.headers.get("x-user-id")?.trim() || DEMO_USER_ID
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected companies API error."
  return NextResponse.json({ error: message }, { status: 500 })
}

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(await listUserCompanies(requestUserId(request)))
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    return NextResponse.json(await createCompanyForUser(requestUserId(request), {
      name: String(body.name ?? ""),
      baseCurrency: typeof body.baseCurrency === "string" ? body.baseCurrency : undefined,
    }))
  } catch (error) {
    return errorResponse(error)
  }
}

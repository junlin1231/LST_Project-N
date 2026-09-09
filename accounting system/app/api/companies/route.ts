import { NextRequest, NextResponse } from "next/server"
import { listUserCompanies, requireTenantContext } from "@/lib/server/auth-context"

export const runtime = "nodejs"

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected companies API error."
  return NextResponse.json({ error: message }, { status: 500 })
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireTenantContext(request)
    return NextResponse.json(await listUserCompanies(ctx.userId))
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  return NextResponse.json({ error: "Company registration is managed by the admin panel." }, { status: 403 })
}

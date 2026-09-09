import { NextRequest, NextResponse } from "next/server"
import { requireTenantContext, switchActiveCompany } from "@/lib/server/auth-context"

export const runtime = "nodejs"

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected company switch API error."
  return NextResponse.json({ error: message }, { status: 500 })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const ctx = await requireTenantContext(request)
    return NextResponse.json(await switchActiveCompany(ctx.userId, String(body.companyId ?? "")))
  } catch (error) {
    return errorResponse(error)
  }
}

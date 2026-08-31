import { NextRequest, NextResponse } from "next/server"
import { getOcrOwnNamesSettings, updateOcrOwnNamesSettings } from "@/lib/server/company-settings-repository"
import { withTenantContext } from "@/lib/server/auth-context"
import { requireRole } from "@/lib/server/permissions"

export const runtime = "nodejs"

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected OCR settings error."
  return NextResponse.json({ error: message }, { status: 500 })
}

export async function GET(request: NextRequest) {
  try {
    return await withTenantContext(request, async () => NextResponse.json(await getOcrOwnNamesSettings()))
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    return await withTenantContext(request, async (ctx) => {
      requireRole(ctx, ["owner", "admin", "accountant"])
      const body = await request.json()
      return NextResponse.json(await updateOcrOwnNamesSettings({ ownNames: body.ownNames }))
    })
  } catch (error) {
    return errorResponse(error)
  }
}

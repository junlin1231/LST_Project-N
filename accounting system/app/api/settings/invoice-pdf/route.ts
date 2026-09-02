import { NextRequest, NextResponse } from "next/server"
import { getInvoicePdfSettings, updateInvoicePdfSettings } from "@/lib/server/company-settings-repository"
import { withTenantContext } from "@/lib/server/auth-context"
import { requireRole } from "@/lib/server/permissions"

export const runtime = "nodejs"

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected invoice PDF settings error."
  return NextResponse.json({ error: message }, { status: 500 })
}

export async function GET(request: NextRequest) {
  try {
    return await withTenantContext(request, async () => NextResponse.json(await getInvoicePdfSettings()))
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    return await withTenantContext(request, async (ctx) => {
      requireRole(ctx, ["owner", "admin", "accountant"])
      const body = await request.json()
      return NextResponse.json(await updateInvoicePdfSettings(body))
    })
  } catch (error) {
    return errorResponse(error)
  }
}

import { NextRequest, NextResponse } from "next/server"
import { rejectDocument } from "@/lib/server/document-repository"
import { withTenantContext } from "@/lib/server/auth-context"
import { requireRole } from "@/lib/server/permissions"

export const runtime = "nodejs"

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected document rejection error."
  return NextResponse.json({ error: message }, { status: 500 })
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    return await withTenantContext(request, async (ctx) => {
      requireRole(ctx, ["owner", "admin", "accountant", "approver"])
      const { id } = await context.params
      const body = await request.json().catch(() => ({}))
      return NextResponse.json(await rejectDocument(id, String(body.reason ?? "")))
    })
  } catch (error) {
    return errorResponse(error)
  }
}

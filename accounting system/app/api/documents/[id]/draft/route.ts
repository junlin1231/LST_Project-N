import { NextRequest, NextResponse } from "next/server"
import { updateDocumentDraft } from "@/lib/server/document-repository"
import { withTenantContext } from "@/lib/server/auth-context"
import { requireRole } from "@/lib/server/permissions"

export const runtime = "nodejs"

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected document draft error."
  return NextResponse.json({ error: message }, { status: 500 })
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    return await withTenantContext(request, async (ctx) => {
      requireRole(ctx, ["owner", "admin", "accountant", "approver"])
      const { id } = await context.params
      const body = await request.json()
      return NextResponse.json(await updateDocumentDraft(id, body))
    })
  } catch (error) {
    return errorResponse(error)
  }
}

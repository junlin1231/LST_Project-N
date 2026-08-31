import { NextRequest, NextResponse } from "next/server"
import { processDocument } from "@/lib/server/document-repository"
import { withTenantContext } from "@/lib/server/auth-context"
import { requireRole } from "@/lib/server/permissions"

export const runtime = "nodejs"

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected document processing error."
  return NextResponse.json({ error: message }, { status: 500 })
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    return await withTenantContext(request, async (ctx) => {
      requireRole(ctx, ["owner", "admin", "accountant", "approver"])
      const { id } = await context.params
      return NextResponse.json(await processDocument(id))
    })
  } catch (error) {
    return errorResponse(error)
  }
}

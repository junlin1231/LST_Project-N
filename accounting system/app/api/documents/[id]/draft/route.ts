import { NextRequest, NextResponse } from "next/server"
import { updateDocumentDraft } from "@/lib/server/document-repository"

export const runtime = "nodejs"

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected document draft error."
  return NextResponse.json({ error: message }, { status: 500 })
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const body = await request.json()
    return NextResponse.json(await updateDocumentDraft(id, body))
  } catch (error) {
    return errorResponse(error)
  }
}

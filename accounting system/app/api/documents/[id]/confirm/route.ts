import { NextRequest, NextResponse } from "next/server"
import { confirmDocumentDraft } from "@/lib/server/document-repository"

export const runtime = "nodejs"

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected document confirmation error."
  return NextResponse.json({ error: message }, { status: 500 })
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const body = await request.json().catch(() => ({}))
    return NextResponse.json(await confirmDocumentDraft(id, body.reason))
  } catch (error) {
    return errorResponse(error)
  }
}

import { NextResponse } from "next/server"
import { processDocument } from "@/lib/server/document-repository"

export const runtime = "nodejs"

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected document processing error."
  return NextResponse.json({ error: message }, { status: 500 })
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    return NextResponse.json(await processDocument(id))
  } catch (error) {
    return errorResponse(error)
  }
}

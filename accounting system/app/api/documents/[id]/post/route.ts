import { NextResponse } from "next/server"
import { postConfirmedDocument } from "@/lib/server/document-repository"

export const runtime = "nodejs"

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected document posting error."
  return NextResponse.json({ error: message }, { status: 500 })
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    return NextResponse.json(await postConfirmedDocument(id))
  } catch (error) {
    return errorResponse(error)
  }
}

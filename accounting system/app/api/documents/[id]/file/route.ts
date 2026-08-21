import { NextResponse } from "next/server"
import { getDocumentFile } from "@/lib/server/document-repository"

export const runtime = "nodejs"

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected document file error."
  return NextResponse.json({ error: message }, { status: 500 })
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const file = await getDocumentFile(id)
    return new NextResponse(file.bytes, {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `inline; filename="${file.filename.replace(/"/g, "")}"`,
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}

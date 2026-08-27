import { NextResponse } from "next/server"
import { getDocumentFile } from "@/lib/server/document-repository"

export const runtime = "nodejs"

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected document file error."
  return NextResponse.json({ error: message }, { status: 500 })
}

function contentDisposition(filename: string) {
  const extension = filename.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? ""
  const asciiBase = filename
    .replace(extension, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
  const fallback = `${asciiBase || "document"}${extension}`.replace(/"/g, "")
  return `inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const file = await getDocumentFile(id)
    return new NextResponse(file.bytes, {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": contentDisposition(file.filename),
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}

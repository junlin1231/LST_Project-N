import { NextRequest, NextResponse } from "next/server"
import { createDocumentUpload, listDocuments } from "@/lib/server/document-repository"

export const runtime = "nodejs"

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected document API error."
  return NextResponse.json({ error: message }, { status: 500 })
}

export async function GET() {
  try {
    return NextResponse.json(await listDocuments())
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Document file is required." }, { status: 400 })
    }

    const sourceChannel = String(formData.get("sourceChannel") ?? "web_upload")
    const bytes = Buffer.from(await file.arrayBuffer())
    const document = await createDocumentUpload({
      filename: file.name,
      mimeType: file.type,
      bytes,
      sourceChannel: sourceChannel as "web_upload" | "camera_capture",
    })
    return NextResponse.json(document)
  } catch (error) {
    return errorResponse(error)
  }
}

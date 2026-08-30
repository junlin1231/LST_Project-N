import { NextRequest, NextResponse } from "next/server"
import {
  createDocumentMasterDataOption,
  listDocumentMasterData,
  updateDocumentMasterDataOption,
} from "@/lib/server/document-master-data-repository"

export const runtime = "nodejs"

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected document master data API error."
  return NextResponse.json({ error: message }, { status: 500 })
}

export async function GET() {
  try {
    return NextResponse.json(await listDocumentMasterData())
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    if (body.action === "create") {
      return NextResponse.json(await createDocumentMasterDataOption(body.option))
    }
    if (body.action === "update") {
      return NextResponse.json(await updateDocumentMasterDataOption(String(body.id), body.option))
    }
    return NextResponse.json({ error: "Document master data action is not valid." }, { status: 400 })
  } catch (error) {
    return errorResponse(error)
  }
}

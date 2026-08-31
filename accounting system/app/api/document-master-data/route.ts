import { NextRequest, NextResponse } from "next/server"
import {
  createDocumentMasterDataOption,
  listDocumentMasterData,
  updateDocumentMasterDataOption,
} from "@/lib/server/document-master-data-repository"
import { withTenantContext } from "@/lib/server/auth-context"
import { requireRole } from "@/lib/server/permissions"

export const runtime = "nodejs"

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected document master data API error."
  return NextResponse.json({ error: message }, { status: 500 })
}

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(await withTenantContext(request, () => listDocumentMasterData()))
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    return await withTenantContext(request, async (ctx) => {
      requireRole(ctx, ["owner", "admin", "accountant"])
      const body = await request.json()
      if (body.action === "create") {
        return NextResponse.json(await createDocumentMasterDataOption(body.option))
      }
      if (body.action === "update") {
        return NextResponse.json(await updateDocumentMasterDataOption(String(body.id), body.option))
      }
      return NextResponse.json({ error: "Document master data action is not valid." }, { status: 400 })
    })
  } catch (error) {
    return errorResponse(error)
  }
}

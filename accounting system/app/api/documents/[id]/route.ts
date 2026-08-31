import { NextRequest, NextResponse } from "next/server"
import {
  confirmDocumentDraft,
  deleteUnpostedDocument,
  getDocumentDetail,
  getDocumentFile,
  postConfirmedDocument,
  processDocument,
  rejectDocument,
  updateDocumentDraft,
} from "@/lib/server/document-repository"
import { withTenantContext } from "@/lib/server/auth-context"
import { requireRole } from "@/lib/server/permissions"

export const runtime = "nodejs"

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected document API error."
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

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    return await withTenantContext(request, async (ctx) => {
      requireRole(ctx, ["owner", "admin", "accountant", "approver"])
      const { id } = await context.params
      if (request.nextUrl.searchParams.get("action") === "file") {
        const file = await getDocumentFile(id)
        return new NextResponse(file.bytes, {
          headers: {
            "Content-Type": file.mimeType,
            "Content-Disposition": contentDisposition(file.filename),
          },
        })
      }
      return NextResponse.json(await getDocumentDetail(id))
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    return await withTenantContext(request, async (ctx) => {
      requireRole(ctx, ["owner", "admin", "accountant", "approver"])
      const { id } = await context.params
      const action = request.nextUrl.searchParams.get("action")
      if (action === "process") return NextResponse.json(await processDocument(id))
      if (action === "post") return NextResponse.json(await postConfirmedDocument(id))
      if (action === "confirm") {
        const body = await request.json().catch(() => ({}))
        return NextResponse.json(await confirmDocumentDraft(id, body.reason))
      }
      if (action === "reject") {
        const body = await request.json().catch(() => ({}))
        return NextResponse.json(await rejectDocument(id, String(body.reason ?? "")))
      }
      return NextResponse.json({ error: "Document action is not valid." }, { status: 400 })
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    return await withTenantContext(request, async (ctx) => {
      requireRole(ctx, ["owner", "admin", "accountant"])
      const { id } = await context.params
      const action = request.nextUrl.searchParams.get("action")
      if (action && action !== "draft") {
        return NextResponse.json({ error: "Document action is not valid." }, { status: 400 })
      }
      return NextResponse.json(await updateDocumentDraft(id, await request.json()))
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    return await withTenantContext(request, async () => {
      const { id } = await context.params
      return NextResponse.json(await deleteUnpostedDocument(id))
    })
  } catch (error) {
    return errorResponse(error)
  }
}

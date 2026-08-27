import { NextResponse } from "next/server"
import { getServerEnvDiagnostics } from "@/lib/server/env"

export const runtime = "nodejs"

export async function GET() {
  return NextResponse.json(getServerEnvDiagnostics())
}

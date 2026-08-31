import "server-only"

import { currentCompanyId } from "./auth-context"
import { ensureDatabaseReady, query } from "./db"

export interface OcrOwnNamesSettings {
  companyName: string
  legalName: string
  taxId: string
  ownNames: string[]
}

interface CompanySettingsRow {
  name: string
  legal_name: string | null
  tax_id: string | null
  ocr_own_names: string[]
}

function normalizeOwnNames(values: unknown) {
  const rawValues = Array.isArray(values) ? values : String(values ?? "").split(/\r?\n|,/)
  const normalized = rawValues
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .map((value) => value.replace(/\s+/g, " "))

  return Array.from(new Set(normalized)).slice(0, 20)
}

export async function getOcrOwnNamesSettings(): Promise<OcrOwnNamesSettings> {
  await ensureDatabaseReady()
  const result = await query<CompanySettingsRow>(
    `SELECT name, legal_name, tax_id, ocr_own_names
     FROM companies
     WHERE id = $1
     LIMIT 1`,
    [currentCompanyId()],
  )
  const company = result.rows[0]
  if (!company) throw new Error("Company was not found.")

  return {
    companyName: company.name,
    legalName: company.legal_name ?? "",
    taxId: company.tax_id ?? "",
    ownNames: normalizeOwnNames(company.ocr_own_names?.length ? company.ocr_own_names : [company.name]),
  }
}

export async function updateOcrOwnNamesSettings(input: { ownNames: unknown }): Promise<OcrOwnNamesSettings> {
  await ensureDatabaseReady()
  const ownNames = normalizeOwnNames(input.ownNames)
  if (ownNames.length === 0) throw new Error("Add at least one own entity name for OCR matching.")

  const result = await query<CompanySettingsRow>(
    `UPDATE companies
     SET ocr_own_names = $1::TEXT[], updated_at = NOW()
     WHERE id = $2
     RETURNING name, legal_name, tax_id, ocr_own_names`,
    [ownNames, currentCompanyId()],
  )
  const company = result.rows[0]
  if (!company) throw new Error("Company was not found.")

  return {
    companyName: company.name,
    legalName: company.legal_name ?? "",
    taxId: company.tax_id ?? "",
    ownNames: normalizeOwnNames(company.ocr_own_names),
  }
}

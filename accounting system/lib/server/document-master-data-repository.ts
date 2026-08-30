import "server-only"

import { randomUUID } from "node:crypto"
import {
  DEFAULT_DOCUMENT_MASTER_DATA_OPTIONS,
  type DocumentMasterDataOption,
  type DocumentMasterDataType,
} from "@/lib/accounting/document-master-data"
import { DEFAULT_COMPANY_ID } from "./accounting-repository"
import { ensureDatabaseReady, query, transaction, type DbExecutor } from "./db"

interface DocumentMasterDataRow {
  id: string
  option_type: DocumentMasterDataType
  value: string
  label: string
  is_active: boolean
  sort_order: number
}

async function exec(db: DbExecutor, sql: string, values?: unknown[]) {
  return db.query(sql, values)
}

function mapOption(row: DocumentMasterDataRow): DocumentMasterDataOption {
  return {
    id: row.id,
    type: row.option_type,
    value: row.value,
    label: row.label,
    isActive: row.is_active,
    sortOrder: row.sort_order,
  }
}

function validateType(value: unknown): DocumentMasterDataType {
  if (value === "currency" || value === "payment_method") return value
  throw new Error("Master data type is not valid.")
}

function normalizeValue(type: DocumentMasterDataType, value: unknown) {
  const text = String(value ?? "").trim()
  if (type === "currency") {
    const currency = text.toUpperCase()
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Currency must be a 3-letter code.")
    return currency
  }
  return text.toLowerCase().replace(/\s+/g, "_").replace(/-+/g, "_")
}

function normalizeLabel(value: unknown) {
  const label = String(value ?? "").trim()
  if (!label) throw new Error("Master data label is required.")
  return label
}

export async function ensureDocumentMasterData() {
  await ensureDatabaseReady()
  await transaction(async (client) => {
    await exec(
      client,
      `CREATE TABLE IF NOT EXISTS document_master_data_options (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        option_type TEXT NOT NULL CHECK (option_type IN ('currency', 'payment_method')),
        value TEXT NOT NULL,
        label TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (company_id, option_type, value)
      )`,
    )
    await exec(
      client,
      "CREATE INDEX IF NOT EXISTS idx_document_master_data_options_company_type ON document_master_data_options(company_id, option_type, is_active, sort_order)",
    )

    for (const option of DEFAULT_DOCUMENT_MASTER_DATA_OPTIONS) {
      await exec(
        client,
        `INSERT INTO document_master_data_options (id, company_id, option_type, value, label, is_active, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (company_id, option_type, value) DO NOTHING`,
        [option.id, DEFAULT_COMPANY_ID, option.type, option.value, option.label, option.isActive, option.sortOrder],
      )
    }
  })
}

export async function listDocumentMasterData() {
  await ensureDocumentMasterData()
  const result = await query<DocumentMasterDataRow>(
    `SELECT id, option_type, value, label, is_active, sort_order
     FROM document_master_data_options
     WHERE company_id = $1
     ORDER BY option_type ASC, sort_order ASC, label ASC`,
    [DEFAULT_COMPANY_ID],
  )
  return result.rows.map(mapOption)
}

export async function listActiveDocumentMasterData() {
  const options = await listDocumentMasterData()
  return options.filter((option) => option.isActive)
}

export async function createDocumentMasterDataOption(input: { type: unknown; value: unknown; label: unknown; sortOrder?: unknown }) {
  await ensureDocumentMasterData()
  const type = validateType(input.type)
  const value = normalizeValue(type, input.value)
  const label = normalizeLabel(input.label)
  const sortOrder = Number.isInteger(Number(input.sortOrder)) ? Number(input.sortOrder) : 999
  const id = `doc-md-${randomUUID()}`

  const result = await query<DocumentMasterDataRow>(
    `INSERT INTO document_master_data_options (id, company_id, option_type, value, label, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (company_id, option_type, value)
     DO UPDATE SET label = EXCLUDED.label, is_active = TRUE, sort_order = EXCLUDED.sort_order, updated_at = NOW()
     RETURNING id, option_type, value, label, is_active, sort_order`,
    [id, DEFAULT_COMPANY_ID, type, value, label, sortOrder],
  )
  return mapOption(result.rows[0])
}

export async function updateDocumentMasterDataOption(id: string, input: { label?: unknown; isActive?: unknown; sortOrder?: unknown }) {
  await ensureDocumentMasterData()
  const label = input.label === undefined ? null : normalizeLabel(input.label)
  const isActive = input.isActive === undefined ? null : Boolean(input.isActive)
  const sortOrder = input.sortOrder === undefined ? null : Number(input.sortOrder)
  const result = await query<DocumentMasterDataRow>(
    `UPDATE document_master_data_options
     SET label = COALESCE($1, label),
         is_active = COALESCE($2, is_active),
         sort_order = COALESCE($3, sort_order),
         updated_at = NOW()
     WHERE id = $4 AND company_id = $5
     RETURNING id, option_type, value, label, is_active, sort_order`,
    [label, isActive, Number.isFinite(sortOrder) ? sortOrder : null, id, DEFAULT_COMPANY_ID],
  )
  if (!result.rows[0]) throw new Error("Master data option was not found.")
  return mapOption(result.rows[0])
}

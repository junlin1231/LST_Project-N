export interface InvoicePdfSettings {
  companyName: string
  registrationNo: string
  addressLines: string[]
  phone: string
  logoText: string
  defaultUom: string
  defaultAgent: string
  defaultAttention: string
  bankDetails: string[]
  termsConditions: string[]
}

export const DEFAULT_INVOICE_PDF_SETTINGS: InvoicePdfSettings = {
  companyName: "Demo Company",
  registrationNo: "",
  addressLines: ["Company address line 1", "Company address line 2"],
  phone: "",
  logoText: "DC",
  defaultUom: "UNIT(S)",
  defaultAgent: "",
  defaultAttention: "",
  bankDetails: [
    "Bank Name      :",
    "Account Name   :",
    "Account Number :",
  ],
  termsConditions: [
    "1. Payment shall be made based on the payment terms stated in this invoice.",
    "2. All payments made are non-refundable.",
    "3. Goods and/or services provided shall remain the property of the Company until full payment has been received.",
  ],
}

function normalizeLines(value: unknown, fallback: string[], maxLines: number) {
  const lines = Array.isArray(value) ? value : String(value ?? "").split(/\r?\n/)
  const normalized = lines
    .map((line) => String(line ?? "").trim())
    .filter(Boolean)
    .map((line) => line.replace(/\s+/g, " "))

  return normalized.length ? normalized.slice(0, maxLines) : fallback
}

function normalizeText(value: unknown, fallback: string, maxLength: number) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ")
  return (text || fallback).slice(0, maxLength)
}

export function normalizeInvoicePdfSettings(value: unknown): InvoicePdfSettings {
  const input = typeof value === "object" && value ? value as Partial<InvoicePdfSettings> : {}
  return {
    companyName: normalizeText(input.companyName, DEFAULT_INVOICE_PDF_SETTINGS.companyName, 120),
    registrationNo: normalizeText(input.registrationNo, DEFAULT_INVOICE_PDF_SETTINGS.registrationNo, 50),
    addressLines: normalizeLines(input.addressLines, DEFAULT_INVOICE_PDF_SETTINGS.addressLines, 4),
    phone: normalizeText(input.phone, DEFAULT_INVOICE_PDF_SETTINGS.phone, 50),
    logoText: normalizeText(input.logoText, DEFAULT_INVOICE_PDF_SETTINGS.logoText, 6).toUpperCase(),
    defaultUom: normalizeText(input.defaultUom, DEFAULT_INVOICE_PDF_SETTINGS.defaultUom, 20),
    defaultAgent: normalizeText(input.defaultAgent, DEFAULT_INVOICE_PDF_SETTINGS.defaultAgent, 80),
    defaultAttention: normalizeText(input.defaultAttention, DEFAULT_INVOICE_PDF_SETTINGS.defaultAttention, 80),
    bankDetails: normalizeLines(input.bankDetails, DEFAULT_INVOICE_PDF_SETTINGS.bankDetails, 6),
    termsConditions: normalizeLines(input.termsConditions, DEFAULT_INVOICE_PDF_SETTINGS.termsConditions, 6),
  }
}

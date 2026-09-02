import type { Contact, Invoice } from "./types"
import { DEFAULT_INVOICE_PDF_SETTINGS, type InvoicePdfSettings } from "./invoice-pdf-settings"
import { formatDate, invoiceSubtotal, invoiceTax, invoiceTotal } from "./utils"

const PAGE_WIDTH = 595
const PAGE_HEIGHT = 842
const PAGE_MARGIN = 57
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2
const BLACK = "0 0 0"
const TEXT = "0.2 0.2 0.2"
const MUTED = "0.33 0.33 0.33"
const RULE = "0.8 0.8 0.8"
const HEADER_FILL = "0.957 0.957 0.957"

interface TextOptions {
  size?: number
  font?: "regular" | "bold"
  align?: "left" | "center" | "right"
  color?: string
}

interface Column {
  label: string
  x: number
  width: number
  align?: "left" | "center" | "right"
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

function pdfDate(iso: string) {
  const formatted = formatDate(iso)
  return formatted === "-" ? "" : formatted
}

function safeText(value: string | number | undefined | null) {
  return String(value ?? "").replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ")
}

function escapePdfText(value: string | number | undefined | null) {
  return safeText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")
}

function textWidth(value: string | number | undefined | null, size: number) {
  return safeText(value).length * size * 0.52
}

function numberToWords(value: number): string {
  const ones = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"]
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]
  const underThousand = (amount: number): string => {
    const parts: string[] = []
    if (amount >= 100) {
      parts.push(`${ones[Math.floor(amount / 100)]} hundred`)
      amount %= 100
    }
    if (amount >= 20) {
      parts.push(`${tens[Math.floor(amount / 10)]}${amount % 10 ? ` ${ones[amount % 10]}` : ""}`)
    } else if (amount > 0) {
      parts.push(ones[amount])
    }
    return parts.join(" ")
  }

  const whole = Math.floor(Math.abs(value))
  if (whole === 0) return "ZERO"
  const scales: Array<[number, string]> = [
    [1_000_000_000, "billion"],
    [1_000_000, "million"],
    [1_000, "thousand"],
    [1, ""],
  ]
  const words: string[] = []
  let remainder = whole
  for (const [scale, label] of scales) {
    const chunk = Math.floor(remainder / scale)
    if (chunk) {
      words.push(`${underThousand(chunk)} ${label}`.trim())
      remainder %= scale
    }
  }
  return words.join(" ").toUpperCase()
}

function addObject(objects: string[], body: string) {
  objects.push(body)
  return objects.length
}

function buildPdf(commands: string[]) {
  const objects: string[] = []
  const content = commands.join("\n")
  const catalogId = addObject(objects, "<< /Type /Catalog /Pages 2 0 R >>")
  const pagesId = addObject(objects, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
  addObject(
    objects,
    `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
  )
  addObject(objects, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
  addObject(objects, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")
  addObject(objects, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`)

  const offsets: number[] = []
  let pdf = `%PDF-1.4\n%\xE2\xE3\xCF\xD3\n`
  objects.forEach((object, index) => {
    offsets[index + 1] = pdf.length
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })

  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`
  return new Blob([new Uint8Array([...pdf].map((char) => char.charCodeAt(0)))], { type: "application/pdf" })
}

class PdfCanvas {
  private commands: string[] = []

  text(value: string | number | undefined | null, x: number, y: number, options: TextOptions = {}) {
    const size = options.size ?? 8
    const font = options.font === "bold" ? "F2" : "F1"
    const color = options.color ?? TEXT
    const width = textWidth(value, size)
    const tx = options.align === "right" ? x - width : options.align === "center" ? x - width / 2 : x
    this.commands.push(`BT /${font} ${size} Tf ${color} rg ${tx.toFixed(2)} ${y.toFixed(2)} Td (${escapePdfText(value)}) Tj ET`)
  }

  line(x1: number, y1: number, x2: number, y2: number, color = RULE, width = 0.75) {
    this.commands.push(`${width} w ${color} RG ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`)
  }

  rect(x: number, y: number, width: number, height: number, color = HEADER_FILL) {
    this.commands.push(`${color} rg ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f`)
  }

  wrapText(value: string | number | undefined | null, x: number, y: number, maxWidth: number, lineHeight: number, options: TextOptions = {}) {
    const size = options.size ?? 8
    const words = safeText(value).split(/\s+/).filter(Boolean)
    const lines: string[] = []
    let line = ""
    for (const word of words) {
      const next = line ? `${line} ${word}` : word
      if (textWidth(next, size) <= maxWidth || !line) {
        line = next
      } else {
        lines.push(line)
        line = word
      }
    }
    if (line) lines.push(line)
    lines.forEach((row, index) => this.text(row, x, y - index * lineHeight, options))
    return lines.length
  }

  output() {
    return buildPdf(this.commands)
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function drawRightDetail(pdf: PdfCanvas, label: string, value: string, y: number) {
  const right = PAGE_WIDTH - PAGE_MARGIN
  pdf.text(label, right - textWidth(value || "-", 8) - 4, y, { size: 8, font: "bold", align: "right", color: BLACK })
  pdf.text(value || "-", right, y, { size: 8, align: "right", color: BLACK })
}

function drawTotalsRow(pdf: PdfCanvas, label: string, value: string, y: number, bold = false) {
  pdf.text(label, 385, y, { size: 8, font: bold ? "bold" : "regular", color: BLACK })
  pdf.text(value, PAGE_WIDTH - PAGE_MARGIN, y, { size: 8, font: bold ? "bold" : "regular", align: "right", color: BLACK })
}

function drawLineItems(pdf: PdfCanvas, invoice: Invoice, settings: InvoicePdfSettings) {
  const columns: Column[] = [
    { label: "CODE", x: PAGE_MARGIN, width: 58 },
    { label: "DESCRIPTION", x: 115, width: 150 },
    { label: "QTY", x: 265, width: 35, align: "center" },
    { label: "UOM", x: 300, width: 50, align: "center" },
    { label: "UNIT PRICE (MYR)", x: 350, width: 72, align: "right" },
    { label: "DISCOUNT", x: 422, width: 56, align: "right" },
    { label: "AMOUNT (MYR)", x: 478, width: 60, align: "right" },
  ]

  pdf.rect(PAGE_MARGIN, 528, CONTENT_WIDTH, 24)
  pdf.line(PAGE_MARGIN, 552, PAGE_WIDTH - PAGE_MARGIN, 552)
  pdf.line(PAGE_MARGIN, 528, PAGE_WIDTH - PAGE_MARGIN, 528)
  columns.forEach((column) => {
    const x = column.align === "right" ? column.x + column.width : column.align === "center" ? column.x + column.width / 2 : column.x + 8
    pdf.text(column.label, x, 537, { size: 6.3, font: "bold", align: column.align, color: BLACK })
  })

  let y = 506
  invoice.items.forEach((item, index) => {
    if (y < 350) return
    const code = item.id?.startsWith("li-") ? `ITEM-${String(index + 1).padStart(3, "0")}` : item.id
    pdf.text(code || `ITEM-${String(index + 1).padStart(3, "0")}`, PAGE_MARGIN + 8, y, { size: 8 })
    const rows = pdf.wrapText(item.description, 123, y, 134, 10, { size: 8 })
    pdf.text(money(item.quantity).replace(".00", ""), 282.5, y, { size: 8, align: "center" })
    pdf.text(settings.defaultUom || "UNIT(S)", 325, y, { size: 8, align: "center" })
    pdf.text(money(item.unitPrice), 418, y, { size: 8, align: "right" })
    pdf.text("0.00", 474, y, { size: 8, align: "right" })
    pdf.text(money(item.quantity * item.unitPrice), PAGE_WIDTH - PAGE_MARGIN, y, { size: 8, align: "right" })
    y -= Math.max(24, rows * 10 + 8)
  })
}

export function exportInvoicePdf(
  invoice: Invoice,
  contact?: Contact,
  settings: InvoicePdfSettings = DEFAULT_INVOICE_PDF_SETTINGS,
) {
  const pdf = new PdfCanvas()
  const subtotal = invoiceSubtotal(invoice)
  const tax = invoiceTax(invoice)
  const total = invoiceTotal(invoice)
  const terms = Math.max(
    0,
    Math.round((new Date(`${invoice.dueDate}T00:00:00`).getTime() - new Date(`${invoice.issueDate}T00:00:00`).getTime()) / 86_400_000),
  )
  const companyName = settings.registrationNo ? `${settings.companyName} (${settings.registrationNo})` : settings.companyName
  const customerName = contact?.name ?? invoice.clientId
  const customerAddress = contact?.addressLines?.filter(Boolean).slice(0, 4) ?? []

  pdf.wrapText(companyName, PAGE_MARGIN, 786, 300, 13, { size: 11, font: "bold" })
  settings.addressLines.slice(0, 4).forEach((line, index) => pdf.text(line, PAGE_MARGIN, 762 - index * 11, { size: 8, color: MUTED }))
  if (settings.phone) pdf.text(`Tel: ${settings.phone}`, PAGE_MARGIN, 718, { size: 8, color: MUTED })

  pdf.text("Invoice", PAGE_WIDTH - PAGE_MARGIN, 786, { size: 14, font: "bold", align: "right", color: BLACK })
  drawRightDetail(pdf, "Invoice No.:", invoice.number, 768)
  drawRightDetail(pdf, "Date:", pdfDate(invoice.issueDate), 756)
  drawRightDetail(pdf, "Term:", `${terms || 30} DAYS`, 744)
  drawRightDetail(pdf, "Due Date:", pdfDate(invoice.dueDate), 732)
  if (settings.defaultAgent) drawRightDetail(pdf, "Agent:", settings.defaultAgent, 720)

  pdf.line(PAGE_MARGIN, 694, PAGE_WIDTH - PAGE_MARGIN, 694)

  pdf.text("Bill To:", PAGE_MARGIN, 674, { size: 8.5, font: "bold", color: BLACK })
  pdf.text(customerName, PAGE_MARGIN, 660, { size: 8.5, color: BLACK })
  customerAddress.forEach((line, index) => pdf.text(line, PAGE_MARGIN, 647 - index * 11, { size: 8, color: TEXT }))
  const billMetaY = 647 - customerAddress.length * 11
  if (contact?.phone) pdf.text(`Tel No.: ${contact.phone}`, PAGE_MARGIN, billMetaY, { size: 8 })
  pdf.text(`Email: ${contact?.email || "-"}`, PAGE_MARGIN, billMetaY - (contact?.phone ? 11 : 0), { size: 8 })
  if (contact?.taxId) pdf.text(`Customer Tax ID: ${contact.taxId}`, PAGE_MARGIN, billMetaY - (contact?.phone ? 22 : 11), { size: 8 })
  if (settings.defaultAttention) pdf.text(`Attention: ${settings.defaultAttention}`, PAGE_MARGIN, billMetaY - (contact?.taxId ? 33 : 22), { size: 8 })

  drawLineItems(pdf, invoice, settings)

  pdf.text(`MALAYSIAN RINGGIT ${numberToWords(total)} ONLY`, PAGE_MARGIN, 318, { size: 8, font: "bold", color: BLACK })
  drawTotalsRow(pdf, "TAXABLE AMOUNT", money(subtotal), 318)
  drawTotalsRow(pdf, `TAX (${money(tax)})`, money(tax), 302)
  drawTotalsRow(pdf, "TOTAL AMOUNT", money(total), 286, true)

  pdf.text("TERMS & CONDITIONS", PAGE_MARGIN, 250, { size: 8.5, font: "bold", color: BLACK })
  settings.termsConditions.slice(0, 6).forEach((line, index) => {
    pdf.wrapText(line.replace(/^\d+\.\s*/, `${index + 1}. `), PAGE_MARGIN, 235 - index * 12, 330, 9, { size: 7.2 })
  })

  pdf.text("PAYMENT DETAILS", PAGE_MARGIN, 150, { size: 8.5, font: "bold", color: BLACK })
  settings.bankDetails.slice(0, 6).forEach((line, index) => pdf.text(line, PAGE_MARGIN, 135 - index * 11, { size: 7.4 }))

  pdf.line(PAGE_MARGIN, 66, 250, 66, BLACK, 0.7)
  pdf.text("Confirmed by:", PAGE_MARGIN, 52, { size: 8, color: BLACK })
  pdf.line(355, 66, PAGE_WIDTH - PAGE_MARGIN, 66, BLACK, 0.7)
  pdf.text("Received by:", 355, 52, { size: 8, color: BLACK })

  downloadBlob(pdf.output(), `${invoice.number}.pdf`)
}

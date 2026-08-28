import "server-only"

import { execFile } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import sharp from "sharp"

const execFileAsync = promisify(execFile)

export interface ReceiptRegion {
  x: number
  y: number
  width: number
  height: number
  /** One-indexed PDF page number. Omitted for normal image uploads. */
  page?: number
}

interface RenderedPdfPage {
  page: number
  bytes: Buffer
}

async function renderPdfPages(input: { filePath: string; maxPages?: number }): Promise<RenderedPdfPage[]> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "receipt-pdf-"))
  const outputPrefix = path.join(tempDir, "page")
  try {
    await execFileAsync("pdftoppm", ["-png", "-r", "180", "-f", "1", "-l", String(input.maxPages ?? 3), input.filePath, outputPrefix], {
      timeout: 90_000,
      maxBuffer: 1024 * 1024,
    })
    const files = (await fs.readdir(tempDir))
      .filter((file) => /^page-\d+\.png$/.test(file))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    return Promise.all(files.map(async (file, index) => ({
      page: index + 1,
      bytes: await fs.readFile(path.join(tempDir, file)),
    })))
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function cropImageIntoReceipts(image: Buffer, regions: ReceiptRegion[]) {
  // Normalizing orientation first ensures the model's image coordinates and the crop coordinates match.
  const normalized = await sharp(image).rotate().jpeg({ quality: 94 }).toBuffer()
  const metadata = await sharp(normalized).metadata()
  if (!metadata.width || !metadata.height) throw new Error("Could not read the uploaded image dimensions.")

  const imageWidth = metadata.width
  const imageHeight = metadata.height
  const padding = Math.max(8, Math.round(Math.min(imageWidth, imageHeight) * 0.015))

  return Promise.all(regions.map(async (region) => {
    const left = Math.max(0, Math.floor(region.x * imageWidth) - padding)
    const top = Math.max(0, Math.floor(region.y * imageHeight) - padding)
    const right = Math.min(imageWidth, Math.ceil((region.x + region.width) * imageWidth) + padding)
    const bottom = Math.min(imageHeight, Math.ceil((region.y + region.height) * imageHeight) + padding)
    if (right - left < 32 || bottom - top < 32) throw new Error("A detected receipt region is too small to crop.")

    return sharp(normalized)
      .extract({ left, top, width: right - left, height: bottom - top })
      .jpeg({ quality: 94 })
      .toBuffer()
  }))
}

export async function splitImageIntoReceipts(input: { filePath: string; regions: ReceiptRegion[] }) {
  return cropImageIntoReceipts(await fs.readFile(input.filePath), input.regions)
}

export async function splitDocumentIntoReceipts(input: { filePath: string; mimeType: string; regions: ReceiptRegion[] }) {
  if (input.mimeType.startsWith("image/")) return splitImageIntoReceipts(input)
  if (input.mimeType !== "application/pdf") throw new Error("Only image and PDF documents can be split into receipts.")

  const highestPage = Math.max(...input.regions.map((region) => region.page ?? 1))
  const pages = await renderPdfPages({ filePath: input.filePath, maxPages: highestPage })
  const pagesByNumber = new Map(pages.map((page) => [page.page, page]))
  return Promise.all(input.regions.map(async (region) => {
    const pageNumber = region.page ?? 1
    const page = pagesByNumber.get(pageNumber)
    if (!page) throw new Error(`Could not render PDF page ${pageNumber} for receipt splitting.`)
    const [crop] = await cropImageIntoReceipts(page.bytes, [region])
    return crop
  }))
}

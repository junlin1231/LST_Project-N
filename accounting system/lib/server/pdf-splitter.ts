import "server-only"

import { execFile } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export interface PdfPageImage {
  pageNumber: number
  bytes: Buffer
}

export async function countPdfPages(filePath: string) {
  const buffer = await fs.readFile(filePath)
  const latin = buffer.toString("latin1")
  return Math.max(1, (latin.match(/\/Type\s*\/Page\b/g) ?? []).length)
}

export async function splitPdfIntoPageImages(input: { filePath: string; maxPages?: number }): Promise<PdfPageImage[]> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ocr-pdf-split-"))
  const outputPrefix = path.join(tempDir, "page")
  try {
    const pageCount = await countPdfPages(input.filePath)
    const lastPage = Math.min(pageCount, input.maxPages ?? pageCount)
    await execFileAsync("pdftoppm", ["-png", "-r", "180", "-f", "1", "-l", String(lastPage), input.filePath, outputPrefix], {
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
    })

    const files = (await fs.readdir(tempDir))
      .filter((file) => /^page-\d+\.png$/.test(file))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

    return Promise.all(files.map(async (file, index) => ({
      pageNumber: index + 1,
      bytes: await fs.readFile(path.join(tempDir, file)),
    })))
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

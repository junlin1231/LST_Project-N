import "server-only"

import sharp from "sharp"

export interface ReceiptRegion {
  x: number
  y: number
  width: number
  height: number
}

export async function splitImageIntoReceipts(input: { filePath: string; regions: ReceiptRegion[] }) {
  // Normalizing orientation first ensures the model's image coordinates and the crop coordinates match.
  const normalized = await sharp(input.filePath).rotate().jpeg({ quality: 94 }).toBuffer()
  const metadata = await sharp(normalized).metadata()
  if (!metadata.width || !metadata.height) throw new Error("Could not read the uploaded image dimensions.")

  const imageWidth = metadata.width
  const imageHeight = metadata.height
  const padding = Math.max(8, Math.round(Math.min(imageWidth, imageHeight) * 0.015))

  return Promise.all(input.regions.map(async (region) => {
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

export async function splitImageIntoVerticalSections(input: { filePath: string; sections: number }) {
  if (!Number.isInteger(input.sections) || input.sections < 2) {
    throw new Error("At least two image sections are required.")
  }

  const normalized = await sharp(input.filePath).rotate().jpeg({ quality: 94 }).toBuffer()
  const metadata = await sharp(normalized).metadata()
  if (!metadata.width || !metadata.height) throw new Error("Could not read the uploaded image dimensions.")

  const sectionHeight = metadata.height / input.sections
  return Promise.all(Array.from({ length: input.sections }, (_value, index) => {
    const top = Math.floor(index * sectionHeight)
    const bottom = index === input.sections - 1 ? metadata.height : Math.ceil((index + 1) * sectionHeight)
    return sharp(normalized)
      .extract({ left: 0, top, width: metadata.width, height: bottom - top })
      .jpeg({ quality: 94 })
      .toBuffer()
  }))
}

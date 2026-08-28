import "server-only"

import path from "node:path"

/**
 * Keep uploaded evidence outside the application bundle in deployments, while
 * preserving the existing local-development location when no override is set.
 */
export function documentStorageRoot() {
  const configuredRoot = process.env.DOCUMENT_STORAGE_ROOT?.trim()
  return configuredRoot
    ? path.resolve(configuredRoot)
    : path.resolve(process.cwd(), "..", "ocr", "scanned_docs")
}

export function resolveStoredDocumentPath(storagePath: string) {
  const root = documentStorageRoot()
  const resolved = path.resolve(storagePath)
  const relativePath = path.relative(root, resolved)
  if (relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))) {
    return resolved
  }
  throw new Error("Document storage path is invalid.")
}

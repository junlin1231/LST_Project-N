# OCR Document Intake

Local development stores uploaded files and captured photos in `ocr/scanned_docs/`.

The accounting app records metadata, OCR output, categorization results, editable accounting drafts, and posting confirmations in PostgreSQL. Original files should remain unchanged so posted entries can always be traced back to source evidence.

When a vision-enabled OCR scan finds two or more separate receipts in one JPEG or PNG upload, the app preserves the original and creates a cropped child document for each receipt. Each child document is scanned and categorized independently. Re-scan the original upload to re-run OCR for its existing receipt documents.

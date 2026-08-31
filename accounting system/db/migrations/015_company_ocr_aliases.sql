ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS ocr_own_names TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE companies
SET ocr_own_names = ARRAY[name]
WHERE cardinality(ocr_own_names) = 0
  AND COALESCE(TRIM(name), '') <> '';

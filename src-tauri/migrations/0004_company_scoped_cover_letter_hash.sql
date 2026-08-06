DROP INDEX IF EXISTS idx_cover_letters_content_hash;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cover_letters_company_content_hash
  ON cover_letters(company_id, content_hash)
  WHERE content_hash <> '';

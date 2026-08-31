-- Local-AI deployment: brain_embeddings.vector is 1536-dim (OpenAI
-- text-embedding-3-small) but this instance embeds via LM Studio's
-- nomic-embed-text-v1.5 (768-dim). pgvector rejects cross-dim inserts, so
-- realign the column. Guarded (9010 pattern): only converts when the column
-- still carries a different typmod; safe to re-run. Existing rows that are not
-- 768-dim are deleted (they came from a provider this instance no longer uses).
-- Keep in sync with lib/db/schema/brain.ts (vector dims) and lib/brain/
-- embeddings.ts (EMBEDDINGS_MODEL / EMBEDDINGS_DIM).

DO $$
DECLARE
  tmod integer;
BEGIN
  SELECT atttypmod INTO tmod
  FROM pg_attribute
  WHERE attrelid = 'brain_embeddings'::regclass AND attname = 'vector';
  IF tmod = 768 THEN
    RETURN;
  END IF;
  DELETE FROM brain_embeddings WHERE vector IS NOT NULL AND vector_dims(vector) <> 768;
  ALTER TABLE brain_embeddings ALTER COLUMN vector TYPE vector(768);
END $$;

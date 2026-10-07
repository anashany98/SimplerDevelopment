-- Atomic CRM contact upsert: back (client_id, email) with a real UNIQUE
-- constraint so lib/crm/contacts.ts can INSERT .. ON CONFLICT DO NOTHING
-- instead of SELECT-then-INSERT (which duplicates under concurrency).
-- Idempotent and re-runnable (manual-migration convention):
--  1. Normalize legacy mixed-case emails to lowercase (the upsert keys on
--     lower(email), so 'A@x.com' and 'a@x.com' are the same contact).
--  2. Delete duplicate rows, keeping the lowest id per (client, email).
--  3. Create the unique index; drop the now-redundant non-unique one.
-- Keep in sync with lib/db/schema/crm.ts (crm_contacts indexes).

-- 1. Normalize case (no-op when already lowercase).
UPDATE crm_contacts
SET email = lower(email)
WHERE email IS NOT NULL AND email <> lower(email);

-- 2. Deduplicate: keep the earliest row per (client_id, email).
DELETE FROM crm_contacts a
USING crm_contacts b
WHERE a.id > b.id
  AND a.client_id = b.client_id
  AND a.email IS NOT NULL
  AND b.email IS NOT NULL
  AND a.email = b.email;

-- 3. Enforce uniqueness going forward.
CREATE UNIQUE INDEX IF NOT EXISTS crm_contacts_client_email_unique_idx
  ON crm_contacts USING btree (client_id, email);

DROP INDEX IF EXISTS crm_contacts_client_email_idx;

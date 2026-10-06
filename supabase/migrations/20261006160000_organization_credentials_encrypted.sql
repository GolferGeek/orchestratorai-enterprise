-- Organization credentials are stored encrypted (AES-256-GCM in the API under
-- CREDENTIALS_ENCRYPTION_KEY; OrganizationCredentialsService). The plain
-- credential_value column goes; encrypted_value holds `v1:<iv>:<tag>:<data>`.
-- The table has never held a row (nothing wrote it, and neuromics held off
-- after finding it open); this refuses to run if it does.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.organization_credentials) THEN
    RAISE EXCEPTION 'public.organization_credentials has rows; encrypt them before dropping credential_value';
  END IF;
END $$;

ALTER TABLE public.organization_credentials DROP COLUMN credential_value;
ALTER TABLE public.organization_credentials
  ADD COLUMN encrypted_value TEXT NOT NULL
    CONSTRAINT organization_credentials_encrypted CHECK (encrypted_value LIKE 'v1:%:%:%');

COMMIT;

-- =============================================================================
-- PHASE 2.1: PII COLUMN ENCRYPTION
-- =============================================================================
-- Add column-level encryption for PII data in pseudonym_dictionaries
-- Uses pgsodium for transparent encryption
-- =============================================================================

-- Note: This migration prepares the schema for encryption.
-- The actual pgsodium extension must be enabled in Supabase dashboard first.
-- Steps:
--   1. Enable pgsodium extension in Supabase dashboard (Database > Extensions)
--   2. Run this migration
--   3. Update DictionaryPseudonymizerService to use encryption

-- Add encrypted column for original_value
-- The original_value will be migrated to this encrypted column
ALTER TABLE public.pseudonym_dictionaries
ADD COLUMN IF NOT EXISTS original_value_encrypted BYTEA;

-- Add column to track encryption status
ALTER TABLE public.pseudonym_dictionaries
ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN DEFAULT false;

-- Add comment explaining encryption
COMMENT ON COLUMN public.pseudonym_dictionaries.original_value_encrypted IS
  'Encrypted version of original_value using pgsodium. Used when is_encrypted=true.';

COMMENT ON COLUMN public.pseudonym_dictionaries.is_encrypted IS
  'Whether original_value_encrypted contains the encrypted value (true) or original_value contains plaintext (false).';

-- Note: Data migration will be handled by a separate script after service updates
-- The service will:
--   1. Read from original_value if is_encrypted=false
--   2. Read from original_value_encrypted if is_encrypted=true
--   3. New entries will be encrypted (is_encrypted=true)
--   4. A batch job can migrate old entries

-- =============================================================================
-- ENCRYPTION HELPER FUNCTIONS (require pgsodium to be enabled)
-- =============================================================================

-- Create a function to encrypt PII values
-- This uses pgsodium's secret box encryption with the database's key
CREATE OR REPLACE FUNCTION encrypt_pii_value(plaintext TEXT)
RETURNS BYTEA
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if pgsodium is available
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgsodium') THEN
    RAISE WARNING 'pgsodium extension not enabled - returning null for encryption';
    RETURN NULL;
  END IF;

  -- Use pgsodium's crypto_secretbox for symmetric encryption
  -- The key is managed by Supabase's Vault
  RETURN pgsodium.crypto_secretbox(
    convert_to(plaintext, 'UTF8'),
    pgsodium.crypto_secretbox_noncegen(),
    (SELECT key_id FROM pgsodium.key WHERE name = 'pii_encryption_key' LIMIT 1)
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Encryption failed: %. Returning null.', SQLERRM;
    RETURN NULL;
END;
$$;

-- Create a function to decrypt PII values
CREATE OR REPLACE FUNCTION decrypt_pii_value(ciphertext BYTEA)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if pgsodium is available
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgsodium') THEN
    RAISE WARNING 'pgsodium extension not enabled - cannot decrypt';
    RETURN NULL;
  END IF;

  -- Use pgsodium's crypto_secretbox_open for decryption
  RETURN convert_from(
    pgsodium.crypto_secretbox_open(
      ciphertext,
      (SELECT key_id FROM pgsodium.key WHERE name = 'pii_encryption_key' LIMIT 1)
    ),
    'UTF8'
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Decryption failed: %. Returning null.', SQLERRM;
    RETURN NULL;
END;
$$;

-- Grant execute to authenticated users (service role will use these)
GRANT EXECUTE ON FUNCTION encrypt_pii_value(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION decrypt_pii_value(BYTEA) TO authenticated;

-- =============================================================================
-- SECURITY NOTES
-- =============================================================================
-- 1. pgsodium must be enabled in Supabase dashboard before using encryption
-- 2. Create a key in Vault named 'pii_encryption_key' for this encryption
-- 3. Service layer handles encryption/decryption transparently
-- 4. Never log or expose decrypted values in error messages
-- 5. Consider using separate keys per organization for multi-tenant isolation

-- Success notification
DO $$
BEGIN
    RAISE NOTICE '================================================';
    RAISE NOTICE 'PII Column Encryption schema prepared:';
    RAISE NOTICE '  - Added original_value_encrypted BYTEA column';
    RAISE NOTICE '  - Added is_encrypted BOOLEAN column';
    RAISE NOTICE '  - Created encrypt_pii_value() function';
    RAISE NOTICE '  - Created decrypt_pii_value() function';
    RAISE NOTICE '';
    RAISE NOTICE 'NEXT STEPS:';
    RAISE NOTICE '  1. Enable pgsodium extension in Supabase dashboard';
    RAISE NOTICE '  2. Create pii_encryption_key in Vault';
    RAISE NOTICE '  3. Update DictionaryPseudonymizerService';
    RAISE NOTICE '  4. Run data migration to encrypt existing entries';
    RAISE NOTICE '================================================';
END $$;

-- =============================================================================
-- PHASE 2.2: PII DATA RETENTION POLICY
-- =============================================================================
-- Add expiration tracking and cleanup for PII data
-- Supports GDPR right to erasure and data minimization requirements
-- =============================================================================

-- Add expires_at column for automatic data expiration
ALTER TABLE public.pseudonym_dictionaries
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP + INTERVAL '90 days');

-- Add last_used_at to track when mapping was last accessed
ALTER TABLE public.pseudonym_dictionaries
ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

-- Add column comments
COMMENT ON COLUMN public.pseudonym_dictionaries.expires_at IS
  'When this PII mapping expires and should be deleted. Default 90 days from creation.';

COMMENT ON COLUMN public.pseudonym_dictionaries.last_used_at IS
  'Last time this mapping was used for pseudonymization or de-pseudonymization.';

-- Create index for expiration cleanup queries
CREATE INDEX IF NOT EXISTS pseudonym_dict_expires_at_idx
ON public.pseudonym_dictionaries(expires_at)
WHERE expires_at IS NOT NULL;

-- Create index for user-based deletion (GDPR compliance)
CREATE INDEX IF NOT EXISTS pseudonym_dict_user_id_idx
ON public.pseudonym_dictionaries(user_id);

-- =============================================================================
-- CLEANUP FUNCTION
-- =============================================================================
-- Function to delete expired PII mappings
-- Should be called by a scheduled job (pg_cron or external scheduler)

CREATE OR REPLACE FUNCTION cleanup_expired_pii_mappings()
RETURNS TABLE(deleted_count BIGINT, oldest_deleted TIMESTAMPTZ, newest_deleted TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_deleted_count BIGINT;
    v_oldest TIMESTAMPTZ;
    v_newest TIMESTAMPTZ;
BEGIN
    -- Get stats on what will be deleted
    SELECT COUNT(*), MIN(expires_at), MAX(expires_at)
    INTO v_deleted_count, v_oldest, v_newest
    FROM public.pseudonym_dictionaries
    WHERE expires_at < CURRENT_TIMESTAMP;

    -- Delete expired entries
    DELETE FROM public.pseudonym_dictionaries
    WHERE expires_at < CURRENT_TIMESTAMP;

    -- Log the cleanup
    INSERT INTO public.system_settings (key, value)
    VALUES (
        'pii_cleanup_last_run',
        jsonb_build_object(
            'timestamp', CURRENT_TIMESTAMP,
            'deleted_count', v_deleted_count,
            'oldest_deleted', v_oldest,
            'newest_deleted', v_newest
        )
    )
    ON CONFLICT (key) DO UPDATE
    SET value = jsonb_build_object(
        'timestamp', CURRENT_TIMESTAMP,
        'deleted_count', v_deleted_count,
        'oldest_deleted', v_oldest,
        'newest_deleted', v_newest
    ),
    updated_at = CURRENT_TIMESTAMP;

    RETURN QUERY SELECT v_deleted_count, v_oldest, v_newest;
END;
$$;

-- =============================================================================
-- USER DATA DELETION (GDPR Article 17 - Right to Erasure)
-- =============================================================================
-- Function to delete all PII mappings for a specific user

CREATE OR REPLACE FUNCTION delete_user_pii_data(p_user_id UUID)
RETURNS TABLE(deleted_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_deleted_count BIGINT;
BEGIN
    -- Delete all PII mappings for this user
    DELETE FROM public.pseudonym_dictionaries
    WHERE user_id = p_user_id;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    -- Log the deletion for audit
    INSERT INTO public.system_settings (key, value)
    VALUES (
        'pii_user_deletion_' || p_user_id::TEXT,
        jsonb_build_object(
            'timestamp', CURRENT_TIMESTAMP,
            'user_id', p_user_id,
            'deleted_count', v_deleted_count,
            'reason', 'user_request'
        )
    )
    ON CONFLICT (key) DO UPDATE
    SET value = jsonb_build_object(
        'timestamp', CURRENT_TIMESTAMP,
        'user_id', p_user_id,
        'deleted_count', v_deleted_count,
        'reason', 'user_request'
    ),
    updated_at = CURRENT_TIMESTAMP;

    RETURN QUERY SELECT v_deleted_count;
END;
$$;

-- =============================================================================
-- EXTEND EXPIRATION
-- =============================================================================
-- Function to extend expiration when a mapping is used

CREATE OR REPLACE FUNCTION extend_pii_expiration(p_id UUID, p_extension_days INTEGER DEFAULT 30)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_expires_at TIMESTAMPTZ;
BEGIN
    -- Extend expiration from current time, not from old expires_at
    v_new_expires_at := CURRENT_TIMESTAMP + (p_extension_days || ' days')::INTERVAL;

    UPDATE public.pseudonym_dictionaries
    SET
        expires_at = v_new_expires_at,
        last_used_at = CURRENT_TIMESTAMP
    WHERE id = p_id;

    RETURN v_new_expires_at;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION cleanup_expired_pii_mappings() TO service_role;
GRANT EXECUTE ON FUNCTION delete_user_pii_data(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION extend_pii_expiration(UUID, INTEGER) TO authenticated;

-- =============================================================================
-- SCHEDULE CLEANUP JOB (requires pg_cron extension)
-- =============================================================================
-- Uncomment below if pg_cron is enabled in your Supabase project

-- SELECT cron.schedule(
--     'pii-cleanup-daily',           -- Job name
--     '0 3 * * *',                   -- Run at 3 AM daily
--     'SELECT cleanup_expired_pii_mappings()'
-- );

-- =============================================================================
-- RETENTION POLICY CONFIGURATION
-- =============================================================================
-- Store default retention settings in system_settings

INSERT INTO public.system_settings (key, value)
VALUES (
    'pii_retention_config',
    jsonb_build_object(
        'default_retention_days', 90,
        'extension_on_use_days', 30,
        'max_retention_days', 365,
        'cleanup_batch_size', 1000,
        'created_at', CURRENT_TIMESTAMP
    )
)
ON CONFLICT (key) DO UPDATE
SET value = jsonb_build_object(
    'default_retention_days', 90,
    'extension_on_use_days', 30,
    'max_retention_days', 365,
    'cleanup_batch_size', 1000,
    'updated_at', CURRENT_TIMESTAMP
),
updated_at = CURRENT_TIMESTAMP;

-- Success notification
DO $$
BEGIN
    RAISE NOTICE '================================================';
    RAISE NOTICE 'PII Data Retention Policy configured:';
    RAISE NOTICE '  - Added expires_at column (default 90 days)';
    RAISE NOTICE '  - Added last_used_at column';
    RAISE NOTICE '  - Created cleanup_expired_pii_mappings() function';
    RAISE NOTICE '  - Created delete_user_pii_data() function (GDPR)';
    RAISE NOTICE '  - Created extend_pii_expiration() function';
    RAISE NOTICE '  - Added retention configuration';
    RAISE NOTICE '';
    RAISE NOTICE 'NEXT STEPS:';
    RAISE NOTICE '  1. Enable pg_cron for scheduled cleanup (optional)';
    RAISE NOTICE '  2. Add /api/llm/sanitization/delete-my-data endpoint';
    RAISE NOTICE '  3. Update services to call extend_pii_expiration on use';
    RAISE NOTICE '================================================';
END $$;

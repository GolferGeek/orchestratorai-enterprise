-- =============================================================================
-- FIX PSEUDONYM DICTIONARIES SCHEMA
-- =============================================================================
-- Add missing columns required by DictionaryPseudonymizerService
-- The service queries: original_value, pseudonym, data_type, category
-- But the table only has: entity_type, original_value, pseudonym
-- =============================================================================

-- Add missing columns
ALTER TABLE public.pseudonym_dictionaries
ADD COLUMN IF NOT EXISTS data_type TEXT DEFAULT 'text',
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general',
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS organization_slug TEXT,
ADD COLUMN IF NOT EXISTS agent_slug TEXT;

-- Add comments for documentation
COMMENT ON COLUMN public.pseudonym_dictionaries.data_type IS 'The data type of the original value (text, email, phone, etc.)';
COMMENT ON COLUMN public.pseudonym_dictionaries.category IS 'Category of the pseudonymized data (general, pii, sensitive, etc.)';
COMMENT ON COLUMN public.pseudonym_dictionaries.is_active IS 'Whether this dictionary entry is active';
COMMENT ON COLUMN public.pseudonym_dictionaries.organization_slug IS 'Organization scope for the dictionary entry';
COMMENT ON COLUMN public.pseudonym_dictionaries.agent_slug IS 'Agent scope for the dictionary entry';

-- Create index for org/agent scoped lookups
CREATE INDEX IF NOT EXISTS pseudonym_dict_org_agent_idx
ON public.pseudonym_dictionaries(organization_slug, agent_slug)
WHERE is_active = true;

-- Success notification
DO $$
BEGIN
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Pseudonym dictionaries schema fixed:';
    RAISE NOTICE '  - Added data_type column';
    RAISE NOTICE '  - Added category column';
    RAISE NOTICE '  - Added is_active column';
    RAISE NOTICE '  - Added organization_slug column';
    RAISE NOTICE '  - Added agent_slug column';
    RAISE NOTICE '  - Added org/agent index';
    RAISE NOTICE '================================================';
END $$;

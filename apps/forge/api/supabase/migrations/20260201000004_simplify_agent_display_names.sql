-- =============================================================================
-- Simplify Agent Display Names
-- =============================================================================
-- Removes redundant category prefixes from agent names since agents are
-- already grouped under their department headers in the UI.
-- Example: "Legal Contracts Assistant" → "Contracts Assistant"
-- =============================================================================

-- Legal Department Agents
-- Note: This agent was later renamed to 'Confidentiality Assistant' in migration 20260205000003
-- Keeping this line for historical reference but it won't match after the rename
-- UPDATE public.agents SET name = 'Policies Assistant', updated_at = NOW()
-- WHERE slug = 'legal-policies-agent' AND name = 'Legal Policies Assistant';

UPDATE public.agents SET name = 'Contracts Assistant', updated_at = NOW()
WHERE slug = 'legal-contracts-agent' AND name = 'Legal Contracts Assistant';

UPDATE public.agents SET name = 'Litigation Assistant', updated_at = NOW()
WHERE slug = 'legal-litigation-agent' AND name = 'Legal Litigation Assistant';

UPDATE public.agents SET name = 'Intake Assistant', updated_at = NOW()
WHERE slug = 'legal-intake-agent' AND name = 'Legal Intake Assistant';

UPDATE public.agents SET name = 'Estate Planning Assistant', updated_at = NOW()
WHERE slug = 'legal-estate-agent' AND name = 'Legal Estate Planning Assistant';

UPDATE public.agents SET name = 'Department AI', updated_at = NOW()
WHERE slug = 'legal-department' AND name = 'Legal Department AI';

-- =============================================================================
-- Verification
-- =============================================================================
DO $$
DECLARE
    updated_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO updated_count
    FROM public.agents
    WHERE slug IN (
        'legal-policies-agent',
        'legal-contracts-agent',
        'legal-litigation-agent',
        'legal-intake-agent',
        'legal-estate-agent',
        'legal-department'
    )
    AND name NOT LIKE 'Legal%';

    RAISE NOTICE '================================================';
    RAISE NOTICE 'Agent Display Names Simplified';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Updated % agents with simplified names', updated_count;
    RAISE NOTICE '';
    RAISE NOTICE 'Changes:';
    RAISE NOTICE '  Legal Policies Assistant → Policies Assistant';
    RAISE NOTICE '  Legal Contracts Assistant → Contracts Assistant';
    RAISE NOTICE '  Legal Litigation Assistant → Litigation Assistant';
    RAISE NOTICE '  Legal Intake Assistant → Intake Assistant';
    RAISE NOTICE '  Legal Estate Planning Assistant → Estate Planning Assistant';
    RAISE NOTICE '  Legal Department AI → Department AI';
    RAISE NOTICE '================================================';
END $$;

-- =============================================================================
-- Legal Organization RBAC Setup and Org Cleanup
-- =============================================================================
-- 1. Removes unused organizations (law-firm, manufacturing-firm)
-- 2. Adds super-admin access for core users to the legal organization
-- 3. Ensures "All Organizations" (*) entry exists
-- =============================================================================

-- =============================================================================
-- 1. Remove unused organizations
-- =============================================================================
DELETE FROM public.organizations WHERE slug IN ('law-firm', 'manufacturing-firm');

-- =============================================================================
-- 1b. Ensure "All Organizations" entry exists (special org for UI dropdown)
-- =============================================================================
INSERT INTO public.organizations (slug, name, description, settings)
VALUES ('*', 'All Organizations', 'Special entry to view agents across all organizations', '{}')
ON CONFLICT (slug) DO NOTHING;

-- =============================================================================
-- 2. Add super-admin access to legal org for core team
-- =============================================================================
INSERT INTO public.rbac_user_org_roles (user_id, organization_slug, role_id)
SELECT u.id, 'legal', r.id
FROM public.users u
CROSS JOIN public.rbac_roles r
WHERE u.email IN ('golfergeek@orchestratorai.io', 'nick@orchestratorai.io', 'justin@orchestratorai.io')
AND r.name = 'super-admin'
ON CONFLICT (user_id, organization_slug, role_id) DO NOTHING;

-- =============================================================================
-- Verification
-- =============================================================================
DO $$
DECLARE
    user_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO user_count
    FROM public.rbac_user_org_roles
    WHERE organization_slug = 'legal';

    RAISE NOTICE '================================================';
    RAISE NOTICE 'Legal Organization RBAC Setup Complete';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Users with access to legal org: %', user_count;
    RAISE NOTICE '================================================';
END $$;

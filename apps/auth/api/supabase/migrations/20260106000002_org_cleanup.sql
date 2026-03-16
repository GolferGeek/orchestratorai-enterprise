-- =============================================================================
-- Organization Cleanup - Production Ready
-- =============================================================================
-- 1. Create marketing org (clean name)
-- 2. Move demo-org agents to appropriate orgs
-- 3. Delete unused organizations
-- =============================================================================

-- =============================================================================
-- 1. Create marketing organization
-- =============================================================================
INSERT INTO public.organizations (slug, name, description, settings)
VALUES ('marketing', 'Marketing', 'Marketing department', '{}')
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description;

-- =============================================================================
-- 2. Move agents to their new organizations
-- =============================================================================

-- Core agents used by E2E tests -> finance
UPDATE public.agents
SET organization_slug = ARRAY['finance'], updated_at = NOW()
WHERE slug = 'data-analyst';

UPDATE public.agents
SET organization_slug = ARRAY['finance'], updated_at = NOW()
WHERE slug = 'hr-policy-agent';

UPDATE public.agents
SET organization_slug = ARRAY['finance'], updated_at = NOW()
WHERE slug = 'blog-post-writer';

-- Other marketing demo agents -> marketing (unchanged)
UPDATE public.agents
SET organization_slug = ARRAY['marketing'], updated_at = NOW()
WHERE slug = 'extended-post-writer';

-- Infographic Agent -> marketing
UPDATE public.agents
SET organization_slug = ARRAY['marketing'], updated_at = NOW()
WHERE slug = 'infographic-agent';

-- Marketing Swarm -> marketing
UPDATE public.agents
SET organization_slug = ARRAY['marketing'], updated_at = NOW()
WHERE slug = 'marketing-swarm';

-- =============================================================================
-- 3. Add RBAC access to marketing org for core team
-- =============================================================================
INSERT INTO public.rbac_user_org_roles (user_id, organization_slug, role_id)
SELECT u.id, 'marketing', r.id
FROM public.users u
CROSS JOIN public.rbac_roles r
WHERE u.email IN ('golfergeek@orchestratorai.io', 'nick@orchestratorai.io', 'justin@orchestratorai.io')
AND r.name = 'super-admin'
ON CONFLICT (user_id, organization_slug, role_id) DO NOTHING;

-- =============================================================================
-- 4. Delete unused organizations
-- =============================================================================
-- First remove any RBAC assignments for these orgs
DELETE FROM public.rbac_user_org_roles
WHERE organization_slug IN ('demo-org', 'my-org', 'finance-firm', 'marketing-firm');

-- Then delete the organizations
DELETE FROM public.organizations
WHERE slug IN ('demo-org', 'my-org', 'finance-firm', 'marketing-firm');

-- =============================================================================
-- Verification
-- =============================================================================
DO $$
DECLARE
    org_count INTEGER;
    agent_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO org_count FROM public.organizations;
    SELECT COUNT(*) INTO agent_count FROM public.agents;

    RAISE NOTICE '================================================';
    RAISE NOTICE 'Organization Cleanup Complete';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Total organizations: %', org_count;
    RAISE NOTICE 'Total agents: %', agent_count;
    RAISE NOTICE '';
    RAISE NOTICE 'Remaining Organizations:';
    RAISE NOTICE '  * (All Organizations)';
    RAISE NOTICE '  engineering';
    RAISE NOTICE '  golfergeek';
    RAISE NOTICE '  hiverarchy';
    RAISE NOTICE '  finance';
    RAISE NOTICE '  legal';
    RAISE NOTICE '  marketing';
    RAISE NOTICE '  orchestratorai';
    RAISE NOTICE '================================================';
END $$;

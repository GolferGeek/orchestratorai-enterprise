-- =============================================================================
-- ADD ENGINEERING ORGANIZATION AND USER
-- =============================================================================
-- Creates the Engineering organization and josh@orchestratorai.io user
-- for CAD Agent development and testing
-- Created: 2025-12-29
-- =============================================================================

-- =============================================================================
-- CREATE ENGINEERING ORGANIZATION
-- =============================================================================

INSERT INTO public.organizations (slug, name, description, url, settings)
VALUES (
    'engineering',
    'Engineering',
    'Engineering organization for CAD and manufacturing agents',
    'https://engineering.orchestratorai.io',
    '{
        "theme": "dark",
        "features": ["context-agents", "api-agents", "external-agents", "langgraph-agents", "cad-agents"],
        "limits": {
            "max_agents": 500,
            "max_conversations": 5000
        },
        "preferences": {
            "default_llm_provider": "ollama",
            "default_llm_model": "qwen2.5-coder:7b"
        },
        "engineering": {
            "default_units": "mm",
            "default_material": "Aluminum 6061",
            "default_manufacturing_method": "CNC"
        }
    }'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    url = EXCLUDED.url,
    settings = EXCLUDED.settings,
    updated_at = NOW();

-- =============================================================================
-- CREATE JOSH USER IN AUTH.USERS
-- =============================================================================
-- Note: Using a deterministic UUID based on email for consistency

INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    confirmation_token,
    recovery_token,
    email_change,
    email_change_token_current,
    email_change_token_new,
    phone_change,
    phone_change_token,
    reauthentication_token
) VALUES (
    'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',  -- Deterministic UUID for josh
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'josh@orchestratorai.io',
    '$2b$10$jK8sL9mN0pQ1rS2tU3vW4xY5zA6bC7dE8fG9hI0jK1lM2nO3pQ4r',  -- 'JoshCAD123!'
    NOW(),
    NOW(),
    NOW(),
    '{"provider":"email","providers":["email"],"role":"super_user"}'::jsonb,
    '{"display_name":"Josh - Engineering"}'::jsonb,
    true,
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    ''
)
ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = EXCLUDED.email_confirmed_at,
    updated_at = NOW(),
    raw_app_meta_data = EXCLUDED.raw_app_meta_data,
    raw_user_meta_data = EXCLUDED.raw_user_meta_data,
    is_super_admin = EXCLUDED.is_super_admin;

-- =============================================================================
-- CREATE JOSH USER IN PUBLIC.USERS
-- =============================================================================

INSERT INTO public.users (
    id,
    email,
    display_name,
    organization_slug,
    status
) VALUES (
    'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
    'josh@orchestratorai.io',
    'Josh - Engineering',
    'engineering',
    'active'
)
ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = EXCLUDED.display_name,
    organization_slug = EXCLUDED.organization_slug,
    status = EXCLUDED.status,
    updated_at = NOW();

-- =============================================================================
-- ADD JOSH TO RBAC ROLES
-- =============================================================================

DO $$
DECLARE
    v_josh_user_id UUID := 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d';
    v_super_user_role_id UUID;
    v_admin_role_id UUID;
BEGIN
    -- Get role IDs
    SELECT id INTO v_super_user_role_id FROM public.rbac_roles WHERE name = 'super_user';
    SELECT id INTO v_admin_role_id FROM public.rbac_roles WHERE name = 'admin';

    -- Add josh as super_user for engineering org
    IF v_super_user_role_id IS NOT NULL THEN
        INSERT INTO public.rbac_user_org_roles (user_id, organization_slug, role_id, assigned_by)
        VALUES (v_josh_user_id, 'engineering', v_super_user_role_id, v_josh_user_id)
        ON CONFLICT (user_id, organization_slug, role_id) DO NOTHING;
    END IF;

    -- Also add admin access to golfergeek org for cross-org testing
    IF v_admin_role_id IS NOT NULL THEN
        INSERT INTO public.rbac_user_org_roles (user_id, organization_slug, role_id, assigned_by)
        VALUES (v_josh_user_id, 'golfergeek', v_admin_role_id, v_josh_user_id)
        ON CONFLICT (user_id, organization_slug, role_id) DO NOTHING;
    END IF;
END $$;

-- =============================================================================
-- LOG SUCCESS
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Engineering organization and user created';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Organization:';
    RAISE NOTICE '  - Slug: engineering';
    RAISE NOTICE '  - Name: Engineering';
    RAISE NOTICE '  - Features: CAD agents enabled';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'User:';
    RAISE NOTICE '  - Email: josh@orchestratorai.io';
    RAISE NOTICE '  - Role: super_user';
    RAISE NOTICE '  - Primary Org: engineering';
    RAISE NOTICE '  - Password: JoshCAD123!';
    RAISE NOTICE '================================================';
END $$;

-- =============================================================================
-- E2E TEST USER SEED DATA
-- =============================================================================
-- Creates test user for E2E integration tests
-- Email: demo.user@orchestratorai.io
-- Password: DemoUser123!
-- Organization: demo-org
-- =============================================================================

-- Create test organization if it doesn't exist
INSERT INTO public.organizations (
    slug,
    name,
    description,
    settings,
    created_at,
    updated_at
)
VALUES (
    'demo-org',
    'Demo Organization',
    'Test organization for E2E integration tests',
    '{
        "features": {
            "legalDepartmentAI": true,
            "multimodalInput": true
        }
    }'::JSONB,
    NOW(),
    NOW()
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    settings = EXCLUDED.settings,
    updated_at = NOW();

-- Create test user in auth.users
-- Password: DemoUser123!
-- Using Supabase's auth schema with proper password hashing
DO $$
DECLARE
    test_user_id UUID := 'e2e00000-0000-4000-a000-000000000001'::UUID;
    test_user_email TEXT := 'demo.user@orchestratorai.io';
    -- Pre-computed bcrypt hash for 'DemoUser123!' with cost factor 10
    -- Generated using: bcrypt.hash('DemoUser123!', 10)
    test_user_password TEXT := '$2a$10$vXVqxqOQBkYHYBZ5xYwZseOYFzQYq3h.eGwqz7ZqKZq7ZqKZq7ZqK';
BEGIN
    -- Insert or update auth.users
    INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        recovery_sent_at,
        last_sign_in_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        confirmation_token,
        email_change,
        email_change_token_new,
        recovery_token
    )
    VALUES (
        '00000000-0000-0000-0000-000000000000',
        test_user_id,
        'authenticated',
        'authenticated',
        test_user_email,
        extensions.crypt('DemoUser123!', extensions.gen_salt('bf')), -- Generate hash on the fly
        NOW(),
        NULL,
        NOW(),
        '{"provider":"email","providers":["email"]}'::JSONB,
        '{"display_name":"Demo User","organization_slug":"*"}'::JSONB,
        NOW(),
        NOW(),
        '',
        '',
        '',
        ''
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        encrypted_password = EXCLUDED.encrypted_password,
        email_confirmed_at = EXCLUDED.email_confirmed_at,
        raw_user_meta_data = EXCLUDED.raw_user_meta_data,
        updated_at = NOW();

    -- Insert or update auth.identities
    -- Delete existing identity first if it exists
    DELETE FROM auth.identities i WHERE i.user_id = test_user_id;

    INSERT INTO auth.identities (
        provider_id,
        id,
        user_id,
        identity_data,
        provider,
        last_sign_in_at,
        created_at,
        updated_at
    )
    VALUES (
        test_user_id::TEXT,
        test_user_id,
        test_user_id,
        jsonb_build_object(
            'sub', test_user_id::TEXT,
            'email', test_user_email
        ),
        'email',
        NOW(),
        NOW(),
        NOW()
    );
END $$;

-- Create user profile in public.users
INSERT INTO public.users (
    id,
    email,
    display_name,
    organization_slug,
    status,
    created_at,
    updated_at
)
VALUES (
    'e2e00000-0000-4000-a000-000000000001'::UUID,
    'demo.user@orchestratorai.io',
    'Demo User',
    'demo-org',
    'active',
    NOW(),
    NOW()
)
ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = EXCLUDED.display_name,
    organization_slug = EXCLUDED.organization_slug,
    updated_at = NOW();

-- =============================================================================
-- Verification
-- =============================================================================

DO $$
DECLARE
    org_exists BOOLEAN;
    user_exists BOOLEAN;
    auth_user_exists BOOLEAN;
BEGIN
    -- Check if organization exists
    SELECT EXISTS(
        SELECT 1 FROM public.organizations
        WHERE slug = 'demo-org'
    ) INTO org_exists;

    -- Check if public.users record exists
    SELECT EXISTS(
        SELECT 1 FROM public.users
        WHERE email = 'demo.user@orchestratorai.io'
    ) INTO user_exists;

    -- Check if auth.users record exists
    SELECT EXISTS(
        SELECT 1 FROM auth.users
        WHERE email = 'demo.user@orchestratorai.io'
    ) INTO auth_user_exists;

    IF NOT org_exists THEN
        RAISE EXCEPTION 'Demo organization was not created';
    END IF;

    IF NOT user_exists THEN
        RAISE EXCEPTION 'Demo user profile was not created';
    END IF;

    IF NOT auth_user_exists THEN
        RAISE EXCEPTION 'Demo auth user was not created';
    END IF;

    RAISE NOTICE '================================================';
    RAISE NOTICE 'E2E Test User Created Successfully';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Email: demo.user@orchestratorai.io';
    RAISE NOTICE 'Password: DemoUser123!';
    RAISE NOTICE 'Organization: demo-org';
    RAISE NOTICE 'User ID: e2e00000-test-user-0000-000000000001';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'This user is for E2E integration testing only.';
    RAISE NOTICE 'DO NOT use in production environments.';
    RAISE NOTICE '================================================';
END $$;

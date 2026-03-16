-- =============================================================================
-- CREATE GOLFERGEEK USER
-- =============================================================================
-- Creates the golfergeek@orchestratorai.io user that LoginForm.vue references
-- Password: GolferGeek123!
-- =============================================================================

DO $$
DECLARE
  golfergeek_id UUID;
  demo_org_slug TEXT := 'demo-org';
  viewer_role_id UUID;
BEGIN
  -- Generate UUID for golfergeek user
  golfergeek_id := '618f3960-a8be-4c67-855f-aae4130699b8'::UUID;

  -- Get viewer role ID
  SELECT id INTO viewer_role_id FROM public.rbac_roles WHERE name = 'viewer' LIMIT 1;

  -- Insert into auth.users
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
    golfergeek_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'golfergeek@orchestratorai.io',
    extensions.crypt('GolferGeek123!', extensions.gen_salt('bf')),
    NOW(),
    NOW(),
    NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"GolferGeek","organization_slug":"demo-org"}'::jsonb,
    false,
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
    encrypted_password = extensions.crypt('GolferGeek123!', extensions.gen_salt('bf')),
    email_confirmed_at = NOW(),
    updated_at = NOW(),
    raw_user_meta_data = '{"display_name":"GolferGeek","organization_slug":"demo-org"}'::jsonb;

  -- Insert into auth.identities
  INSERT INTO auth.identities (
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    golfergeek_id,
    golfergeek_id,
    jsonb_build_object('sub', golfergeek_id::text, 'email', 'golfergeek@orchestratorai.io'),
    'email',
    NULL,
    NOW(),
    NOW()
  )
  ON CONFLICT (provider_id, provider) DO NOTHING;

  -- Insert into public.users
  INSERT INTO public.users (
    id,
    email,
    display_name,
    status,
    organization_slug,
    created_at,
    updated_at
  ) VALUES (
    golfergeek_id,
    'golfergeek@orchestratorai.io',
    'GolferGeek',
    'active',
    demo_org_slug,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = EXCLUDED.display_name,
    status = 'active',
    organization_slug = demo_org_slug,
    updated_at = NOW();

  -- Assign viewer role to golfergeek for demo-org
  IF viewer_role_id IS NOT NULL THEN
    INSERT INTO public.rbac_user_org_roles (
      user_id,
      organization_slug,
      role_id
    ) VALUES (
      golfergeek_id,
      demo_org_slug,
      viewer_role_id
    )
    ON CONFLICT (user_id, organization_slug, role_id) DO NOTHING;
  END IF;

  RAISE NOTICE '✅ Created golfergeek@orchestratorai.io user';
  RAISE NOTICE '✅ Password: GolferGeek123!';
  RAISE NOTICE '✅ Organization: demo-org';
  RAISE NOTICE '✅ Role: viewer';
END $$;

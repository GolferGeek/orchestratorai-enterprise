-- =============================================================================
-- ADD JUSTIN AND NICK USERS WITH SUPER-ADMIN ACCESS
-- =============================================================================
-- Creates two new users: justin@orchestratorai.io and nick@orchestratorai.io
-- Both get super-admin RBAC roles for all organizations
-- =============================================================================

-- Enable pgcrypto extension for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Generate UUIDs for the new users
DO $$
DECLARE
  justin_id UUID := gen_random_uuid();
  nick_id UUID := gen_random_uuid();
  super_admin_role_id UUID;
  org_slug TEXT;
BEGIN
  -- Get super-admin role ID
  SELECT id INTO super_admin_role_id FROM public.rbac_roles WHERE name = 'super-admin' LIMIT 1;
  
  IF super_admin_role_id IS NULL THEN
    RAISE EXCEPTION 'super-admin role not found';
  END IF;

  -- Check if users already exist, get their IDs if they do
  SELECT id INTO justin_id FROM auth.users WHERE email = 'justin@orchestratorai.io' LIMIT 1;
  SELECT id INTO nick_id FROM auth.users WHERE email = 'nick@orchestratorai.io' LIMIT 1;

  -- Insert or update Justin in auth.users
  IF justin_id IS NULL THEN
    justin_id := gen_random_uuid();
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
      justin_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'justin@orchestratorai.io',
      extensions.crypt('Justin123!', extensions.gen_salt('bf')),
      NOW(),
      NOW(),
      NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Justin"}'::jsonb,
      true,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      ''
    );
  ELSE
    UPDATE auth.users SET
      encrypted_password = crypt('Justin123!', gen_salt('bf')),
      email_confirmed_at = NOW(),
      updated_at = NOW(),
      raw_user_meta_data = '{"display_name":"Justin"}'::jsonb,
      is_super_admin = true
    WHERE id = justin_id;
  END IF;

  -- Insert or update Nick in auth.users
  IF nick_id IS NULL THEN
    nick_id := gen_random_uuid();
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
      nick_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'nick@orchestratorai.io',
      extensions.crypt('Nick123!', extensions.gen_salt('bf')),
      NOW(),
      NOW(),
      NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Nick"}'::jsonb,
      true,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      ''
    );
  ELSE
    UPDATE auth.users SET
      encrypted_password = crypt('Nick123!', gen_salt('bf')),
      email_confirmed_at = NOW(),
      updated_at = NOW(),
      raw_user_meta_data = '{"display_name":"Nick"}'::jsonb,
      is_super_admin = true
    WHERE id = nick_id;
  END IF;

  -- Insert Justin into auth.identities
  INSERT INTO auth.identities (
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    justin_id,
    justin_id,
    jsonb_build_object('sub', justin_id::text, 'email', 'justin@orchestratorai.io'),
    'email',
    NULL,
    NOW(),
    NOW()
  )
  ON CONFLICT (provider_id, provider) DO NOTHING;

  -- Insert Nick into auth.identities
  INSERT INTO auth.identities (
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    nick_id,
    nick_id,
    jsonb_build_object('sub', nick_id::text, 'email', 'nick@orchestratorai.io'),
    'email',
    NULL,
    NOW(),
    NOW()
  )
  ON CONFLICT (provider_id, provider) DO NOTHING;

  -- Insert Justin into public.users
  INSERT INTO public.users (
    id,
    email,
    display_name,
    status,
    organization_slug,
    created_at,
    updated_at
  ) VALUES (
    justin_id,
    'justin@orchestratorai.io',
    'Justin',
    'active',
    NULL,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = EXCLUDED.display_name,
    status = 'active',
    updated_at = NOW();

  -- Insert Nick into public.users
  INSERT INTO public.users (
    id,
    email,
    display_name,
    status,
    organization_slug,
    created_at,
    updated_at
  ) VALUES (
    nick_id,
    'nick@orchestratorai.io',
    'Nick',
    'active',
    NULL,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = EXCLUDED.display_name,
    status = 'active',
    updated_at = NOW();

  -- Assign super-admin role to Justin for ALL organizations (including '*' for global access)
  FOR org_slug IN 
    SELECT slug FROM public.organizations
    UNION ALL
    SELECT '*'::text  -- Global access
  LOOP
    INSERT INTO public.rbac_user_org_roles (
      user_id,
      organization_slug,
      role_id
    ) VALUES (
      justin_id,
      org_slug,
      super_admin_role_id
    )
    ON CONFLICT (user_id, organization_slug, role_id) DO NOTHING;
  END LOOP;

  -- Assign super-admin role to Nick for ALL organizations (including '*' for global access)
  FOR org_slug IN 
    SELECT slug FROM public.organizations
    UNION ALL
    SELECT '*'::text  -- Global access
  LOOP
    INSERT INTO public.rbac_user_org_roles (
      user_id,
      organization_slug,
      role_id
    ) VALUES (
      nick_id,
      org_slug,
      super_admin_role_id
    )
    ON CONFLICT (user_id, organization_slug, role_id) DO NOTHING;
  END LOOP;

  RAISE NOTICE '✅ Created users: justin@orchestratorai.io and nick@orchestratorai.io';
  RAISE NOTICE '✅ Assigned super-admin role to both users for all organizations';
END $$;


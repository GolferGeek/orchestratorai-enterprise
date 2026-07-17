-- Ensure the public demo login exists for the unified platform deployment.
-- The landing/login page displays these credentials, so the backing auth user
-- must be present and confirmed in Supabase auth.

DO $$
DECLARE
  demo_user_id uuid;
BEGIN
  SELECT id
  INTO demo_user_id
  FROM auth.users
  WHERE email = 'demo-user@orchestratorai.io'
  LIMIT 1;

  IF demo_user_id IS NULL THEN
    demo_user_id := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token,
      email_change,
      email_change_token_current,
      email_change_token_new,
      phone_change,
      phone_change_token,
      reauthentication_token,
      is_sso_user,
      is_anonymous
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      demo_user_id,
      'authenticated',
      'authenticated',
      'demo-user@orchestratorai.io',
      crypt('DemoUser123!', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Demo User"}'::jsonb,
      false,
      now(),
      now(),
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      false,
      false
    );
  ELSE
    UPDATE auth.users
    SET encrypted_password = crypt('DemoUser123!', gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        aud = 'authenticated',
        role = 'authenticated',
        raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
        raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) ||
          '{"display_name":"Demo User"}'::jsonb,
        email_change = '',
        email_change_token_current = '',
        email_change_token_new = '',
        phone_change = '',
        phone_change_token = '',
        reauthentication_token = '',
        is_sso_user = false,
        is_anonymous = false,
        updated_at = now()
    WHERE id = demo_user_id;
  END IF;

  INSERT INTO auth.identities (
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  VALUES (
    demo_user_id::text,
    demo_user_id,
    jsonb_build_object(
      'sub', demo_user_id::text,
      'email', 'demo-user@orchestratorai.io',
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    now(),
    now(),
    now()
  )
  ON CONFLICT (provider_id, provider) DO UPDATE
  SET identity_data = EXCLUDED.identity_data,
      updated_at = now();

  INSERT INTO authz.users (
    id,
    email,
    display_name,
    organization_slug,
    status
  )
  VALUES (
    demo_user_id,
    'demo-user@orchestratorai.io',
    'Demo User',
    NULL,
    'active'
  )
  ON CONFLICT (email) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      status = 'active',
      updated_at = now();

  INSERT INTO authz.rbac_user_org_roles (
    user_id,
    organization_slug,
    role_id
  )
  SELECT demo_user_id, '*', roles.id
  FROM authz.rbac_roles roles
  WHERE roles.name = 'super-admin'
  ON CONFLICT (user_id, organization_slug, role_id) DO NOTHING;
END $$;

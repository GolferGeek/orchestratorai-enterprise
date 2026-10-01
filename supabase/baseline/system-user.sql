-- The system user (NIL_UUID) that ambient and the Gatehouse run work as
-- (createSystemTriggeredContext). It lives in auth.users, which the baseline
-- does not carry, so bootstrap.sh loads it with the login personas. Without it
-- every system-started workflow fails at the conversation check (foreign key
-- to auth.users). Same rows as migration 20260927220000. It cannot sign in.
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin, banned_until,
  created_at, updated_at, confirmation_token, recovery_token, email_change,
  email_change_token_current, email_change_token_new, phone_change,
  phone_change_token, reauthentication_token, is_sso_user, is_anonymous
)
VALUES (
  '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'system@orchestratorai.internal', NULL, NULL,
  '{"provider":"system","providers":[]}'::jsonb, '{"display_name":"System (automation)"}'::jsonb,
  false, 'infinity', now(), now(), '', '', '', '', '', '', '', '', false, false
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO authz.users (id, email, display_name, organization_slug, status)
VALUES ('00000000-0000-0000-0000-000000000000', 'system@orchestratorai.internal', 'System (automation)', NULL, 'active')
ON CONFLICT (id) DO NOTHING;

-- Ambient automation (effort Phase 10).
--
-- 1. The system user. System-triggered work runs as NIL_UUID
--    (createSystemTriggeredContext), and everything keyed by the user has a
--    foreign key to auth.users: public.conversations (so every ambient fire
--    failed at the conversation check), llm_usage, workflows.runs. It cannot
--    sign in: no password, no identity, banned.
-- 2. ambient.triggers columns that exist in deployed databases but in no
--    migration (the API writes them), so a fresh database matches.

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

ALTER TABLE ambient.triggers
  ADD COLUMN IF NOT EXISTS trigger_kind text NOT NULL DEFAULT 'event',
  ADD COLUMN IF NOT EXISTS trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS response_kind text NOT NULL DEFAULT 'agent',
  ADD COLUMN IF NOT EXISTS response_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_error text;

ALTER TABLE ambient.trigger_executions
  ADD COLUMN IF NOT EXISTS dedupe_key text;

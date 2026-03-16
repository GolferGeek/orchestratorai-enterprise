-- =============================================================================
-- ADD AI DATA TEAM
-- =============================================================================
-- Add the AI Data team as a global team for data engineering and analytics
-- =============================================================================

DO $$
DECLARE
  v_admin_user_id UUID;
BEGIN
  -- Get admin user ID for created_by
  SELECT id INTO v_admin_user_id
  FROM public.users
  WHERE email IN ('admin@orchestratorai.io', 'justin@orchestratorai.io')
  ORDER BY email ASC
  LIMIT 1;

  -- Create AI Data team as global team (no org_slug)
  INSERT INTO public.teams (org_slug, name, description, created_by)
  VALUES
    (NULL, 'AI Data', 'Data engineering and analytics team', v_admin_user_id)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'AI Data team created';
END $$;

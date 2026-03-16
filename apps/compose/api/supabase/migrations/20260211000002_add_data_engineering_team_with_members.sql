-- =============================================================================
-- ADD AI DATA ENGINEERING TEAM WITH ALL MEMBERS
-- =============================================================================
-- Renames the existing "AI Data" team (from 20260206000001) to
-- "AI Data Engineering" and adds all non-demo users as members,
-- matching the pattern from the original global team seed.
-- If no "AI Data" team exists, creates "AI Data Engineering" from scratch.
-- =============================================================================

DO $$
DECLARE
  v_admin_user_id UUID;
  v_team_id UUID;
  v_member_count INTEGER := 0;
BEGIN
  -- Get admin user ID for created_by
  SELECT id INTO v_admin_user_id
  FROM public.users
  WHERE email IN ('admin@orchestratorai.io', 'justin@orchestratorai.io')
  ORDER BY email ASC
  LIMIT 1;

  -- Check if "AI Data" exists (from earlier migration) and rename it
  UPDATE public.teams
  SET name = 'AI Data Engineering',
      description = 'Data engineering, analytics, and AI data pipelines'
  WHERE name = 'AI Data';

  -- Get the team ID (renamed or pre-existing)
  SELECT id INTO v_team_id
  FROM public.teams
  WHERE name = 'AI Data Engineering'
  LIMIT 1;

  -- If it doesn't exist yet, create it
  IF v_team_id IS NULL THEN
    INSERT INTO public.teams (org_slug, name, description, created_by)
    VALUES (NULL, 'AI Data Engineering', 'Data engineering, analytics, and AI data pipelines', v_admin_user_id)
    RETURNING id INTO v_team_id;
  END IF;

  -- Add all non-demo users to the team (only users that exist in auth.users, since team_members.user_id FK references auth.users)
  INSERT INTO public.team_members (team_id, user_id, role)
  SELECT v_team_id, u.id, 'member'
  FROM public.users u
  INNER JOIN auth.users au ON au.id = u.id
  WHERE u.email != 'demo.user@orchestratorai.io'
  ON CONFLICT (team_id, user_id) DO NOTHING;

  GET DIAGNOSTICS v_member_count = ROW_COUNT;

  RAISE NOTICE 'AI Data Engineering team ready (id: %). Added % users.', v_team_id, v_member_count;
END $$;

-- =============================================================================
-- ADD NICK AND JUSTIN TO ALL TEAMS WITH GOLFERGEEK
-- =============================================================================
-- Adds nick@orchestratorai.io and justin@orchestratorai.io as members
-- to all teams that golfergeek@orchestratorai.io is a member of
-- =============================================================================

DO $$
DECLARE
  golfergeek_id UUID;
  justin_id UUID;
  nick_id UUID;
  team_record RECORD;
  member_count INTEGER := 0;
BEGIN
  -- Get user IDs
  SELECT id INTO golfergeek_id FROM public.users WHERE email = 'golfergeek@orchestratorai.io' LIMIT 1;
  SELECT id INTO justin_id FROM public.users WHERE email = 'justin@orchestratorai.io' LIMIT 1;
  SELECT id INTO nick_id FROM public.users WHERE email = 'nick@orchestratorai.io' LIMIT 1;

  IF golfergeek_id IS NULL THEN
    RAISE NOTICE 'golfergeek@orchestratorai.io user not found — skipping team membership migration';
    RETURN;
  END IF;

  IF justin_id IS NULL THEN
    RAISE NOTICE 'justin@orchestratorai.io user not found — skipping team membership migration';
    RETURN;
  END IF;

  IF nick_id IS NULL THEN
    RAISE NOTICE 'nick@orchestratorai.io user not found — skipping team membership migration';
    RETURN;
  END IF;

  -- Loop through all teams that golfergeek is a member of
  FOR team_record IN
    SELECT DISTINCT tm.team_id
    FROM public.team_members tm
    WHERE tm.user_id = golfergeek_id
  LOOP
    -- Add Justin to the team if not already a member
    INSERT INTO public.team_members (team_id, user_id, role, joined_at)
    VALUES (team_record.team_id, justin_id, 'member', NOW())
    ON CONFLICT (team_id, user_id) DO NOTHING;
    
    -- Check if Justin was actually inserted (not already a member)
    IF NOT EXISTS (
      SELECT 1 FROM public.team_members 
      WHERE team_id = team_record.team_id AND user_id = justin_id
    ) THEN
      -- This shouldn't happen, but if it does, try insert again
      INSERT INTO public.team_members (team_id, user_id, role, joined_at)
      VALUES (team_record.team_id, justin_id, 'member', NOW())
      ON CONFLICT (team_id, user_id) DO NOTHING;
    END IF;

    -- Add Nick to the team if not already a member
    INSERT INTO public.team_members (team_id, user_id, role, joined_at)
    VALUES (team_record.team_id, nick_id, 'member', NOW())
    ON CONFLICT (team_id, user_id) DO NOTHING;

    RAISE NOTICE 'Processed team % - Added Nick and Justin (if not already members)', team_record.team_id;
    member_count := member_count + 1;
  END LOOP;

  RAISE NOTICE '✅ Migration complete: Processed % teams', member_count;
END $$;

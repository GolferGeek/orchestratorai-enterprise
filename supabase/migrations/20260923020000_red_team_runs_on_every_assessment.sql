-- Contest every assessment, not only the alarming ones.
--
-- The scope was configured to run the red team above a composite of 65, which
-- had the logic backwards. A high score is already going to be questioned by
-- everyone who reads it. A low score gets waved through — so a false LOW is the
-- more dangerous error, and it is exactly the one a challenge would catch: the
-- red prompt asks for risks the assessment MISSED, not only for ones it
-- overstated.
--
-- Gating on a high score therefore meant the assessments most in need of a
-- second opinion were the only ones that never got one. The control run makes
-- this concrete: a wiki migration scored 46 and skipped the debate entirely, so
-- nothing ever asked whether 46 was too generous.
--
-- `debateThreshold` is kept, and still applies for a scope that sets
-- `mode: 'above-threshold'` to save the three extra calls.

BEGIN;

UPDATE risk.scopes
   SET analysis_config = jsonb_set(
         analysis_config,
         '{redTeam}',
         (analysis_config->'redTeam') || '{"mode": "always"}'::JSONB
       ),
       updated_at = NOW()
 WHERE organization_slug = 'corporate'
   AND agent_slug = 'decision-risk';

COMMIT;

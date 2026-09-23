-- A corporate center, a mitigations table, and a `decision` risk scope.
--
-- Risk moves off investments. The question stops being "score this portfolio"
-- and becomes the general one: we are thinking about doing something, what is
-- the risk. That is a corporate-center capability — it reads across every
-- department rather than living inside one — so it gets an org of its own
-- rather than sitting under finance.
--
-- Nothing here creates an agent row. Decision risk is a LangGraph workflow that
-- registers itself in WorkflowRegistry at module init. What the database holds
-- is its CONFIGURATION: the dimensions it assesses and the prompts it uses.
-- That is the point of the design — a customer adds a dimension, or rewrites a
-- prompt, with an INSERT and no deploy.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The corporate center
-- ---------------------------------------------------------------------------
INSERT INTO public.organizations (slug, name, description)
VALUES (
  'corporate',
  'Corporate Center',
  'Cross-cutting capabilities that belong to the company rather than to one department. Reads across the other orgs; decision risk is its first tenant.'
)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Mitigations
-- ---------------------------------------------------------------------------
-- The one genuine gap in risk.*: `grep -i 'mitig|recommend|action'` across the
-- schema returns nothing. A risk assessment without what you would do about it
-- is half an answer, and "residual risk after mitigation" is the number an
-- executive actually decides on.
--
-- `accepted` closes the loop into risk.learnings: which proposals were taken up
-- is the signal worth learning from.
CREATE TABLE IF NOT EXISTS risk.mitigations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id     UUID NOT NULL REFERENCES risk.assessments(id) ON DELETE CASCADE,
  subject_id        UUID NOT NULL REFERENCES risk.subjects(id) ON DELETE CASCADE,
  proposal          TEXT NOT NULL,
  rationale         TEXT,
  effort            TEXT CHECK (effort IN ('low', 'medium', 'high')),
  residual_score    INTEGER CHECK (residual_score >= 0 AND residual_score <= 100),
  accepted          BOOLEAN,
  accepted_at       TIMESTAMPTZ,
  accepted_by       TEXT,
  llm_provider      TEXT,
  llm_model         TEXT,
  is_test           BOOLEAN DEFAULT false,
  test_scenario_id  TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mitigations_subject ON risk.mitigations (subject_id);
CREATE INDEX IF NOT EXISTS idx_mitigations_assessment ON risk.mitigations (assessment_id);

COMMENT ON TABLE risk.mitigations IS
  'What to do about a flagged dimension, and the score that remains if you do it. Proposed per assessment by the decision-risk workflow.';
COMMENT ON COLUMN risk.mitigations.accepted IS
  'NULL = not yet reviewed. Which proposals get accepted is the signal that feeds risk.learnings.';

-- ---------------------------------------------------------------------------
-- 3. The decision scope
-- ---------------------------------------------------------------------------
-- `agent_slug` is the scope's owner column and predates the agent/workflow
-- split. It holds the WORKFLOW slug here. The column name is wrong; renaming it
-- would break the investment scopes and the repositories that read them, so it
-- is left alone and noted.
INSERT INTO risk.scopes (
  organization_slug, agent_slug, name, description, domain,
  llm_config, thresholds, analysis_config
)
SELECT
  'corporate',
  'decision-risk',
  'Corporate Decision Risk',
  'We are thinking about doing something. What could go wrong, how badly, and what would we do about it?',
  'decision',
  '{}'::JSONB,
  '{"flagged": 60, "debate": 65, "alert": 80}'::JSONB,
  '{
     "riskRadar": { "enabled": true, "parallelDimensions": true },
     "redTeam":   { "enabled": true, "debateThreshold": 65 },
     "mitigations": { "enabled": true, "flaggedThreshold": 60 },
     "learning":  { "enabled": true }
   }'::JSONB
WHERE NOT EXISTS (
  SELECT 1 FROM risk.scopes
  WHERE organization_slug = 'corporate' AND agent_slug = 'decision-risk'
);

-- ---------------------------------------------------------------------------
-- 3a. Make the weight rule per-scope, which is what multi-scope requires
-- ---------------------------------------------------------------------------
-- risk.validate_dimension_weights() sums the weights of EVERY active dimension
-- in the table and demands the total be 1.0. That is only satisfiable while
-- exactly one scope exists, so it forbids the second domain outright — the
-- multi-scope design the schema is otherwise built for.
--
-- It is already violated by the data it is guarding: the two investment scopes
-- each sum to 1.00, so the global total is 2.00. The trigger is AFTER INSERT OR
-- UPDATE FOR EACH STATEMENT, so it only fires on write, which is why this has
-- gone unnoticed — and why the next write to risk.dimensions, from anywhere,
-- would have failed.
--
-- Corrected to check each scope independently, and to name the scopes at fault
-- instead of printing one meaningless global number.
CREATE OR REPLACE FUNCTION risk.validate_dimension_weights()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  offenders TEXT;
BEGIN
  SELECT string_agg(format('%s [%s] sums to %s', s.name, s.organization_slug, t.total), '; ' ORDER BY s.name)
    INTO offenders
    FROM (
      SELECT scope_id, SUM(weight) AS total
        FROM risk.dimensions
       WHERE is_active = true
       GROUP BY scope_id
      HAVING SUM(weight) < 0.99 OR SUM(weight) > 1.01
    ) t
    JOIN risk.scopes s ON s.id = t.scope_id;

  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION
      'Active dimension weights must sum to 1.0 within each scope. Offending: %',
      offenders;
  END IF;

  RETURN NULL;  -- statement-level trigger
END;
$$;

COMMENT ON FUNCTION risk.validate_dimension_weights() IS
  'Weights are proportions within a scope. Checked per scope, not globally — a global check would allow only one scope to exist.';

-- ---------------------------------------------------------------------------
-- 4. Dimensions, and the prompt that drives each one
-- ---------------------------------------------------------------------------
-- Weights are PROPORTIONS and must sum to 1.00 within the scope (see the
-- trigger fix in section 3a). Execution and Financial carry the most because
-- they are where decisions most often actually fail; Competitive the least
-- because it is the most speculative.
WITH scope AS (
  SELECT id FROM risk.scopes
  WHERE organization_slug = 'corporate' AND agent_slug = 'decision-risk'
),
seed(slug, name, description, weight, display_order, prompt) AS (
  VALUES
    ('execution', 'Execution', 'Can we actually deliver this, with the people and time we have?', 0.13, 1,
     'You assess EXECUTION risk: whether the organisation can actually deliver the proposition with the capacity, skills and time available. Weigh scope clarity, dependency count, delivery track record on comparable work, and whether success requires everything to go right. A plan that only works with no setbacks is high risk regardless of how good it is.'),
    ('financial', 'Financial', 'Cost, downside exposure, and what it does to runway.', 0.13, 2,
     'You assess FINANCIAL risk: cost certainty, downside exposure, and the effect on runway or margin. Weigh how reversible the spend is, whether costs are bounded or open-ended, what happens if the upside does not arrive, and the size of the loss in the bad case rather than the expected case.'),
    ('regulatory', 'Regulatory & Compliance', 'Exposure under law, regulation and industry obligation.', 0.12, 3,
     'You assess REGULATORY AND COMPLIANCE risk: exposure under applicable law, regulation and industry obligation. Weigh whether the proposition enters a regulated activity, crosses a jurisdiction, changes a filing or audit position, or depends on an approval not yet held. Say plainly when the answer depends on facts not supplied.'),
    ('legal', 'Legal', 'Contractual and litigation exposure.', 0.11, 4,
     'You assess LEGAL risk distinct from regulatory: contractual and litigation exposure. Weigh obligations to counterparties, indemnity and liability position, IP ownership and licensing, termination and change-of-control terms, and the realistic likelihood of a dispute rather than its theoretical possibility.'),
    ('security', 'Security & Privacy', 'Data exposure, attack surface and privacy obligation.', 0.12, 5,
     'You assess SECURITY AND PRIVACY risk: data exposure, new attack surface, and privacy obligation. Weigh what personal or confidential data the proposition touches, whether it widens the trust boundary, who gains access, and what a breach would cost in remediation and disclosure rather than only in reputation.'),
    ('operational', 'Operational', 'Process fragility, single points of failure, ongoing load.', 0.10, 6,
     'You assess OPERATIONAL risk: fragility in day-to-day running once the decision is made. Weigh single points of failure, key-person dependency, manual steps that must not be missed, monitoring and rollback, and the ongoing load this adds to teams already committed elsewhere.'),
    ('dependency', 'Dependency & Vendor', 'Reliance on third parties and how trapped we become.', 0.08, 7,
     'You assess DEPENDENCY AND VENDOR risk: reliance on parties outside our control. Weigh vendor concentration, switching cost and lock-in, the health and incentives of the counterparty, contractual protection if they fail or change terms, and whether a credible alternative exists.'),
    ('people', 'People & Capability', 'Whether we have, can hire, or will lose the right people.', 0.08, 8,
     'You assess PEOPLE AND CAPABILITY risk: whether the organisation has, can acquire, or may lose the skills this requires. Weigh hiring difficulty and lead time, retention exposure on the people who would carry it, morale and change fatigue, and whether the work depends on individuals rather than on roles.'),
    ('reputational', 'Reputational', 'What it does to trust with customers, staff and the market.', 0.07, 9,
     'You assess REPUTATIONAL risk: the effect on trust with customers, employees, partners and the market. Weigh how the decision reads if reported unsympathetically, consistency with stated values and prior commitments, and which stakeholders would feel wronged. Distinguish genuine reputational harm from ordinary criticism.'),
    ('competitive', 'Competitive', 'Market position, timing and what rivals do in response.', 0.06, 10,
     'You assess COMPETITIVE risk: effect on market position and the likely response of rivals. Weigh timing, whether the move is defensible or easily copied, the cost of being second, and the risk of NOT acting. Be explicit that this dimension is the most speculative and calibrate confidence accordingly.')
),
ins_dim AS (
  INSERT INTO risk.dimensions (scope_id, slug, name, description, weight, display_order)
  SELECT scope.id, seed.slug, seed.name, seed.description, seed.weight, seed.display_order
  FROM scope CROSS JOIN seed
  WHERE NOT EXISTS (
    SELECT 1 FROM risk.dimensions d
    WHERE d.scope_id = scope.id AND d.slug = seed.slug
  )
  RETURNING id, slug
)
INSERT INTO risk.dimension_contexts (dimension_id, version, system_prompt)
SELECT
  ins_dim.id,
  1,
  seed.prompt || E'\n\nYou are given a PROPOSITION the organisation is considering, and any context supplied with it.\n\nScore 0-100, where 0 means this dimension poses no meaningful risk and 100 means it alone is reason not to proceed. Use the whole range: most real propositions sit between 20 and 70, and reserve above 80 for genuine blockers.\n\nState confidence 0-1 honestly. Low confidence on thin information is the correct answer and is more useful than a confident guess — say what specific fact would change your score.\n\nGive reasoning a decision-maker can argue with: name the mechanism by which harm would occur, not a restatement of the category. Cite the parts of the proposition you relied on as evidence.\n\nRespond with JSON only, no prose outside it:\n{"score": <integer 0-100>, "confidence": <number 0-1>, "reasoning": "<string>", "evidence": ["<string>", ...]}'
FROM ins_dim
JOIN seed ON seed.slug = ins_dim.slug;

-- ---------------------------------------------------------------------------
-- 5. Debate prompts — blue, red, arbiter
-- ---------------------------------------------------------------------------
-- Triggered when the composite crosses analysis_config.redTeam.debateThreshold.
-- The point is not to lower the score; it is to make the score survive an
-- argument, and to record the argument so a reader can judge it themselves.
INSERT INTO risk.debate_contexts (scope_id, role, version, system_prompt)
SELECT scope.id, v.role, 1, v.prompt
FROM (SELECT id FROM risk.scopes WHERE organization_slug = 'corporate' AND agent_slug = 'decision-risk') scope
CROSS JOIN (VALUES
  ('blue',
   'You defend the risk assessment just produced. Summarise why the dimension scores are justified, which evidence is strongest, and where the assessment is appropriately cautious. Do not inflate — concede any dimension you think is overscored, because conceding the weak points is what makes the rest credible. Respond with JSON only: {"summary": "<string>", "strongest_points": ["<string>", ...], "conceded": ["<string>", ...]}'),
  ('red',
   'You attack the risk assessment just produced. Find where it is overstated, where it double-counts the same underlying hazard across dimensions, where it treats a manageable issue as structural, and where it asserts a mechanism without evidence. Also name any risk it MISSED — an assessment that is too low is as wrong as one that is too high. Respond with JSON only: {"challenges": [{"dimension": "<slug>", "claim": "<string>", "severity": "minor"|"material"}], "missed_risks": ["<string>", ...]}'),
  ('arbiter',
   'You have the original assessment, its defence and its challenges. Decide what the composite score should be. Move it only where a challenge is material and supported; restating a disagreement is not grounds to move a score. Adjustments beyond 15 points need explicit justification. State what would change your mind. Respond with JSON only: {"final_score": <integer 0-100>, "adjustment": <integer>, "rationale": "<string>", "would_change_my_mind": "<string>"}')
) AS v(role, prompt)
WHERE NOT EXISTS (
  SELECT 1 FROM risk.debate_contexts dc
  WHERE dc.scope_id = scope.id AND dc.role = v.role AND dc.version = 1
);

COMMIT;

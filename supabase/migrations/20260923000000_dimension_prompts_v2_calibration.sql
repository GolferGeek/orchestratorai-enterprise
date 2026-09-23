-- Dimension prompts v2: remove the shared anchor, calibrate each dimension.
--
-- Two live runs produced a near-flat radar: eight of ten dimensions returned
-- exactly 72, both times, on different threads.
--
-- The cause is in this table, not in the model. Every dimension prompt ends
-- with the same appended block, which contains:
--
--   "Use the whole range: most real propositions sit between 20 and 70, and
--    reserve above 80 for genuine blockers."
--
-- Ten independent calls, one identical anchor, and they all land just above the
-- top of the stated band. The evidence that this is the cause rather than a
-- limit of the model: the MITIGATION prompt, which has no such anchor, produced
-- residuals of 45, 45, 45, 45, 48, 58, 58, 58 and 58 for the same proposition
-- in the same run. Same model, same temperature — it discriminates fine when it
-- is not handed a number to anchor on.
--
-- So the global range guidance goes, and each dimension gets its own calibration
-- at 20 / 50 / 80 expressed in ITS OWN terms. A dimension can then only place a
-- score by comparing the proposition to anchors specific to that kind of risk,
-- which is the comparison that ought to drive the number.
--
-- Versioned rather than overwritten: v1 is deactivated and kept. The store
-- selects the newest active version per dimension, so this takes effect on the
-- next run with NO code change and NO redeploy — which is the property the
-- whole table-driven design exists for.

BEGIN;

WITH scope AS (
  SELECT id FROM risk.scopes
   WHERE organization_slug = 'corporate' AND agent_slug = 'decision-risk'
),
calibration(slug, anchors) AS (
  VALUES
    ('execution',
     E'CALIBRATION for execution risk:\n20 — routine work this organisation has delivered repeatedly, with clear scope.\n50 — new but analogous to past work; real unknowns, no novel capability required.\n80 — first of its kind here, many interlocking dependencies, and success requires nearly everything to go right.'),
    ('financial',
     E'CALIBRATION for financial risk:\n20 — bounded, reversible spend comfortably within reserves.\n50 — material but survivable; a bad outcome costs a year, not the company.\n80 — irreversible commitment that threatens solvency if the upside does not arrive on schedule.'),
    ('regulatory',
     E'CALIBRATION for regulatory and compliance risk:\n20 — engages no regulated activity.\n50 — regulated but familiar; the compliance path is known and already walked.\n80 — enters a regulated activity without the approvals or in-house knowledge, or crosses jurisdictions with conflicting obligations.'),
    ('legal',
     E'CALIBRATION for legal risk:\n20 — standard terms, no unusual liability, clean IP position.\n50 — negotiable exposure with open questions that diligence would normally close.\n80 — uncapped liability, contested ownership, or a dispute that is likely rather than merely possible.'),
    ('security',
     E'CALIBRATION for security and privacy risk:\n20 — no new data exposure and no new attack surface.\n50 — internal or commercial data under controls already operated.\n80 — sensitive personal or health data, a widened trust boundary, and an unverified security posture.'),
    ('operational',
     E'CALIBRATION for operational risk:\n20 — existing processes absorb it with no new ongoing load.\n50 — a new runbook is needed but the failure modes are understood and recoverable.\n80 — single points of failure, manual steps that must not be missed, and no practical rollback.'),
    ('dependency',
     E'CALIBRATION for dependency and vendor risk:\n20 — no new third party, or one that is trivially replaceable.\n50 — a real vendor relationship with credible alternatives and reasonable terms.\n80 — concentrated reliance, high switching cost, and a counterparty whose health or incentives are unknown.'),
    ('people',
     E'CALIBRATION for people and capability risk:\n20 — the existing team covers this within current roles.\n50 — hiring or training is needed, with known lead times.\n80 — depends on named individuals, in hard-to-hire skills, with live retention exposure.'),
    ('reputational',
     E'CALIBRATION for reputational risk:\n20 — invisible outside the company; nobody outside would care.\n50 — defensible if reported, though some stakeholders would grumble.\n80 — reads badly on its face, contradicts stated commitments, and has identifiable wronged parties.'),
    ('competitive',
     E'CALIBRATION for competitive risk:\n20 — no material effect on market position either way.\n50 — modest timing exposure; the move is copyable but that costs rivals something.\n80 — position is materially worse if a rival responds well, or materially worse if we do not act at all.')
),
base(slug, body) AS (
  SELECT d.slug,
         -- Keep the domain paragraph that opens the existing prompt; it is the
         -- part that is working. Everything from the shared appendix onward is
         -- replaced.
         split_part(dc.system_prompt, E'\n\nYou are given a PROPOSITION', 1)
    FROM risk.dimensions d
    JOIN risk.dimension_contexts dc ON dc.dimension_id = d.id AND dc.is_active
    JOIN scope ON scope.id = d.scope_id
)
INSERT INTO risk.dimension_contexts (dimension_id, version, system_prompt)
SELECT
  d.id,
  2,
  base.body
    || E'\n\n' || calibration.anchors
    || E'\n\nYou are given a PROPOSITION the organisation is considering, and any context supplied with it.\n\nScore 0-100 for THIS DIMENSION ONLY, placing the proposition against the calibration above. Do not moderate your score toward what you imagine other dimensions will say — you cannot see them, and a score that reflects only this dimension is what makes the set useful. If this dimension genuinely poses little risk, say so with a low number; if it alone is reason not to proceed, say that with a high one.\n\nState confidence 0-1 honestly. Low confidence on thin information is the correct answer and more useful than a confident guess — name the specific fact that would change your score.\n\nGive reasoning a decision-maker can argue with: name the mechanism by which harm would occur, not a restatement of the category. Cite the parts of the proposition you relied on as evidence.\n\nRespond with JSON only, no prose outside it:\n{"score": <integer 0-100>, "confidence": <number 0-1>, "reasoning": "<string>", "evidence": ["<string>", ...]}'
FROM risk.dimensions d
JOIN scope ON scope.id = d.scope_id
JOIN base ON base.slug = d.slug
JOIN calibration ON calibration.slug = d.slug
WHERE NOT EXISTS (
  SELECT 1 FROM risk.dimension_contexts x
   WHERE x.dimension_id = d.id AND x.version = 2
);

-- v1 stays as history; only v2 is live from here.
UPDATE risk.dimension_contexts dc
   SET is_active = false
  FROM risk.dimensions d
  JOIN risk.scopes s ON s.id = d.scope_id
 WHERE dc.dimension_id = d.id
   AND s.organization_slug = 'corporate'
   AND s.agent_slug = 'decision-risk'
   AND dc.version = 1;

COMMIT;

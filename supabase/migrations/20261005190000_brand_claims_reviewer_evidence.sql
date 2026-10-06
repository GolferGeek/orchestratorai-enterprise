-- The brand and claims reviewer kept an unsupported claim and invented
-- evidence for it, and its Jev guard passed it (live A2A check, 2026-10-05).
--
-- Asked about "clinically proven to double focus" with no "Evidence:" section,
-- it answered with the claim plus a made-up study. Two faults:
--   1. The guard's evidence input was the whole message, so with no Evidence
--      section it checked the claim against itself. It is now the part after
--      "Evidence:", or "none" when there is none (agent-guards, { after, missing }).
--   2. The instructions never said what to do without evidence, nor forbade
--      adding any. They now do.
BEGIN;

UPDATE public.agents
SET context = 'You are the brand and claims reviewer. The message holds draft copy and, after "Evidence:", the substantiation on file. If there is no "Evidence:" section, the evidence is none. Rewrite the copy in our voice: clear, confident, specific, no hype words ("revolutionary", "best-in-class", "game-changing"). Keep every claim the evidence supports, with its number exactly as the evidence states it. Remove or soften any superlative, comparison, number, guarantee or "proven" claim the evidence does not support; with no evidence, keep none of them. Never add evidence, studies, statistics, sources or numbers that are not in the message, and never echo the evidence back. Reply with the revised copy only - no notes, no explanation.',
    metadata = jsonb_set(
      metadata,
      '{jev_guards}',
      '[{"rubric": "claims-substantiated", "inputs": {"copy": "output", "evidence": {"after": "Evidence:", "missing": "none"}}}]'::jsonb
    ),
    updated_at = now()
WHERE slug = 'brand-claims-reviewer';

COMMIT;

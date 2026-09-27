-- One agent per department org (org effort Phase 2). Four answer from their
-- org's knowledge base (rag); two write and are checked by Jev before the
-- person relies on the text (context + metadata.jev_guards).
-- RAG collections and their documents are loaded through the API
-- (scripts/seed-org-rag.mjs), so extraction, chunking and embeddings go
-- through the planes.
BEGIN;

INSERT INTO public.agents
  (slug, organization_slug, name, description, version, agent_type, department, tags, io_schema, capabilities, context, llm_config, metadata)
VALUES
  ('finance-policy-assistant', ARRAY['finance'], 'Finance Policy Assistant',
   'Answers questions about expenses, travel, purchasing thresholds, invoice processing and the close calendar from Finance''s policies, citing the policy.',
   '1.0.0', 'rag', 'finance', ARRAY['finance','policy','expenses','procurement','rag'],
   '{"input": {"type": "object", "required": ["message"], "properties": {"message": {"type": "string"}}}, "output": {"type": "object", "properties": {"message": {"type": "string"}, "sources": {"type": "array"}}}}'::jsonb,
   ARRAY['policy-lookup','citation-support'],
   'You are the Finance Policy Assistant. Answer from Finance''s policies only, and cite the policy number (e.g. FIN-POL-003) and section. Give amounts and thresholds exactly as written. If the policies do not cover the question, say so and suggest asking the Controller; never guess a number.',
   NULL,
   '{"status": "active", "rag_config": {"top_k": 5, "collection_slug": "finance-policy", "similarity_threshold": 0.3, "no_results_message": "I could not find this in the Finance policies. Please ask the Controller.", "no_access_message": "I do not have access to the Finance policy library."}}'::jsonb),

  ('engineering-runbook-assistant', ARRAY['engineering'], 'Codebase & Runbook Q&A',
   'Answers questions about how this platform is built, deployed and operated, from the repository''s architecture and runbook docs.',
   '1.0.0', 'rag', 'engineering', ARRAY['engineering','architecture','runbook','rag'],
   '{"input": {"type": "object", "required": ["message"], "properties": {"message": {"type": "string"}}}, "output": {"type": "object", "properties": {"message": {"type": "string"}, "sources": {"type": "array"}}}}'::jsonb,
   ARRAY['architecture-lookup','runbook-lookup','citation-support'],
   'You are the engineering team''s codebase and runbook assistant. Answer from the architecture and runbook documents only and name the document you used. Quote commands and file paths exactly. If the documents do not say, say so rather than inventing a command.',
   NULL,
   '{"status": "active", "rag_config": {"top_k": 6, "collection_slug": "engineering-runbooks", "similarity_threshold": 0.3, "no_results_message": "The architecture and runbook docs do not cover this.", "no_access_message": "I do not have access to the engineering docs."}}'::jsonb),

  ('exec-briefing-assistant', ARRAY['corporate'], 'Exec Briefing',
   'Briefs executives from the board pack, OKRs, strategy memos and operating reviews: numbers, decisions and risks, with sources.',
   '1.0.0', 'rag', 'corporate', ARRAY['corporate','board','okr','strategy','rag'],
   '{"input": {"type": "object", "required": ["message"], "properties": {"message": {"type": "string"}}}, "output": {"type": "object", "properties": {"message": {"type": "string"}, "sources": {"type": "array"}}}}'::jsonb,
   ARRAY['briefing','citation-support'],
   'You brief executives. Lead with the answer in one sentence, then the supporting numbers exactly as the documents state them, then open risks or decisions. Cite the document for every number. Keep it under 200 words unless asked for more.',
   NULL,
   '{"status": "active", "rag_config": {"top_k": 6, "collection_slug": "corporate-board", "similarity_threshold": 0.3, "no_results_message": "The board and strategy documents do not cover this.", "no_access_message": "I do not have access to the corporate library."}}'::jsonb),

  ('building-spec-assistant', ARRAY['building'], 'Spec & Building Code Assistant',
   'Answers questions about the project specifications (Divisions 07, 08, 09, 23, 26): requirements, submittal contents and acceptable products, citing the section.',
   '1.0.0', 'rag', 'building', ARRAY['construction','specifications','submittals','rag'],
   '{"input": {"type": "object", "required": ["message"], "properties": {"message": {"type": "string"}}}, "output": {"type": "object", "properties": {"message": {"type": "string"}, "sources": {"type": "array"}}}}'::jsonb,
   ARRAY['spec-lookup','citation-support'],
   'You answer questions about the project manual. Cite the section number and article (e.g. 07 54 23, 2.1.A) for every requirement. State values and standards exactly (thickness, ratings, ASTM and BHMA references). If the specification does not address the question, say so; the building code is outside these documents.',
   NULL,
   '{"status": "active", "rag_config": {"top_k": 6, "collection_slug": "building-specs", "similarity_threshold": 0.3, "no_results_message": "The project specifications do not cover this.", "no_access_message": "I do not have access to the project specifications."}}'::jsonb),

  ('hr-jd-writer', ARRAY['human-resources'], 'Job Description Writer',
   'Drafts a job description from the role, team, level and must-haves. Jev checks every draft for exclusionary wording before it is used.',
   '1.0.0', 'context', 'human-resources', ARRAY['hr','recruiting','job-description','jev'],
   '{"input": {"type": "object", "required": ["message"], "properties": {"message": {"type": "string", "description": "The role: title, team, level, location, what the person will do and the real requirements"}}}, "output": {"type": "object", "properties": {"message": {"type": "string"}}}}'::jsonb,
   ARRAY['drafting','inclusive-language'],
   'You write job descriptions. Structure: a two-sentence summary of the role, "What you will do" (5-7 bullets), "What you bring" (only requirements the work actually needs, 4-6 bullets), "Nice to have" (at most 3), and a line on location and working pattern. Use neutral, inclusive language: no gendered words, no age-coded phrases such as "digital native" or "young", no physical requirements the job does not need, no "culture fit". Reply with the job description only.',
   NULL,
   '{"status": "active", "jev_guards": [{"rubric": "jd-inclusive-language", "inputs": {"text": "output"}}]}'::jsonb),

  ('brand-claims-reviewer', ARRAY['marketing'], 'Brand & Claims Reviewer',
   'Rewrites marketing copy in the brand voice and removes claims the evidence does not support. Jev checks the rewrite against the evidence you give.',
   '1.0.0', 'context', 'marketing', ARRAY['marketing','brand','claims','compliance','jev'],
   '{"input": {"type": "object", "required": ["message"], "properties": {"message": {"type": "string", "description": "The draft copy, then \"Evidence:\" and the substantiation on file (or none)"}}}, "output": {"type": "object", "properties": {"message": {"type": "string"}}}}'::jsonb,
   ARRAY['copy-review','claims-substantiation'],
   'You are the brand and claims reviewer. The message holds draft copy and, after "Evidence:", the substantiation on file. Rewrite the copy in our voice: clear, confident, specific, no hype words ("revolutionary", "best-in-class", "game-changing"). Keep every claim the evidence supports, with its number exactly as the evidence states it. Remove or soften any superlative, comparison, number or guarantee the evidence does not support. Reply with the revised copy only - no notes, no explanation.',
   NULL,
   '{"status": "active", "jev_guards": [{"rubric": "claims-substantiated", "inputs": {"copy": "output", "evidence": "message"}}]}'::jsonb);

COMMIT;

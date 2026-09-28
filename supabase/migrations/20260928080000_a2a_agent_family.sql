-- The 'external' agent family becomes 'a2a' (effort: ambient push and A2A
-- agents, Phase 2). No 'external' row ever existed; the runner could not run
-- one (it needed an endpoint the row never supplied).
--
-- An a2a agent fires its target, metadata.a2a.target:
--   {"kind": "ambient", "event": "<name>"}                push an ambient event
--   {"kind": "a2a", "cardUrl": "https://…", "auth"?: {…}} call a remote A2A v1.0 agent
-- Outbound auth names a config-provider secret, never the token:
--   {"type": "bearer" | "apikey", "secret": "<config key>", "header"?: "…"}
BEGIN;

ALTER TABLE public.agents DROP CONSTRAINT agents_agent_type_check;
ALTER TABLE public.agents ADD CONSTRAINT agents_agent_type_check
  CHECK (agent_type IN ('context', 'rag', 'api', 'a2a', 'media'));

-- A partner agent on the public internet: CarGene, read-only Japanese car
-- genealogy with sources (A2A v1.0, no auth). Search by chassis code (AE86) or
-- Japanese name (スカイライン).
INSERT INTO public.agents
  (slug, organization_slug, name, description, version, agent_type, department, tags, io_schema, capabilities, context, llm_config, metadata)
VALUES
  ('cargene', ARRAY['engineering'], 'CarGene (partner A2A agent)',
   'Asks CarGene, a public A2A agent, about Japanese car series: generations, when they were sold, who developed them, with sources. Search by chassis code (e.g. AE86) or Japanese name (e.g. スカイライン).',
   '1.0.0', 'a2a', 'engineering', ARRAY['a2a','partner','demo'],
   '{"input": {"type": "object", "required": ["message"], "properties": {"message": {"type": "string", "description": "A chassis code or a Japanese series name"}}}, "output": {"type": "object", "description": "CarGene''s JSON answer, as it sent it"}}'::jsonb,
   ARRAY['a2a-partner'],
   'Forwards the message to CarGene over A2A v1.0 and returns its answer unchanged.',
   NULL,
   '{"status": "active", "a2a": {"target": {"kind": "a2a", "cardUrl": "https://car-gene.com/.well-known/agent-card.json"}}}'::jsonb);

COMMIT;

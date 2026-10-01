-- Finance's A2A agent for the partner vendor registry (effort: ambient push and
-- A2A agents, Phase 5b). Invoice Review asks it about each invoice's vendor
-- mid-run (PartnerCallsService); it forwards over A2A v1.0 to the partner's
-- agent at partner.orchestratorai.io (examples/partner-vendor-registry, built
-- on the official a2a-sdk). Active, so the workflow can use it, which also
-- publishes it; only the partner itself may call it, so it is not an open proxy.
BEGIN;

INSERT INTO public.agents
  (slug, organization_slug, name, description, version, agent_type, department, tags, io_schema,
   capabilities, context, endpoint, metadata)
VALUES
  ('vendor-registry', ARRAY['finance'], 'Partner vendor registry',
   'Asks the partner''s vendor registry about a vendor: approved, on hold or unknown, and any recent change to its bank details. Invoice Review uses it for every invoice.',
   '1.0.0', 'a2a', 'finance', ARRAY['a2a','finance','vendors'],
   '{}'::jsonb,
   ARRAY['a2a-a2a'],
   'Forwards a vendor name to the partner vendor registry and returns its standing.',
   NULL,
   '{"status": "active", "a2a": {"target": {"kind": "a2a", "cardUrl": "https://partner.orchestratorai.io/.well-known/agent-card.json", "send": "all"}, "callers": {"allow": ["https://partner.orchestratorai.io/.well-known/agent-card.json"]}}}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

COMMIT;

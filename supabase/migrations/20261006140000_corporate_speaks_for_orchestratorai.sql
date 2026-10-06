-- The customer-service agent is generic: it speaks for the organization
-- CUSTOMER_SERVICE_ORG names, from that org's company-knowledge collection and
-- its settings.customerService. On this platform that is 'corporate' (Matt,
-- 2026-10-06), renamed OrchestratorAI because the agent names the company
-- from the org. Its documents are docs/company-knowledge/orchestratorai,
-- loaded by scripts/seed-org-rag.mjs.

UPDATE public.organizations
SET name = 'OrchestratorAI',
    settings = coalesce(settings, '{}'::jsonb)
      || '{"customerService": {"email": "hello@orchestrator-ai.com", "phone": "763-220-0146"}}'::jsonb
WHERE slug = 'corporate';

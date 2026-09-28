-- The examples of the ambient push and A2A effort (Phase 5).
--
-- Invoice intake, two ways in, one event:
--   * a file dropped in storage intake/invoices/<PO number>/<file>
--   * a partner's A2A call to send-invoice (the invoice as text, the PO as data)
-- both raise invoice.received in finance (channel 'storage' or 'a2a'); a
-- trigger per channel starts Invoice Review, which waits for a person. The
-- A2A one replies to the partner through send-invoice once the run ends.
--
-- Submittal review over A2A: request-submittal-review (building) starts
-- Submittal Review with the caller's text and spec section; the caller can
-- stream it (SendStreamingMessage) to its human gate and beyond.
BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES ('intake', 'intake', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO ambient.storage_watches (org_slug, bucket, prefix, event)
VALUES ('finance', 'intake', 'invoices/', 'invoice.received')
ON CONFLICT (org_slug, bucket, prefix, event) DO NOTHING;

INSERT INTO public.agents
  (slug, organization_slug, name, description, version, agent_type, department, tags, io_schema, capabilities, context, llm_config, metadata)
VALUES
  ('send-invoice', ARRAY['finance'], 'Send an invoice',
   'Partners send Finance an invoice over A2A: the invoice as text, and its purchase order as {"poNumber": "PO-4502"}. Finance reviews it against the PO and replies once a person has decided.',
   '1.0.0', 'a2a', 'finance', ARRAY['a2a','finance','invoice'],
   '{"input": {"type": "object", "required": ["message", "poNumber"], "properties": {"message": {"type": "string", "description": "The invoice as text"}, "poNumber": {"type": "string", "pattern": "^PO-[0-9]{3,8}$"}}}, "output": {"type": "object", "properties": {"status": {"const": "received"}, "eventId": {"type": "string"}}}}'::jsonb,
   ARRAY['a2a-intake'],
   'Receives an invoice from a partner and pushes invoice.received; the review''s outcome is sent back through this agent.',
   NULL,
   '{"status": "active", "a2a": {"target": {"kind": "ambient", "event": "invoice.received"}}}'::jsonb),
  ('request-submittal-review', ARRAY['building'], 'Request a submittal review',
   'Subcontractors ask Building to review a submittal over A2A: the submittal as text, and the spec section as {"specSection": "23 74 13"}. The task follows the review, which a person approves; it can be streamed.',
   '1.0.0', 'a2a', 'building', ARRAY['a2a','building','submittal'],
   '{"input": {"type": "object", "required": ["message", "specSection"], "properties": {"message": {"type": "string", "description": "The submittal as text"}, "specSection": {"type": "string", "pattern": "^[0-9]{2} [0-9]{2} [0-9]{2}$"}}}, "output": {"type": "object", "properties": {"status": {"const": "queued"}, "runId": {"type": "string"}}}}'::jsonb,
   ARRAY['a2a-workflow'],
   'Starts Submittal Review for a caller and follows the run.',
   NULL,
   '{"status": "active", "a2a": {"target": {"kind": "workflow", "workflowSlug": "submittal-review", "textField": "submittalText"}}}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO ambient.triggers
  (org_slug, name, description, source_type, source_config, condition, action_config,
   trigger_kind, trigger_config, response_kind, response_config)
SELECT * FROM (VALUES
  ('finance', 'Invoice dropped in intake',
   'A file in storage intake/invoices/<PO number>/ is reviewed against that PO.',
   'event', '{"event": "invoice.received"}'::jsonb, '{"channel": "storage"}'::jsonb,
   '{"workflowSlug": "invoice-review", "inputFromEvent": {"poNumber": "folders.1"}, "documentFromEvent": true}'::jsonb,
   'event', '{"event": "invoice.received"}'::jsonb, 'workflow',
   '{"workflowSlug": "invoice-review", "inputFromEvent": {"poNumber": "folders.1"}, "documentFromEvent": true}'::jsonb),
  ('finance', 'Invoice sent by a partner',
   'An invoice a partner sent over A2A (send-invoice) is reviewed against its PO; the partner hears the outcome.',
   'event', '{"event": "invoice.received"}'::jsonb, '{"channel": "a2a"}'::jsonb,
   '{"workflowSlug": "invoice-review", "inputFromEvent": {"poNumber": "data.poNumber", "invoiceText": "message"}, "replyToCaller": true}'::jsonb,
   'event', '{"event": "invoice.received"}'::jsonb, 'workflow',
   '{"workflowSlug": "invoice-review", "inputFromEvent": {"poNumber": "data.poNumber", "invoiceText": "message"}, "replyToCaller": true}'::jsonb)
) AS example(org_slug, name, description, source_type, source_config, condition, action_config, trigger_kind, trigger_config, response_kind, response_config)
WHERE NOT EXISTS (SELECT 1 FROM ambient.triggers t WHERE t.org_slug = example.org_slug AND t.name = example.name);

COMMIT;

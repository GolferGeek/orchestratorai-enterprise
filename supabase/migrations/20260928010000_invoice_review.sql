-- Invoice exception review (org effort Phase 5): Finance's purchase orders,
-- receipts and invoice decisions; the extractor agent; finance's models.
BEGIN;

CREATE SCHEMA IF NOT EXISTS finance AUTHORIZATION postgres;

CREATE TABLE finance.purchase_orders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_slug text NOT NULL,
  po_number         text NOT NULL,
  vendor            text NOT NULL,
  terms             text NOT NULL,
  currency          text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  budget_owner      text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_slug, po_number)
);

CREATE TABLE finance.po_lines (
  po_id       uuid NOT NULL REFERENCES finance.purchase_orders(id) ON DELETE CASCADE,
  line_no     integer NOT NULL CHECK (line_no > 0),
  description text NOT NULL,
  quantity    numeric(12,2) NOT NULL CHECK (quantity > 0),
  unit_price  numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  PRIMARY KEY (po_id, line_no)
);

CREATE TABLE finance.receipts (
  po_id         uuid NOT NULL,
  line_no       integer NOT NULL,
  quantity      numeric(12,2) NOT NULL CHECK (quantity >= 0),
  received_at   date NOT NULL,
  FOREIGN KEY (po_id, line_no) REFERENCES finance.po_lines(po_id, line_no) ON DELETE CASCADE
);

-- Every invoice decision: made by a run (auto-approved or reviewed), or
-- seeded history (run_id null) that duplicate detection checks against.
CREATE TABLE finance.invoices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_slug text NOT NULL,
  run_id            uuid UNIQUE REFERENCES workflows.runs(id) ON DELETE SET NULL,
  po_number         text NOT NULL,
  vendor            text NOT NULL,
  vendor_key        text NOT NULL,
  invoice_number    text NOT NULL,
  invoice_date      date,
  total             numeric(12,2) NOT NULL,
  currency          text NOT NULL,
  outcome           text NOT NULL CHECK (outcome IN ('auto_approved', 'approved', 'rejected', 'paid')),
  exceptions        jsonb NOT NULL DEFAULT '[]'::jsonb,
  decided_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invoices_duplicates ON finance.invoices (organization_slug, vendor_key, invoice_number);

ALTER TABLE finance.purchase_orders OWNER TO postgres;
ALTER TABLE finance.po_lines OWNER TO postgres;
ALTER TABLE finance.receipts OWNER TO postgres;
ALTER TABLE finance.invoices OWNER TO postgres;
ALTER TABLE finance.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.po_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.invoices ENABLE ROW LEVEL SECURITY;

WITH po AS (
  INSERT INTO finance.purchase_orders (organization_slug, po_number, vendor, terms, currency, budget_owner) VALUES
    ('finance', 'PO-4471', 'ACME Industrial Supply', 'Net 30', 'USD', 'Facilities'),
    ('finance', 'PO-4502', 'Summit Office Interiors LLC', 'Net 45', 'USD', 'Workplace'),
    ('finance', 'PO-4519', 'Cascade Cloud Services, Inc.', 'Net 30', 'USD', 'IT')
  RETURNING id, po_number
), lines AS (
  INSERT INTO finance.po_lines (po_id, line_no, description, quantity, unit_price)
  SELECT po.id, l.line_no, l.description, l.quantity, l.unit_price
  FROM po JOIN (VALUES
    ('PO-4471', 1, 'Nitrile exam gloves, box of 100', 40, 12.50),
    ('PO-4471', 2, 'Anti-fog safety goggles', 6, 18.00),
    ('PO-4502', 1, 'Ergonomic task chair, mesh back', 12, 389.00),
    ('PO-4502', 2, 'Height-adjustable desk, 60 inch', 12, 649.00),
    ('PO-4519', 1, 'Platform support renewal, 12 months', 1, 18000.00)
  ) AS l(po_number, line_no, description, quantity, unit_price) ON l.po_number = po.po_number
  RETURNING po_id, line_no
)
INSERT INTO finance.receipts (po_id, line_no, quantity, received_at)
SELECT lines.po_id, lines.line_no, r.quantity, r.received_at::date
FROM lines JOIN po ON po.id = lines.po_id
JOIN (VALUES
  ('PO-4471', 1, 40, '2026-09-10'), ('PO-4471', 2, 6, '2026-09-10'),
  ('PO-4502', 1, 12, '2026-09-18'), ('PO-4502', 2, 8, '2026-09-18'),
  ('PO-4519', 1, 1, '2026-09-01')
) AS r(po_number, line_no, quantity, received_at) ON r.po_number = po.po_number AND r.line_no = lines.line_no;

INSERT INTO finance.invoices (organization_slug, po_number, vendor, vendor_key, invoice_number, invoice_date, total, currency, outcome, decided_at) VALUES
  ('finance', 'PO-4471', 'ACME Industrial Supply, Inc.', 'acme industrial supply', 'INV-20931', '2026-09-14', 608.00, 'USD', 'paid', '2026-09-20');

INSERT INTO workflows.agent_definitions
  (slug, name, description, instructions, model_role, output_format, input_schema, output_schema, max_tokens)
VALUES
  ('invoice-extractor', 'Invoice extractor', 'Reads an invoice into its vendor, number, date, terms, currency, lines and total.',
   'You read one vendor invoice and return its fields exactly as printed. vendor: the issuing company''s name as printed. invoiceNumber and invoiceDate (YYYY-MM-DD). terms: the payment terms as printed (e.g. "Net 30", "Due on receipt"), or null if none. currency: the ISO code (USD if only $ is shown). lines: every billed line with its description, quantity and unit price as numbers (no currency symbols). total: the amount due. Copy values; never correct, round or infer them. If a field is not on the invoice, use null where allowed.',
   'analyst', 'json',
   '{"type": "object", "properties": {"invoiceText": {"type": "string", "minLength": 1}}, "required": ["invoiceText"], "additionalProperties": false}'::jsonb,
   '{"type": "object", "properties": {"vendor": {"type": "string", "minLength": 1}, "invoiceNumber": {"type": "string", "minLength": 1}, "invoiceDate": {"type": ["string", "null"]}, "terms": {"type": ["string", "null"]}, "currency": {"type": "string", "pattern": "^[A-Z]{3}$"}, "lines": {"type": "array", "minItems": 1, "items": {"type": "object", "properties": {"description": {"type": "string", "minLength": 1}, "quantity": {"type": "number", "exclusiveMinimum": 0}, "unitPrice": {"type": "number", "minimum": 0}}, "required": ["description", "quantity", "unitPrice"], "additionalProperties": false}}, "total": {"type": "number", "minimum": 0}}, "required": ["vendor", "invoiceNumber", "invoiceDate", "terms", "currency", "lines", "total"], "additionalProperties": false}'::jsonb,
   900);

INSERT INTO workflows.agent_definition_links (agent_slug, workflow_slug, purpose) VALUES
  ('invoice-extractor', 'invoice-review', 'step'),
  ('workflow-trace-reviewer', 'invoice-review', 'trace_review');

INSERT INTO workflows.model_profiles (organization_slug, workflow_slug, role, provider, model) VALUES
  ('finance', 'invoice-review', 'analyst', 'openrouter', 'google/gemini-2.5-flash-lite'),
  ('finance', 'invoice-review', 'reviewer', 'openrouter', 'google/gemini-2.5-flash-lite');

COMMIT;

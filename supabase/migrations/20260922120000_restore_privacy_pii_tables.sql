-- Restore the two privacy tables the LLM-boundary PII pipeline writes to.
--
-- `pseudonym_dictionaries` and `redaction_patterns` already exist in the
-- baseline schema, but `pseudonym_mappings` and `redaction_audit_log` were
-- lost in the 2026-03 repo migration while the code that reads and writes
-- them came across intact. Without these tables PseudonymizationService
-- silently degrades: hash-based pseudonyms are never persisted, so a
-- pseudonym issued on one request cannot be reversed on the next, and the
-- admin mapping viewer has nothing to show.

-- ---------------------------------------------------------------------------
-- pseudonym_mappings — hash -> pseudonym, the reversible record for
-- PseudonymizationService. `original_hash` is a SHA-256 of the source value;
-- the raw value is deliberately NOT stored here. Reversal works from the
-- per-request mapping list; this table exists so the same value gets the same
-- pseudonym across requests, and so usage can be audited.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pseudonym_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_hash TEXT NOT NULL,
  pseudonym TEXT NOT NULL,
  data_type TEXT NOT NULL,
  context TEXT,
  usage_count INTEGER NOT NULL DEFAULT 1,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- lookupExistingPseudonym() hits original_hash on every pseudonymized value.
CREATE UNIQUE INDEX IF NOT EXISTS pseudonym_mappings_original_hash_key
  ON public.pseudonym_mappings (original_hash);

CREATE INDEX IF NOT EXISTS pseudonym_mappings_pseudonym_idx
  ON public.pseudonym_mappings (pseudonym);

CREATE INDEX IF NOT EXISTS pseudonym_mappings_data_type_idx
  ON public.pseudonym_mappings (data_type);

-- The admin mapping viewer filters on context and orders by usage_count.
CREATE INDEX IF NOT EXISTS pseudonym_mappings_context_idx
  ON public.pseudonym_mappings (context);

CREATE INDEX IF NOT EXISTS pseudonym_mappings_usage_count_idx
  ON public.pseudonym_mappings (usage_count DESC);

COMMENT ON TABLE public.pseudonym_mappings IS
  'Reversible hash -> pseudonym records for the LLM-boundary PII pipeline. Never stores the original value.';

-- ---------------------------------------------------------------------------
-- redaction_audit_log — one row per pseudonymize/reverse operation. Counts and
-- timings only; no values, so it is safe to retain and to expose to admins.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.redaction_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT,
  run_id TEXT,
  operation_type TEXT NOT NULL,
  data_type TEXT,
  pseudonym_count INTEGER NOT NULL DEFAULT 0,
  processing_time_ms INTEGER,
  service_name TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS redaction_audit_log_created_at_idx
  ON public.redaction_audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS redaction_audit_log_run_id_idx
  ON public.redaction_audit_log (run_id);

CREATE INDEX IF NOT EXISTS redaction_audit_log_operation_type_idx
  ON public.redaction_audit_log (operation_type);

COMMENT ON TABLE public.redaction_audit_log IS
  'Audit trail of PII pseudonymization/redaction operations. Counts and timings only — never the redacted values.';

-- ---------------------------------------------------------------------------
-- updated_at trigger for pseudonym_mappings
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_pseudonym_mappings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pseudonym_mappings_updated_at
  ON public.pseudonym_mappings;

CREATE TRIGGER trg_pseudonym_mappings_updated_at
  BEFORE UPDATE ON public.pseudonym_mappings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_pseudonym_mappings_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — both tables are service-role only. No end user reads them directly;
-- the admin API is the sole reader and it authenticates separately.
-- ---------------------------------------------------------------------------

ALTER TABLE public.pseudonym_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redaction_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all_pseudonym_mappings ON public.pseudonym_mappings;
CREATE POLICY service_role_all_pseudonym_mappings
  ON public.pseudonym_mappings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all_redaction_audit_log ON public.redaction_audit_log;
CREATE POLICY service_role_all_redaction_audit_log
  ON public.redaction_audit_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

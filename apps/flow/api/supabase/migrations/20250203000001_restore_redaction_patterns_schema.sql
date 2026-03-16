-- Restore redaction_patterns table to original schema with proper PII columns
-- This reverts the generic schema back to the specific PII-focused structure

-- Drop the current table (preserving any data first if needed)
DROP TABLE IF EXISTS public.redaction_patterns CASCADE;

-- Recreate with original schema that matches the code and UI
CREATE TABLE public.redaction_patterns (
    id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    name character varying(255) NOT NULL UNIQUE,
    pattern_regex text NOT NULL,
    replacement text NOT NULL,
    description text,
    category character varying(100) DEFAULT 'pii_custom'::character varying,
    priority integer DEFAULT 50,
    is_active boolean DEFAULT true,
    severity character varying(50),
    data_type character varying(50),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for common queries
CREATE INDEX idx_redaction_patterns_category ON public.redaction_patterns(category);
CREATE INDEX idx_redaction_patterns_data_type ON public.redaction_patterns(data_type);
CREATE INDEX idx_redaction_patterns_severity ON public.redaction_patterns(severity);
CREATE INDEX idx_redaction_patterns_is_active ON public.redaction_patterns(is_active);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION public.update_redaction_patterns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_redaction_patterns_updated_at
    BEFORE UPDATE ON public.redaction_patterns
    FOR EACH ROW
    EXECUTE FUNCTION public.update_redaction_patterns_updated_at();

-- Insert some built-in PII patterns as examples
INSERT INTO public.redaction_patterns (name, pattern_regex, replacement, description, category, priority, severity, data_type) VALUES
('SSN - US Social Security Number', '\b\d{3}-\d{2}-\d{4}\b', '[SSN_REDACTED]', 'Detects US Social Security Numbers in XXX-XX-XXXX format', 'pii_builtin', 10, 'showstopper', 'ssn'),
('Email Address', '\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', '[EMAIL_REDACTED]', 'Detects email addresses', 'pii_builtin', 20, 'flagger', 'email'),
('Phone - US Format', '\b(\+1[-.]?)?\(?\d{3}\)?[-.]?\d{3}[-.]?\d{4}\b', '[PHONE_REDACTED]', 'Detects US phone numbers in various formats', 'pii_builtin', 30, 'flagger', 'phone'),
('Credit Card - Generic', '\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b', '[CC_REDACTED]', 'Detects credit card numbers', 'pii_builtin', 5, 'showstopper', 'credit_card'),
('IP Address - IPv4', '\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b', '[IP_REDACTED]', 'Detects IPv4 addresses', 'pii_builtin', 40, 'flagger', 'ip_address')
ON CONFLICT (name) DO NOTHING;

COMMENT ON TABLE public.redaction_patterns IS 'PII detection patterns for redaction and pseudonymization';
COMMENT ON COLUMN public.redaction_patterns.severity IS 'showstopper: blocks content, flagger: warns but allows';
COMMENT ON COLUMN public.redaction_patterns.data_type IS 'Type of PII: ssn, email, phone, credit_card, etc.';
COMMENT ON COLUMN public.redaction_patterns.category IS 'pii_builtin or pii_custom';

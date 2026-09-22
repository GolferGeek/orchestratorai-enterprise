-- The built-in US phone pattern missed the two most common written formats.
--
-- Shipped regex:
--   \b(\+1[-.]?)?\(?\d{3}\)?[-.]?\d{3}[-.]?\d{4}\b
--
-- After the area code it allows only `-` or `.` as a separator, so a space
-- breaks the match. That means "(555) 123-4567" and "+1 555 123 4567" were
-- never redacted, and "(555)123-4567" matched from the digits onward and left
-- the opening paren behind. Only the fully-punctuated and bare-digit forms
-- worked.
--
-- Replacement accepts whitespace as a separator, makes the +1 country code
-- optional in either punctuation style, and matches the leading paren as part
-- of the number. The digit guards on both ends stop it chewing a leading or
-- trailing run of a longer number (e.g. a 16-digit card, which is a
-- showstopper and must block rather than be redacted).

UPDATE public.redaction_patterns
SET pattern_regex = '(?<![\d-])(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?![\d-])',
    description = 'Detects US phone numbers: (555) 123-4567, 555-123-4567, 555.123.4567, 5551234567, +1 555 123 4567',
    updated_at = now()
WHERE name = 'Phone - US Format'
  AND category = 'pii_builtin';

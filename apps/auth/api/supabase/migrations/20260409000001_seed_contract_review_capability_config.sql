-- Seed per-capability model config for the contract-review capability.
-- Uses the same provider/model as document-onboarding by default.
INSERT INTO legal.capability_model_config (capability_slug, role, provider, model)
VALUES
  ('contract-review', 'workhorse', 'ollama', 'gemma4:31b'),
  ('contract-review', 'thinking', 'ollama', 'gemma4:31b')
ON CONFLICT (capability_slug, role) DO NOTHING;

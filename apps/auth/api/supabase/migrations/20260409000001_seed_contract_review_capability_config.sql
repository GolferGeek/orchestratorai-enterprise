-- Seed per-capability model config for the contract-review capability.
-- Uses gemma4:e4b for faster iteration; can be changed to gemma4:31b
-- for production quality via the Settings UI.
INSERT INTO legal.capability_model_config (capability_slug, role, provider, model)
VALUES
  ('contract-review', 'workhorse', 'ollama', 'gemma4:e4b'),
  ('contract-review', 'thinking', 'ollama', 'gemma4:e4b')
ON CONFLICT (capability_slug, role) DO NOTHING;

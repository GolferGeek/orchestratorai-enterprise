-- Register Azure AI Foundry and Vertex AI now that both are backends.
--
-- llm_usage.provider_name is a foreign key onto llm_providers(name), and
-- LLMServiceFactory refuses to boot when a backend in providerMap has no row —
-- so these must exist before either can be selected. See
-- docs/architecture/llm-boundary.md.
--
-- Vertex AI is Google Cloud, which is a different service from Google's public
-- Gemini API registered as 'google'. Both serve Gemini models; only the
-- provider_name records which one actually ran and billed the request.

INSERT INTO public.llm_providers
  (name, display_name, api_base_url, configuration_json, is_active, is_local)
VALUES
  ('azure_foundry', 'Azure AI Foundry', NULL,
   '{"auth_type": "api_key", "endpoint_env": "AZURE_AI_FOUNDRY_ENDPOINT"}'::jsonb,
   true, false),
  ('vertex_ai', 'Vertex AI (Google Cloud)', NULL,
   '{"auth_type": "adc", "project_env": "GCP_PROJECT_ID"}'::jsonb,
   true, false)
ON CONFLICT (name) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      configuration_json = EXCLUDED.configuration_json,
      is_active = EXCLUDED.is_active,
      is_local = EXCLUDED.is_local,
      updated_at = now();

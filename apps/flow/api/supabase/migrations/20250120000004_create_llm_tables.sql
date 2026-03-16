-- =============================================================================
-- LLM PROVIDERS AND MODELS TABLES
-- =============================================================================
-- Create tables for LLM provider and model configuration
-- =============================================================================

-- Create llm_providers table
CREATE TABLE IF NOT EXISTS public.llm_providers (
    name TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    api_base_url TEXT,
    configuration_json JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create llm_models table
CREATE TABLE IF NOT EXISTS public.llm_models (
    model_name TEXT NOT NULL,
    provider_name TEXT NOT NULL,
    display_name TEXT,
    model_type TEXT DEFAULT 'text-generation',
    model_version TEXT,
    context_window INTEGER DEFAULT 4096,
    max_output_tokens INTEGER DEFAULT 2048,
    model_parameters_json JSONB DEFAULT '{}'::jsonb,
    pricing_info_json JSONB DEFAULT '{}'::jsonb,
    capabilities JSONB DEFAULT '[]'::jsonb,
    model_tier TEXT,
    speed_tier TEXT DEFAULT 'medium',
    loading_priority INTEGER DEFAULT 5,
    is_local BOOLEAN DEFAULT false,
    is_currently_loaded BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    training_data_cutoff DATE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (model_name, provider_name),
    FOREIGN KEY (provider_name) REFERENCES public.llm_providers(name) ON DELETE CASCADE
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS llm_models_provider_idx ON public.llm_models(provider_name);
CREATE INDEX IF NOT EXISTS llm_models_tier_idx ON public.llm_models(model_tier);
CREATE INDEX IF NOT EXISTS llm_models_active_idx ON public.llm_models(is_active);
CREATE INDEX IF NOT EXISTS llm_providers_active_idx ON public.llm_providers(is_active);

-- Create triggers to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_llm_providers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER llm_providers_updated_at
    BEFORE UPDATE ON public.llm_providers
    FOR EACH ROW
    EXECUTE FUNCTION update_llm_providers_updated_at();

CREATE OR REPLACE FUNCTION update_llm_models_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER llm_models_updated_at
    BEFORE UPDATE ON public.llm_models
    FOR EACH ROW
    EXECUTE FUNCTION update_llm_models_updated_at();

-- Success notification
DO $$
BEGIN
    RAISE NOTICE '================================================';
    RAISE NOTICE 'LLM tables created successfully';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Tables:';
    RAISE NOTICE '  - public.llm_providers';
    RAISE NOTICE '  - public.llm_models';
    RAISE NOTICE '================================================';
END $$;

-- =============================================================================
-- Create Human Resources Organization
-- =============================================================================

INSERT INTO public.organizations (slug, name, description, settings, created_at, updated_at)
VALUES (
    'human-resources',
    'Human Resources',
    'Human Resources department organization',
    '{}'::jsonb,
    NOW(),
    NOW()
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    settings = EXCLUDED.settings,
    updated_at = NOW();

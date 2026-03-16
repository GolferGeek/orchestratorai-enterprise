-- =============================================================================
-- USERS TABLE
-- =============================================================================
-- Create public.users table for application user metadata
-- This table is separate from auth.users (Supabase auth)
-- =============================================================================

-- Create users table in public schema
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(255),
    role VARCHAR(50) NOT NULL DEFAULT 'user',
    roles JSONB NOT NULL DEFAULT '["user"]'::jsonb,
    namespace_access JSONB NOT NULL DEFAULT '[]'::jsonb,
    organization_slug VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS users_email_idx ON public.users(email);
CREATE INDEX IF NOT EXISTS users_organization_slug_idx ON public.users(organization_slug);
CREATE INDEX IF NOT EXISTS users_status_idx ON public.users(status);
CREATE INDEX IF NOT EXISTS users_role_idx ON public.users(role);

-- Add foreign key to organizations table
ALTER TABLE public.users
    ADD CONSTRAINT users_organization_slug_fkey
    FOREIGN KEY (organization_slug)
    REFERENCES public.organizations(slug)
    ON DELETE SET NULL;

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION update_users_updated_at();

-- Success notification
DO $$
BEGIN
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Users table created successfully';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Table: public.users';
    RAISE NOTICE 'Columns:';
    RAISE NOTICE '  - id (UUID, primary key, references auth.users)';
    RAISE NOTICE '  - email (varchar, unique)';
    RAISE NOTICE '  - display_name (varchar)';
    RAISE NOTICE '  - role (varchar, default: user)';
    RAISE NOTICE '  - roles (jsonb array)';
    RAISE NOTICE '  - namespace_access (jsonb array)';
    RAISE NOTICE '  - organization_slug (varchar, references organizations)';
    RAISE NOTICE '  - status (varchar, default: active)';
    RAISE NOTICE '  - created_at (timestamptz)';
    RAISE NOTICE '  - updated_at (timestamptz with auto-update trigger)';
    RAISE NOTICE '================================================';
END $$;

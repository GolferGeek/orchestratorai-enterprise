-- Phase 2 scaffold: internal identity mapping table
-- Maps external identity (issuer + subject) to internal auth.users id
-- Made idempotent: skips if the relation already exists as a view (from later authz migration)

DO $$
BEGIN
  -- Only create table + index if public.auth_identity_links doesn't exist at all
  -- OR if it exists as a table (not a view). If it's already a view pointing to authz,
  -- skip everything — a later migration already moved it.
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'auth_identity_links'
  ) THEN
    CREATE TABLE public.auth_identity_links (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      issuer TEXT NOT NULL,
      subject TEXT NOT NULL,
      email TEXT,
      raw_claims JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (issuer, subject)
    );

    CREATE INDEX IF NOT EXISTS idx_auth_identity_links_user_id
      ON public.auth_identity_links(user_id);

    CREATE TRIGGER auth_identity_links_updated_at
      BEFORE UPDATE ON public.auth_identity_links
      FOR EACH ROW
      EXECUTE FUNCTION public.update_auth_identity_links_updated_at();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.update_auth_identity_links_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.rbac_find_user_id_by_identity(
  p_issuer TEXT,
  p_subject TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT user_id
    INTO v_user_id
  FROM public.auth_identity_links
  WHERE issuer = p_issuer
    AND subject = p_subject
  LIMIT 1;

  RETURN v_user_id;
END;
$$;

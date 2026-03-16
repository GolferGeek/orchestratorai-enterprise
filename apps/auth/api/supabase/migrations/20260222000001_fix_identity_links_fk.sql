-- Fix auth_identity_links FK to reference authz.users instead of auth.users
-- This allows external IdP users (Azure OIDC, Auth0) whose UUIDs are generated
-- by the application rather than Supabase Auth.
ALTER TABLE authz.auth_identity_links
  DROP CONSTRAINT IF EXISTS auth_identity_links_user_id_fkey;

ALTER TABLE authz.auth_identity_links
  ADD CONSTRAINT auth_identity_links_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES authz.users(id) ON DELETE CASCADE;

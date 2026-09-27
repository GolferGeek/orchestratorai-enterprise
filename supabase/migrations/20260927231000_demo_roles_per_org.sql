-- Demo people in every department org (org effort Phase 1). Switching orgs
-- should show a department someone actually works in: the demo persona is a
-- member of each, the admin persona administers each (model profiles,
-- improvement queue, triggers are per-org settings).
INSERT INTO authz.rbac_user_org_roles (user_id, organization_slug, role_id)
SELECT u.id, o.slug, r.id
FROM auth.users u
CROSS JOIN (VALUES ('finance'), ('human-resources'), ('marketing'), ('engineering'), ('corporate')) AS o(slug)
JOIN authz.rbac_roles r ON r.name = CASE u.email WHEN 'demo-user@orchestratorai.io' THEN 'member' ELSE 'admin' END
WHERE u.email IN ('demo-user@orchestratorai.io', 'admin-user@orchestratorai.io')
  AND NOT EXISTS (
    SELECT 1 FROM authz.rbac_user_org_roles x
    WHERE x.user_id = u.id AND x.organization_slug = o.slug AND x.role_id = r.id
  );

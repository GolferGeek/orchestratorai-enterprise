-- The login page offers two personas: Demo and Admin. Demo is a member of each
-- organization; everything administrative belongs to the Admin persona.
--
-- 1. demo-user held admin in '*' (every organization) on the Studio, and
--    20260716150000 grants it super-admin in '*' on any database built from
--    it (20260716164500 removed only that). Drop every '*' role it holds;
--    its member role in each organization stays.
-- 2. The admin role had most of its permissions twice. rbac_role_permissions'
--    unique key includes resource_type and resource_id, which are null for a
--    role-wide grant, and nulls are distinct, so duplicates got in. Remove
--    them, and make the key treat nulls as equal.
BEGIN;

DELETE FROM authz.rbac_user_org_roles user_role
USING authz.users app_user
WHERE user_role.user_id = app_user.id
  AND app_user.email = 'demo-user@orchestratorai.io'
  AND user_role.organization_slug = '*';

DELETE FROM authz.rbac_role_permissions duplicate
USING authz.rbac_role_permissions kept
WHERE duplicate.role_id = kept.role_id
  AND duplicate.permission_id = kept.permission_id
  AND duplicate.resource_type IS NOT DISTINCT FROM kept.resource_type
  AND duplicate.resource_id IS NOT DISTINCT FROM kept.resource_id
  AND duplicate.id > kept.id;

ALTER TABLE authz.rbac_role_permissions
  DROP CONSTRAINT rbac_role_permissions_role_id_permission_id_resource_type_r_key;
ALTER TABLE authz.rbac_role_permissions
  ADD CONSTRAINT rbac_role_permissions_unique_grant
  UNIQUE NULLS NOT DISTINCT (role_id, permission_id, resource_type, resource_id);

COMMIT;

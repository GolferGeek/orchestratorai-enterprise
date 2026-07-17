-- Move Josh's restored role assignment from the retired golfergeek slug to Engineering.
-- His user profile already belongs to engineering, and golfergeek is no longer a platform organization.

WITH target_assignments AS (
  SELECT user_roles.user_id, user_roles.role_id
  FROM authz.rbac_user_org_roles user_roles
  INNER JOIN authz.users users ON users.id = user_roles.user_id
  WHERE users.email = 'josh@orchestratorai.io'
    AND user_roles.organization_slug = 'golfergeek'
)
INSERT INTO authz.rbac_user_org_roles (user_id, organization_slug, role_id)
SELECT target_assignments.user_id, 'engineering', target_assignments.role_id
FROM target_assignments
ON CONFLICT (user_id, organization_slug, role_id) DO NOTHING;

DELETE FROM authz.rbac_user_org_roles user_roles
USING authz.users users
WHERE user_roles.user_id = users.id
  AND users.email = 'josh@orchestratorai.io'
  AND user_roles.organization_slug = 'golfergeek';

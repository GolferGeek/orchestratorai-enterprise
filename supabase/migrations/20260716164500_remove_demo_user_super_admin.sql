-- Demo User should remain a global admin for demo operations, but must not be
-- a Super Administrator. Admin User and GolferGeek retain super-admin access.
delete from authz.rbac_user_org_roles user_role
using authz.users app_user, authz.rbac_roles role
where user_role.user_id = app_user.id
  and user_role.role_id = role.id
  and app_user.email = 'demo-user@orchestratorai.io'
  and user_role.organization_slug = '*'
  and role.name = 'super-admin';
